// debug_host.c - FULL SCRAPER HOST WITH FILE SAVING
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <time.h>
#include <pthread.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>

#define SOCKET_PATH    "/tmp/scraper.sock"
#define MAX_MSG        (5 * 1024 * 1024)
#define MAX_CLIENTS    4

// ── Dynamic paths — set at runtime from $SCRAPPER_DIR or $HOME ───────────────
static char BASE_DIR[512];
static char LOG_FILE[512];
static char DATA_DIR[512];
static char REQUESTS_FILE[512];
static char RESPONSES_FILE[512];
static char BODIES_FILE[512];
static char AUTH_FILE[512];
static char COOKIES_FILE[512];
static char WS_FILE[512];
static char DOMMAP_FILE[512];
static char STORAGE_FILE[512];
static char FINGERPRINT_FILE[512];

void init_paths(void) {
    // Prefer $SCRAPPER_DIR, fall back to $HOME/.scrapper
    const char *base = getenv("SCRAPPER_DIR");
    if (!base || strlen(base) == 0) {
        const char *home = getenv("HOME");
        if (!home || strlen(home) == 0) home = "/tmp";
        snprintf(BASE_DIR, sizeof(BASE_DIR), "%s/.scrapper", home);
    } else {
        snprintf(BASE_DIR, sizeof(BASE_DIR), "%s", base);
    }

    snprintf(LOG_FILE,         sizeof(LOG_FILE),         "%s/logs/debug_host.log",      BASE_DIR);
    snprintf(DATA_DIR,         sizeof(DATA_DIR),          "%s/data",                     BASE_DIR);
    snprintf(REQUESTS_FILE,    sizeof(REQUESTS_FILE),     "%s/data/requests.jsonl",      BASE_DIR);
    snprintf(RESPONSES_FILE,   sizeof(RESPONSES_FILE),    "%s/data/responses.jsonl",     BASE_DIR);
    snprintf(BODIES_FILE,      sizeof(BODIES_FILE),       "%s/data/bodies.jsonl",        BASE_DIR);
    snprintf(AUTH_FILE,        sizeof(AUTH_FILE),         "%s/data/auth.jsonl",          BASE_DIR);
    snprintf(COOKIES_FILE,     sizeof(COOKIES_FILE),      "%s/data/cookies.jsonl",       BASE_DIR);
    snprintf(WS_FILE,          sizeof(WS_FILE),           "%s/data/websockets.jsonl",    BASE_DIR);
    snprintf(DOMMAP_FILE,      sizeof(DOMMAP_FILE),       "%s/data/dommaps.jsonl",       BASE_DIR);
    snprintf(STORAGE_FILE,     sizeof(STORAGE_FILE),      "%s/data/storage.jsonl",       BASE_DIR);
    snprintf(FINGERPRINT_FILE, sizeof(FINGERPRINT_FILE),  "%s/data/fingerprints.jsonl",  BASE_DIR);
}

void mkdir_p(const char *path) {
    char tmp[512];
    snprintf(tmp, sizeof(tmp), "%s", path);
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            mkdir(tmp, 0755);
            *p = '/';
        }
    }
    mkdir(tmp, 0755);
}

// ── Mutexes & CLI state ───────────────────────────────────────────────────────
static pthread_mutex_t send_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t file_mutex = PTHREAD_MUTEX_INITIALIZER;
static int cli_clients[MAX_CLIENTS];
static int cli_count = 0;
static pthread_mutex_t cli_mutex = PTHREAD_MUTEX_INITIALIZER;

// ── Logging ───────────────────────────────────────────────────────────────────
void write_log(const char *msg) {
    FILE *f = fopen(LOG_FILE, "a");
    if (!f) return;
    fprintf(f, "[%ld] %s\n", (long)time(NULL), msg);
    fflush(f);
    fclose(f);
}

// ── File saving ───────────────────────────────────────────────────────────────
void save_to_file(const char *filepath, const char *json) {
    pthread_mutex_lock(&file_mutex);
    FILE *f = fopen(filepath, "a");
    if (f) { fprintf(f, "%s\n", json); fflush(f); fclose(f); }
    pthread_mutex_unlock(&file_mutex);
}

// ── CLI broadcast ─────────────────────────────────────────────────────────────
void broadcast_to_cli(const char *line) {
    pthread_mutex_lock(&cli_mutex);
    for (int i = 0; i < cli_count; i++) {
        send(cli_clients[i], line, strlen(line), MSG_NOSIGNAL);
        send(cli_clients[i], "\n", 1, MSG_NOSIGNAL);
    }
    pthread_mutex_unlock(&cli_mutex);
}

