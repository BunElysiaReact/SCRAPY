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

#define LOG_FILE       "/home/PeaseErnest/scraper/logs/debug_host.log"
#define DATA_DIR       "/home/PeaseErnest/scraper/data"
#define REQUESTS_FILE  "/home/PeaseErnest/scraper/data/requests.jsonl"
#define RESPONSES_FILE "/home/PeaseErnest/scraper/data/responses.jsonl"
#define BODIES_FILE    "/home/PeaseErnest/scraper/data/bodies.jsonl"
#define AUTH_FILE      "/home/PeaseErnest/scraper/data/auth.jsonl"
#define COOKIES_FILE   "/home/PeaseErnest/scraper/data/cookies.jsonl"
#define WS_FILE        "/home/PeaseErnest/scraper/data/websockets.jsonl"
#define DOMMAP_FILE    "/home/PeaseErnest/scraper/data/dommaps.jsonl"
#define SOCKET_PATH    "/tmp/scraper.sock"
#define MAX_MSG        (5 * 1024 * 1024)
#define MAX_CLIENTS    4

static pthread_mutex_t send_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t file_mutex = PTHREAD_MUTEX_INITIALIZER;
static int cli_clients[MAX_CLIENTS];
static int cli_count = 0;
static pthread_mutex_t cli_mutex = PTHREAD_MUTEX_INITIALIZER;

void write_log(const char *msg) {
    FILE *f = fopen(LOG_FILE, "a");
    if (!f) return;
    fprintf(f, "[%ld] %s\n", (long)time(NULL), msg);
    fflush(f); fclose(f);
}

void save_to_file(const char *filepath, const char *json) {
    pthread_mutex_lock(&file_mutex);
    FILE *f = fopen(filepath, "a");
    if (f) { fprintf(f, "%s\n", json); fflush(f); fclose(f); }
    pthread_mutex_unlock(&file_mutex);
}

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

// Extract a string field value from JSON (simple, no lib needed)
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
        char line[300]; snprintf(line, sizeof(line), "🔑 AUTH COOKIE %s @ %s", name, domain);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "cookies") == 0) {
        save_to_file(COOKIES_FILE, msg);
        broadcast_to_cli("🍪 COOKIES SAVED → " COOKIES_FILE);
    }
    else if (strcmp(type, "cookies_changed") == 0) {
        save_to_file(COOKIES_FILE, msg);
        // no CLI spam
    }
    else if (strcmp(type, "websocket") == 0) {
        save_to_file(WS_FILE, msg);
        broadcast_to_cli("🔌 WEBSOCKET frame saved");
    }
    else if (strcmp(type, "dommap") == 0) {
        save_to_file(DOMMAP_FILE, msg);
        char dom[128]; json_get_str(msg, "domain", dom, sizeof(dom));
        char url[256]; json_get_str(msg, "url",    url, sizeof(url));
        char line[400]; snprintf(line, sizeof(line), "🗺️  DOM MAP %s → %s", dom, url);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "storage") == 0) {
        save_to_file(AUTH_FILE, msg);
        broadcast_to_cli("💾 STORAGE SAVED (auth.jsonl) — check for tokens!");
    }
    else if (strcmp(type, "html") == 0) {
        char path[256];
        snprintf(path, sizeof(path), DATA_DIR "/html_%ld.json", (long)time(NULL));
        save_to_file(path, msg);
        char line[300]; snprintf(line, sizeof(line), "📄 HTML SAVED → %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "screenshot") == 0) {
        char path[256];
        snprintf(path, sizeof(path), DATA_DIR "/screenshot_%ld.json", (long)time(NULL));
        save_to_file(path, msg);
        char line[300]; snprintf(line, sizeof(line), "📷 SCREENSHOT SAVED → %s", path);
        broadcast_to_cli(line); write_log(line);
    }
    else if (strcmp(type, "debugger_status") == 0) {
        char status[32]; json_get_str(msg, "status", status, sizeof(status));
        char line[128]; snprintf(line, sizeof(line), "🔬 DEBUGGER %s", status);
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
        broadcast_to_cli("✅ Browser registered");
        return;
    }
    route_message(msg);
}

void *cli_client_thread(void *arg) {
    int fd = *(int *)arg; free(arg);
    const char *banner =
        "\n=== Scraper CLI ===\n"
        "  nav <url>   - Open + track all requests\n"
        "  track       - Track active tab\n"
        "  untrack     - Stop tracking\n"
        "  cookies     - Dump cookies\n"
        "  storage     - Dump localStorage/sessionStorage\n"
        "  html        - Get page HTML\n"
        "  screenshot  - Capture screenshot\n"
        "  files       - Show data files\n"
        "  quit        - Exit\n> ";
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
                snprintf(cmd, sizeof(cmd), "{\"command\":\"navigate\",\"url\":\"%s\"}", line+4);
                send_message(cmd);
                snprintf(reply, sizeof(reply), "Navigating to %s\n> ", line+4);
            } else if (strcmp(line, "track") == 0) {
                send_message("{\"command\":\"track\"}");
                snprintf(reply, sizeof(reply), "Tracking active tab\n> ");
            } else if (strcmp(line, "untrack") == 0) {
                send_message("{\"command\":\"untrack\"}");
                snprintf(reply, sizeof(reply), "Stopped tracking\n> ");
            } else if (strcmp(line, "cookies") == 0) {
                send_message("{\"command\":\"get_cookies\",\"url\":\"current\"}");
                snprintf(reply, sizeof(reply), "Fetching cookies...\n> ");
            } else if (strcmp(line, "storage") == 0) {
                send_message("{\"command\":\"get_storage\"}");
                snprintf(reply, sizeof(reply), "Fetching storage...\n> ");
            } else if (strcmp(line, "html") == 0) {
                send_message("{\"command\":\"get_html\"}");
                snprintf(reply, sizeof(reply), "Fetching HTML...\n> ");
            } else if (strcmp(line, "screenshot") == 0) {
                send_message("{\"command\":\"screenshot\"}");
                snprintf(reply, sizeof(reply), "Taking screenshot...\n> ");
            } else if (strcmp(line, "files") == 0) {
                char out[1024];
                snprintf(out, sizeof(out),
                    "Data in %s:\n"
                    "  requests.jsonl   - Flagged requests (auth, API, POST)\n"
                    "  responses.jsonl  - Flagged responses\n"
                    "  bodies.jsonl     - API response bodies\n"
                    "  auth.jsonl       - Auth cookies + localStorage\n"
                    "  cookies.jsonl    - All cookies\n"
                    "  websockets.jsonl - WebSocket frames\n"
                    "  html_*.json      - Saved HTML\n> ", DATA_DIR);
                send(fd, out, strlen(out), MSG_NOSIGNAL); continue;
            } else if (strcmp(line, "quit") == 0 || strcmp(line, "exit") == 0) {
                send(fd, "Bye\n", 4, MSG_NOSIGNAL); break;
            } else {
                snprintf(reply, sizeof(reply), "Unknown command\n> ");
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

int main(void) {
    system("mkdir -p /home/PeaseErnest/scraper/logs");
    system("mkdir -p " DATA_DIR);
    FILE *f = fopen(LOG_FILE, "w");
    if (f) { fprintf(f, "=== SCRAPER HOST ===\nPID: %d\n", getpid()); fclose(f); }
    setbuf(stdin, NULL); setbuf(stdout, NULL); setbuf(stderr, NULL);
    write_log("Starting");
    fprintf(stderr, "🟢 Scraper host PID %d — ./scraper_cli to connect\n", getpid());
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