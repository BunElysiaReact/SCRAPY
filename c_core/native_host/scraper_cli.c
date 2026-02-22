// scraper_cli.c - Terminal client for the running debug_host
// Compile: gcc -o scraper_cli scraper_cli.c
// Usage:   ./scraper_cli

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <sys/un.h>

#define SOCKET_PATH "/tmp/scraper.sock"

static int sock_fd = -1;

// Thread: print everything the host sends us
void *reader_thread(void *arg) {
    (void)arg;
    char buf[4096];
    while (1) {
        ssize_t n = recv(sock_fd, buf, sizeof(buf) - 1, 0);
        if (n <= 0) {
            printf("\n[Disconnected from host]\n");
            exit(0);
        }
        buf[n] = '\0';
        printf("%s", buf);
        fflush(stdout);
    }
    return NULL;
}

int main(void) {
    sock_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock_fd < 0) { perror("socket"); return 1; }

    struct sockaddr_un addr = {0};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);

    if (connect(sock_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        fprintf(stderr,
            "Cannot connect to %s\n"
            "Is debug_host running? (Brave must have the extension active)\n",
            SOCKET_PATH);
        return 1;
    }

    // Background thread reads responses from host
    pthread_t t;
    pthread_create(&t, NULL, reader_thread, NULL);
    pthread_detach(t);

    // Main thread sends user input
    char line[512];
    while (fgets(line, sizeof(line), stdin)) {
        send(sock_fd, line, strlen(line), 0);
    }

    close(sock_fd);
    return 0;
}