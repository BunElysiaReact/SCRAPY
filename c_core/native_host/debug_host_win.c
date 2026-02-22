// debug_host_win.c - SCRAPY native host for Windows
// Uses Windows named pipes instead of Unix domain sockets
// Compile: x86_64-w64-mingw32-gcc -o debug_host.exe debug_host_win.c -lpthread -lws2_32 -D_WIN32_WINNT=0x0600

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <windows.h>
#include <process.h>  // _beginthreadex

#define PIPE_NAME      "\\\\.\\pipe\\scraper"
#define LOG_FILE       "logs\\debug_host.log"
#define DATA_DIR       "data"
#define REQUESTS_FILE  "data\\requests.jsonl"
#define RESPONSES_FILE "data\\responses.jsonl"
#define BODIES_FILE    "data\\bodies.jsonl"
#define AUTH_FILE      "data\\auth.jsonl"
#define COOKIES_FILE   "data\\cookies.jsonl"
#define WS_FILE        "data\\websockets.jsonl"
#define DOMMAP_FILE    "data\\dommaps.jsonl"
#define MAX_MSG        (5 * 1024 * 1024)
#define MAX_CLIENTS    4

static CRITICAL_SECTION send_cs;
static CRITICAL_SECTION file_cs;
static CRITICAL_SECTION cli_cs;

static HANDLE cli_pipes[MAX_CLIENTS];
static int    cli_count = 0;

// ── Logging ──────────────────────────────────────────────────
void write_log(const char *msg) {
    FILE *f = fopen(LOG_FILE, "a");
    if (!f) return;
    fprintf(f, "[%ld] %s\n", (long)time(NULL), msg);
    fflush(f); fclose(f);
}

// ── File saving ──────────────────────────────────────────────
void save_to_file(const char *filepath, const char *json) {
    EnterCriticalSection(&file_cs);
    FILE *f = fopen(filepath, "a");
    if (f) { fprintf(f, "%s\n", json); fflush(f); fclose(f); }
    LeaveCriticalSection(&file_cs);
}

// ── Pipe broadcast ───────────────────────────────────────────
void broadcast_to_cli(const char *line) {
    EnterCriticalSection(&cli_cs);
    DWORD written;
    for (int i = 0; i < cli_count; i++) {
        WriteFile(cli_pipes[i], line, (DWORD)strlen(line), &written, NULL);
        WriteFile(cli_pipes[i], "\n", 1, &written, NULL);
    }
    LeaveCriticalSection(&cli_cs);
}

void remove_cli_client(HANDLE pipe) {
    EnterCriticalSection(&cli_cs);
    for (int i = 0; i < cli_count; i++) {
        if (cli_pipes[i] == pipe) {
            DisconnectNamedPipe(pipe);
            CloseHandle(pipe);
            cli_pipes[i] = cli_pipes[--cli_count];
            break;
        }
    }
    LeaveCriticalSection(&cli_cs);
}

// ── Native messaging: send to browser ────────────────────────
int send_message(const char *msg) {
    if (!msg) return -1;
    uint32_t len = (uint32_t)strlen(msg);
    if (len > MAX_MSG) { write_log("ERROR: msg too large"); return -1; }
    EnterCriticalSection(&send_cs);
    fwrite(&len, 4, 1, stdout);
    fwrite(msg, 1, len, stdout);
    fflush(stdout);
    LeaveCriticalSection(&send_cs);
    char buf[256];
    snprintf(buf, sizeof(buf), "SENT: %.200s", msg);
    write_log(buf);
    return 0;
}

