// scraper_cli_win.c - Terminal client for the running debug_host (Windows)
// Uses Windows named pipes instead of Unix domain sockets
// Compile: x86_64-w64-mingw32-gcc -o scraper_cli.exe scraper_cli_win.c -D_WIN32_WINNT=0x0600

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>
#include <process.h>

#define PIPE_NAME "\\\\.\\pipe\\scraper"

static HANDLE pipe_handle = INVALID_HANDLE_VALUE;

// Thread: print everything the host sends us
unsigned __stdcall reader_thread(void *arg) {
    (void)arg;
    char buf[4096];
    DWORD nread;
    while (1) {
        if (!ReadFile(pipe_handle, buf, sizeof(buf) - 1, &nread, NULL) || nread == 0) {
            printf("\n[Disconnected from host]\n");
            ExitProcess(0);
        }
        buf[nread] = '\0';
        printf("%s", buf);
        fflush(stdout);
    }
    return 0;
}

int main(void) {
    // Try to connect to the named pipe (retry for a few seconds if host is starting)
    int retries = 5;
    while (retries-- > 0) {
        pipe_handle = CreateFileA(
            PIPE_NAME,
            GENERIC_READ | GENERIC_WRITE,
            0, NULL,
            OPEN_EXISTING,
            0, NULL
        );
        if (pipe_handle != INVALID_HANDLE_VALUE) break;
        if (GetLastError() != ERROR_PIPE_BUSY) {
            fprintf(stderr,
                "Cannot connect to %s\n"
                "Is debug_host.exe running? (Brave must have the extension active)\n",
                PIPE_NAME);
            return 1;
        }
        WaitNamedPipeA(PIPE_NAME, 2000);
    }

    if (pipe_handle == INVALID_HANDLE_VALUE) {
        fprintf(stderr, "Failed to connect to scraper host after retries.\n");
        return 1;
    }

    // Switch to byte mode
    DWORD mode = PIPE_READMODE_BYTE;
    SetNamedPipeHandleState(pipe_handle, &mode, NULL, NULL);

    // Background thread reads responses from host
    HANDLE t = (HANDLE)_beginthreadex(NULL, 0, reader_thread, NULL, 0, NULL);
    if (t) CloseHandle(t);

    // Main thread: send user input to host
    char line[512];
    DWORD written;
    while (fgets(line, sizeof(line), stdin)) {
        WriteFile(pipe_handle, line, (DWORD)strlen(line), &written, NULL);
    }

    CloseHandle(pipe_handle);
    return 0;
}