void remove_cli_client(int fd) {
    pthread_mutex_lock(&cli_mutex);
    for (int i = 0; i < cli_count; i++) {
        if (cli_clients[i] == fd) {
            close(fd);
            cli_clients[i] = cli_clients[--cli_count];
            break;
        }
    }
    pthread_mutex_unlock(&cli_mutex);
}

// ── Native messaging I/O ──────────────────────────────────────────────────────
int send_message(const char *msg) {
    if (!msg) return -1;
    uint32_t len = (uint32_t)strlen(msg);
    if (len > MAX_MSG) { write_log("ERROR: msg too large"); return -1; }
    pthread_mutex_lock(&send_mutex);
    fwrite(&len, 4, 1, stdout);
    fwrite(msg, 1, len, stdout);
    fflush(stdout);
    pthread_mutex_unlock(&send_mutex);
    char buf[256];
    snprintf(buf, sizeof(buf), "SENT: %.200s", msg);
    write_log(buf);
    return 0;
}

char *receive_message() {
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
            fread(tmp, 1, n, stdin);
            left -= (uint32_t)n;
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

// ── JSON helper ───────────────────────────────────────────────────────────────
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

// ── Message router ────────────────────────────────────────────────────────────
void route_message(const char *msg) {
    char type[64];
    json_get_str(msg, "type", type, sizeof(type));

    if (strcmp(type, "request") == 0) {
        save_to_file(REQUESTS_FILE, msg);
        char url[256], method[16], flags[256];
        json_get_str(msg, "url",    url,    sizeof(url));
        json_get_str(msg, "method", method, sizeof(method));
        const char *fp = strstr(msg, "\"flags\":[");
        snprintf(flags, sizeof(flags), "%s", fp ? fp : "");
        char line[600];
        snprintf(line, sizeof(line), "🌐 %s %s  %s", method, url, flags);
        broadcast_to_cli(line);
        write_log(line);
    }
    else if (strcmp(type, "response") == 0) {
        save_to_file(RESPONSES_FILE, msg);
        char url[256], status[8];
        json_get_str(msg, "url",    url,    sizeof(url));
        json_get_str(msg, "status", status, sizeof(status));
        char line[400];
        snprintf(line, sizeof(line), "📥 %s %s", status, url);
        broadcast_to_cli(line);
        write_log(line);
    }
    else if (strcmp(type, "response_body") == 0) {
        save_to_file(BODIES_FILE, msg);
        char url[256]; json_get_str(msg, "url", url, sizeof(url));
        char line[400]; snprintf(line, sizeof(line), "📦 BODY %s", url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "auth_cookie") == 0) {
        save_to_file(AUTH_FILE, msg);
        char name[64], domain[128];
        json_get_str(msg, "name",   name,   sizeof(name));
        json_get_str(msg, "domain", domain, sizeof(domain));
        char line[300];
        snprintf(line, sizeof(line), "🔑 AUTH COOKIE %s @ %s", name, domain);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "cookies") == 0) {
        save_to_file(COOKIES_FILE, msg);
        char line[300];
        snprintf(line, sizeof(line), "🍪 COOKIES SAVED → %s", COOKIES_FILE);
        broadcast_to_cli(line);
    }
    else if (strcmp(type, "cookies_changed") == 0) {
        save_to_file(COOKIES_FILE, msg);
    }
    else if (strcmp(type, "websocket") == 0) {
        save_to_file(WS_FILE, msg);
        broadcast_to_cli("🔌 WEBSOCKET frame saved");
    }
    else if (strcmp(type, "dommap") == 0) {
        save_to_file(DOMMAP_FILE, msg);
        char dom[128]; json_get_str(msg, "domain", dom, sizeof(dom));
        char url[256]; json_get_str(msg, "url",    url, sizeof(url));
        char line[400];
        snprintf(line, sizeof(line), "🗺️  DOM MAP %s → %s", dom, url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "storage") == 0) {
        save_to_file(STORAGE_FILE, msg);
        broadcast_to_cli("💾 STORAGE SAVED → storage.jsonl");
    }
    else if (strcmp(type, "fingerprint") == 0) {
        save_to_file(FINGERPRINT_FILE, msg);
        char dom[128]; json_get_str(msg, "domain", dom, sizeof(dom));
        char line[300];
        snprintf(line, sizeof(line), "🖥️  FINGERPRINT captured @ %s", dom);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "html") == 0) {
        char path[512];
        snprintf(path, sizeof(path), "%s/html_%ld.json", DATA_DIR, (long)time(NULL));
        save_to_file(path, msg);
        char line[300];
        snprintf(line, sizeof(line), "📄 HTML SAVED → %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "screenshot") == 0) {
        char path[512];
        snprintf(path, sizeof(path), "%s/screenshot_%ld.json", DATA_DIR, (long)time(NULL));
        save_to_file(path, msg);
        char line[300];
        snprintf(line, sizeof(line), "📷 SCREENSHOT SAVED → %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "debugger_status") == 0) {
        char status[32]; json_get_str(msg, "status", status, sizeof(status));
        char line[128];
        snprintf(line, sizeof(line), "🔬 DEBUGGER %s", status);
        broadcast_to_cli(line); write_log(line);
    }
    else {
        char log[256];
        snprintf(log, sizeof(log), "UNKNOWN type: %.200s", msg);
        write_log(log);
    }
}

// ── Browser message handler ───────────────────────────────────────────────────
void handle_browser_message(const char *msg) {
    if (strstr(msg, "\"command\":\"ping\"")) {
        char r[128];
        snprintf(r, sizeof(r), "{\"command\":\"pong\",\"timestamp\":%ld}", (long)time(NULL));
        send_message(r);
        return;
    }
    if (strstr(msg, "\"command\":\"register\"")) {
        send_message("{\"status\":\"registered\",\"browser\":\"brave\"}");
        broadcast_to_cli("✅ Browser registered");
        return;
    }
    route_message(msg);
}

// ── CLI client thread ─────────────────────────────────────────────────────────
void *cli_client_thread(void *arg) {
    int fd = *(int *)arg; free(arg);
    char banner[1024];
    snprintf(banner, sizeof(banner),
        "\n=== SCRAPPER CLI ===\n"
        "  Data dir: %s\n"
        "  nav <url>       - Open + track all requests\n"
        "  navigate <url>  - Same as nav\n"
        "  track           - Track active tab\n"
        "  untrack         - Stop tracking\n"
        "  cookies         - Dump cookies\n"
        "  storage         - Dump localStorage/sessionStorage\n"
        "  html            - Get page HTML\n"
        "  screenshot      - Capture screenshot\n"
        "  fingerprint     - Capture browser fingerprint\n"
        "  dommap          - Map DOM\n"
        "  files           - Show data files\n"
        "  quit            - Exit\n> ",
        DATA_DIR);
    send(fd, banner, strlen(banner), MSG_NOSIGNAL);

    char line[512]; int pos = 0;
    while (1) {
        char c; ssize_t n = recv(fd, &c, 1, 0);
        if (n <= 0) break;
        if (c == '\n' || c == '\r') {
            if (pos == 0) { send(fd, "> ", 2, MSG_NOSIGNAL); continue; }
            line[pos] = '\0'; pos = 0;
            char cmd[600] = {0}, reply[512] = {0};

            if (strncmp(line, "nav ", 4) == 0) {
                snprintf(cmd, sizeof(cmd), "{\"command\":\"navigate\",\"url\":\"%s\"}", line + 4);
                send_message(cmd);
                char logbuf[300]; snprintf(logbuf, sizeof(logbuf), "NAV: %s", line + 4);
                write_log(logbuf);
                snprintf(reply, sizeof(reply), "Navigating to %s\n> ", line + 4);

            } else if (strncmp(line, "navigate ", 9) == 0) {
                snprintf(cmd, sizeof(cmd), "{\"command\":\"navigate\",\"url\":\"%s\"}", line + 9);
                send_message(cmd);
                char logbuf[300]; snprintf(logbuf, sizeof(logbuf), "NAVIGATE: %s", line + 9);
                write_log(logbuf);
                snprintf(reply, sizeof(reply), "Navigating to %s\n> ", line + 9);

            } else if (strcmp(line, "track") == 0) {
                send_message("{\"command\":\"track\"}");
                write_log("CMD: track");
                snprintf(reply, sizeof(reply), "Tracking active tab\n> ");

            } else if (strcmp(line, "untrack") == 0) {
                send_message("{\"command\":\"untrack\"}");
                write_log("CMD: untrack");
                snprintf(reply, sizeof(reply), "Stopped tracking\n> ");

            } else if (strcmp(line, "cookies") == 0) {
                send_message("{\"command\":\"get_cookies\"}");
                write_log("CMD: get_cookies");
                snprintf(reply, sizeof(reply), "Fetching cookies...\n> ");

            } else if (strcmp(line, "storage") == 0) {
                send_message("{\"command\":\"get_storage\"}");
                write_log("CMD: get_storage");
                snprintf(reply, sizeof(reply), "Fetching storage...\n> ");

            } else if (strcmp(line, "html") == 0) {
                send_message("{\"command\":\"get_html\"}");
                write_log("CMD: get_html");
                snprintf(reply, sizeof(reply), "Fetching HTML...\n> ");

            } else if (strcmp(line, "fingerprint") == 0) {
                send_message("{\"command\":\"fingerprint\"}");
                write_log("CMD: fingerprint");
                snprintf(reply, sizeof(reply), "Capturing fingerprint...\n> ");

            } else if (strcmp(line, "dommap") == 0) {
                send_message("{\"command\":\"dommap\"}");
                write_log("CMD: dommap");
                snprintf(reply, sizeof(reply), "Mapping DOM...\n> ");

            } else if (strcmp(line, "screenshot") == 0) {
                send_message("{\"command\":\"screenshot\"}");
                write_log("CMD: screenshot");
                snprintf(reply, sizeof(reply), "Taking screenshot...\n> ");

            } else if (strcmp(line, "files") == 0) {
                char out[1024];
                snprintf(out, sizeof(out),
                    "Data in %s:\n"
                    "  requests.jsonl     - Flagged requests\n"
                    "  responses.jsonl    - Flagged responses\n"
                    "  bodies.jsonl       - API response bodies\n"
                    "  auth.jsonl         - Auth cookies\n"
                    "  cookies.jsonl      - All cookies\n"
                    "  websockets.jsonl   - WebSocket frames\n"
                    "  fingerprints.jsonl - Browser fingerprints\n"
                    "  html_*.json        - Saved HTML\n> ", DATA_DIR);
                send(fd, out, strlen(out), MSG_NOSIGNAL); continue;

            } else if (strcmp(line, "quit") == 0 || strcmp(line, "exit") == 0) {
                send(fd, "Bye\n", 4, MSG_NOSIGNAL); break;

            } else {
                char logbuf[300];
                snprintf(logbuf, sizeof(logbuf), "UNKNOWN CMD: %s", line);
                write_log(logbuf);
                snprintf(reply, sizeof(reply), "Unknown command: %s\n> ", line);
            }

            if (strlen(reply)) send(fd, reply, strlen(reply), MSG_NOSIGNAL);
        } else {
            if (pos < (int)sizeof(line) - 1) line[pos++] = c;
        }
    }
    remove_cli_client(fd);
    write_log("CLI client disconnected");
    return NULL;
}

// ── Socket server thread ──────────────────────────────────────────────────────
void *socket_server_thread(void *arg) {
    (void)arg;
    unlink(SOCKET_PATH);
    int server = socket(AF_UNIX, SOCK_STREAM, 0);
    if (server < 0) { write_log("ERROR: socket"); return NULL; }
    struct sockaddr_un addr = {0};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);
    if (bind(server, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        write_log("ERROR: bind"); close(server); return NULL;
    }
    listen(server, MAX_CLIENTS);
    write_log("Socket ready: " SOCKET_PATH);
    while (1) {
        int client = accept(server, NULL, NULL);
        if (client < 0) continue;
        pthread_mutex_lock(&cli_mutex);
        if (cli_count < MAX_CLIENTS) {
            cli_clients[cli_count++] = client;
            pthread_mutex_unlock(&cli_mutex);
            write_log("CLI connected");
            pthread_t t; int *fdp = malloc(sizeof(int)); *fdp = client;
            pthread_create(&t, NULL, cli_client_thread, fdp);
            pthread_detach(t);
        } else {
            pthread_mutex_unlock(&cli_mutex);
            send(client, "Server full\n", 12, 0); close(client);
        }
    }
    return NULL;
}

// ── Main ──────────────────────────────────────────────────────────────────────
int main(void) {
    // Init paths first — everything depends on this
    init_paths();

    // Create required directories
    char logs_dir[512];
    snprintf(logs_dir, sizeof(logs_dir), "%s/logs", BASE_DIR);
    mkdir_p(logs_dir);
    mkdir_p(DATA_DIR);

    // Init log file
    FILE *f = fopen(LOG_FILE, "w");
    if (f) {
        fprintf(f, "=== SCRAPPER HOST ===\nPID: %d\nBase: %s\n", getpid(), BASE_DIR);
        fclose(f);
    }

    setbuf(stdin,  NULL);
    setbuf(stdout, NULL);
    setbuf(stderr, NULL);

    write_log("Starting");
    fprintf(stderr, "🟢 SCRAPPER host PID %d — base: %s\n", getpid(), BASE_DIR);

    pthread_t t;
    pthread_create(&t, NULL, socket_server_thread, NULL);
    pthread_detach(t);

    while (1) {
        char *msg = receive_message();
        if (!msg) { if (feof(stdin)) break; continue; }
        handle_browser_message(msg);
        free(msg);
    }

    unlink(SOCKET_PATH);
    write_log("Exiting");
    return 0;
}