// ── Native messaging: receive from browser ───────────────────
char *receive_message(void) {
    uint32_t len;
    if (fread(&len, 4, 1, stdin) != 1) {
        write_log(feof(stdin) ? "Browser disconnected" : "ERROR: read len");
        return NULL;
    }
    if (len == 0 || len > MAX_MSG) {
        char err[128];
        snprintf(err, sizeof(err), "ERROR: bad length %u", len);
        write_log(err);
        char tmp[4096]; uint32_t left = len;
        while (left > 0) {
            size_t n = left > sizeof(tmp) ? sizeof(tmp) : left;
            fread(tmp, 1, n, stdin); left -= (uint32_t)n;
        }
        return NULL;
    }
    char *buf = malloc(len + 1);
    if (!buf) { write_log("ERROR: malloc"); return NULL; }
    if (fread(buf, 1, len, stdin) != len) {
        write_log("ERROR: read body"); free(buf); return NULL;
    }
    buf[len] = '\0';
    return buf;
}

// ── Simple JSON field extractor ──────────────────────────────
void json_get_str(const char *json, const char *key, char *out, size_t outlen) {
    char search[128];
    snprintf(search, sizeof(search), "\"%s\":\"", key);
    const char *p = strstr(json, search);
    if (!p) { out[0] = '\0'; return; }
    p += strlen(search);
    size_t i = 0;
    while (*p && *p != '"' && i < outlen - 1) out[i++] = *p++;
    out[i] = '\0';
}

// ── Route incoming messages ──────────────────────────────────
void route_message(const char *msg) {
    char type[64];
    json_get_str(msg, "type", type, sizeof(type));

    if (strcmp(type, "request") == 0) {
        save_to_file(REQUESTS_FILE, msg);
        char url[256], method[16];
        json_get_str(msg, "url", url, sizeof(url));
        json_get_str(msg, "method", method, sizeof(method));
        char line[400];
        snprintf(line, sizeof(line), ">> %s %s", method, url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "response") == 0) {
        save_to_file(RESPONSES_FILE, msg);
        char url[256], status[8];
        json_get_str(msg, "url", url, sizeof(url));
        json_get_str(msg, "status", status, sizeof(status));
        char line[400];
        snprintf(line, sizeof(line), "<< %s %s", status, url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "response_body") == 0) {
        save_to_file(BODIES_FILE, msg);
        char url[256]; json_get_str(msg, "url", url, sizeof(url));
        char line[400]; snprintf(line, sizeof(line), "[BODY] %s", url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "auth_cookie") == 0) {
        save_to_file(AUTH_FILE, msg);
        char name[64], domain[128];
        json_get_str(msg, "name", name, sizeof(name));
        json_get_str(msg, "domain", domain, sizeof(domain));
        char line[300]; snprintf(line, sizeof(line), "[AUTH COOKIE] %s @ %s", name, domain);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "cookies") == 0) {
        save_to_file(COOKIES_FILE, msg);
        broadcast_to_cli("[COOKIES SAVED] " COOKIES_FILE);
    }
    else if (strcmp(type, "cookies_changed") == 0) {
        save_to_file(COOKIES_FILE, msg);
    }
    else if (strcmp(type, "websocket") == 0) {
        save_to_file(WS_FILE, msg);
        broadcast_to_cli("[WS] WebSocket frame saved");
    }
    else if (strcmp(type, "dommap") == 0) {
        save_to_file(DOMMAP_FILE, msg);
        char dom[128], url[256];
        json_get_str(msg, "domain", dom, sizeof(dom));
        json_get_str(msg, "url", url, sizeof(url));
        char line[400]; snprintf(line, sizeof(line), "[DOM MAP] %s -> %s", dom, url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "storage") == 0) {
        save_to_file(AUTH_FILE, msg);
        broadcast_to_cli("[STORAGE] Saved to auth.jsonl — check for tokens!");
    }
    else if (strcmp(type, "html") == 0) {
        char path[256];
        snprintf(path, sizeof(path), DATA_DIR "\\html_%ld.json", (long)time(NULL));
        save_to_file(path, msg);
        char line[300]; snprintf(line, sizeof(line), "[HTML] Saved -> %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "screenshot") == 0) {
        char path[256];
        snprintf(path, sizeof(path), DATA_DIR "\\screenshot_%ld.json", (long)time(NULL));
        save_to_file(path, msg);
        char line[300]; snprintf(line, sizeof(line), "[SCREENSHOT] Saved -> %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "debugger_status") == 0) {
        char status[32]; json_get_str(msg, "status", status, sizeof(status));
        char line[128]; snprintf(line, sizeof(line), "[DEBUGGER] %s", status);
        broadcast_to_cli(line); write_log(line);
    }
    else {
        char log[256]; snprintf(log, sizeof(log), "UNKNOWN: %.200s", msg);
        write_log(log);
    }
}

void handle_browser_message(const char *msg) {
    if (strstr(msg, "\"command\":\"ping\"")) {
        char r[128];
        snprintf(r, sizeof(r), "{\"command\":\"pong\",\"timestamp\":%ld}", (long)time(NULL));
        send_message(r);
        return;
    }
    if (strstr(msg, "\"command\":\"register\"")) {
        send_message("{\"status\":\"registered\",\"browser\":\"brave\"}");
        broadcast_to_cli("[OK] Browser registered");
        return;
    }
    route_message(msg);
}

// ── CLI client thread (one per pipe connection) ───────────────
typedef struct { HANDLE pipe; } ClientArgs;

unsigned __stdcall cli_client_thread(void *arg) {
    HANDLE pipe = ((ClientArgs *)arg)->pipe;
    free(arg);

    const char *banner =
        "\r\n=== Scraper CLI ===\r\n"
        "  nav <url>   - Open + track all requests\r\n"
        "  track       - Track active tab\r\n"
        "  untrack     - Stop tracking\r\n"
        "  cookies     - Dump cookies\r\n"
        "  storage     - Dump localStorage/sessionStorage\r\n"
        "  html        - Get page HTML\r\n"
        "  screenshot  - Capture screenshot\r\n"
        "  files       - Show data files\r\n"
        "  quit        - Exit\r\n> ";

    DWORD written;
    WriteFile(pipe, banner, (DWORD)strlen(banner), &written, NULL);

    char line[512]; int pos = 0;
    while (1) {
        char c; DWORD nread;
        if (!ReadFile(pipe, &c, 1, &nread, NULL) || nread == 0) break;
        if (c == '\n' || c == '\r') {
            if (pos == 0) { WriteFile(pipe, "> ", 2, &written, NULL); continue; }
            line[pos] = '\0'; pos = 0;
            char cmd[600] = {0}, reply[512] = {0};

            if (strncmp(line, "nav ", 4) == 0) {
                snprintf(cmd, sizeof(cmd), "{\"command\":\"navigate\",\"url\":\"%s\"}", line + 4);
                send_message(cmd);
                snprintf(reply, sizeof(reply), "Navigating to %s\r\n> ", line + 4);
            } else if (strcmp(line, "track") == 0) {
                send_message("{\"command\":\"track\"}");
                snprintf(reply, sizeof(reply), "Tracking active tab\r\n> ");
            } else if (strcmp(line, "untrack") == 0) {
                send_message("{\"command\":\"untrack\"}");
                snprintf(reply, sizeof(reply), "Stopped tracking\r\n> ");
            } else if (strcmp(line, "cookies") == 0) {
                send_message("{\"command\":\"get_cookies\",\"url\":\"current\"}");
                snprintf(reply, sizeof(reply), "Fetching cookies...\r\n> ");
            } else if (strcmp(line, "storage") == 0) {
                send_message("{\"command\":\"get_storage\"}");
                snprintf(reply, sizeof(reply), "Fetching storage...\r\n> ");
            } else if (strcmp(line, "html") == 0) {
                send_message("{\"command\":\"get_html\"}");
                snprintf(reply, sizeof(reply), "Fetching HTML...\r\n> ");
            } else if (strcmp(line, "screenshot") == 0) {
                send_message("{\"command\":\"screenshot\"}");
                snprintf(reply, sizeof(reply), "Taking screenshot...\r\n> ");
            } else if (strcmp(line, "files") == 0) {
                char out[512];
                snprintf(out, sizeof(out),
                    "Data in .\\data\\\r\n"
                    "  requests.jsonl   - Flagged requests\r\n"
                    "  responses.jsonl  - Flagged responses\r\n"
                    "  bodies.jsonl     - API response bodies\r\n"
                    "  auth.jsonl       - Auth cookies + localStorage\r\n"
                    "  cookies.jsonl    - All cookies\r\n"
                    "  websockets.jsonl - WebSocket frames\r\n"
                    "  html_*.json      - Saved HTML\r\n> ");
                WriteFile(pipe, out, (DWORD)strlen(out), &written, NULL);
                continue;
            } else if (strcmp(line, "quit") == 0 || strcmp(line, "exit") == 0) {
                WriteFile(pipe, "Bye\r\n", 5, &written, NULL);
                break;
            } else {
                snprintf(reply, sizeof(reply), "Unknown command\r\n> ");
            }
            if (strlen(reply)) WriteFile(pipe, reply, (DWORD)strlen(reply), &written, NULL);
        } else {
            if (pos < (int)sizeof(line) - 1) line[pos++] = c;
        }
    }
    remove_cli_client(pipe);
    write_log("CLI client disconnected");
    return 0;
}

// ── Pipe server thread ────────────────────────────────────────
unsigned __stdcall pipe_server_thread(void *arg) {
    (void)arg;
    write_log("Named pipe server starting: " PIPE_NAME);

    while (1) {
        HANDLE pipe = CreateNamedPipeA(
            PIPE_NAME,
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            MAX_CLIENTS,
            65536, 65536,
            0, NULL
        );
        if (pipe == INVALID_HANDLE_VALUE) {
            write_log("ERROR: CreateNamedPipe failed");
            Sleep(1000);
            continue;
        }
        // Block until a client connects
        if (!ConnectNamedPipe(pipe, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) {
            CloseHandle(pipe);
            continue;
        }
        EnterCriticalSection(&cli_cs);
        if (cli_count < MAX_CLIENTS) {
            cli_pipes[cli_count++] = pipe;
            LeaveCriticalSection(&cli_cs);
            write_log("CLI client connected");
            ClientArgs *ca = malloc(sizeof(ClientArgs));
            ca->pipe = pipe;
            HANDLE t = (HANDLE)_beginthreadex(NULL, 0, cli_client_thread, ca, 0, NULL);
            if (t) CloseHandle(t);
        } else {
            LeaveCriticalSection(&cli_cs);
            DWORD w;
            WriteFile(pipe, "Server full\r\n", 13, &w, NULL);
            DisconnectNamedPipe(pipe);
            CloseHandle(pipe);
        }
    }
    return 0;
}

// ── Entry point ───────────────────────────────────────────────
int main(void) {
    // Create data and logs dirs relative to executable location
    CreateDirectoryA("logs", NULL);
    CreateDirectoryA("data", NULL);

    InitializeCriticalSection(&send_cs);
    InitializeCriticalSection(&file_cs);
    InitializeCriticalSection(&cli_cs);

    // Switch stdin/stdout to binary mode — critical for native messaging
    freopen(NULL, "rb", stdin);
    freopen(NULL, "wb", stdout);

    FILE *f = fopen(LOG_FILE, "w");
    if (f) { fprintf(f, "=== SCRAPY HOST (Windows) ===\nPID: %d\n", (int)GetCurrentProcessId()); fclose(f); }

    write_log("Starting");
    fprintf(stderr, "[SCRAPY] Host PID %d started -- run scraper_cli.exe to connect\n",
            (int)GetCurrentProcessId());

    // Start named pipe server in background thread
    HANDLE t = (HANDLE)_beginthreadex(NULL, 0, pipe_server_thread, NULL, 0, NULL);
    if (t) CloseHandle(t);

    // Main loop: read from browser via stdin
    while (1) {
        char *msg = receive_message();
        if (!msg) {
            if (feof(stdin)) break;
            continue;
        }
        handle_browser_message(msg);
        free(msg);
    }

    write_log("Exiting");
    DeleteCriticalSection(&send_cs);
    DeleteCriticalSection(&file_cs);
    DeleteCriticalSection(&cli_cs);
    return 0;
}