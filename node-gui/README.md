# Node GUI

The contributor app. A cross platform desktop application built with Wails v2, a Go backend daemon plus a React and TypeScript frontend. It compiles to a single native binary per operating system.

## Design

The engine and the window are separate on purpose. All the real work lives in a
headless daemon (`internal/daemon`) that detects hardware, talks to the
Coordinator, and serves live data on `localhost:9090`. The Wails window is a thin
viewer that reads that same local API, so the frontend runs unchanged in the
desktop webview or in a plain browser during development. The daemon also runs on
its own with no window, which is the roadmap's headless fallback.

## Layout

```
cmd/noded/            headless daemon runner (no window, fully testable)
internal/config/      load and save ~/.colony/config.json, stable node id
internal/resources/   hardware detection (gopsutil) and GPU (nvidia-smi, system_profiler)
internal/client/      gRPC client to the Coordinator
internal/daemon/      the engine: connect, register, heartbeat, reconnect, state
internal/localapi/    local dashboard API on port 9090
main.go, app.go       Wails desktop wrapper (build tag: desktop)
wails.json            Wails project config
frontend/             React, TypeScript, Tailwind dashboard
```

## Run the daemon (headless, works anywhere)

```
go run ./cmd/noded -coordinator localhost:8080
```

Then open `http://localhost:9090/api/state` to see live node state, or point the
frontend at it with `cd frontend && npm install && npm run dev`.

Local API:

```
GET  /health        liveness
GET  /api/state     live node state, specs, utilization, activity log
GET  /api/config    current settings
POST /api/config    update allocation and settings, applied immediately
```

## Build the desktop app

The desktop binary needs a webview (webkit2gtk on Linux, WebView2 on Windows, the
system WebView on macOS) and the Wails CLI. It is built with the `desktop` tag,
which is why `go build ./...` on its own skips the window and only builds the
daemon.

```
go install github.com/wailsapp/wails/v2/cmd/wails@latest
# Linux also needs the webkit2gtk and gtk3 development packages, for example on
# Ubuntu: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev
go mod tidy            # pulls in the Wails dependency (kept out of the lean headless build)
wails build -tags "desktop,webkit2_41" -skipbindings   # produces build/bin/colony-node
```

The `webkit2_41` tag points cgo at webkit2gtk-4.1 (what current Ubuntu ships)
rather than the old 4.0; it matches nothing on macOS or Windows, so the same
command works there. Bindings are skipped because the frontend reads the local
daemon on :9090 and imports no Wails bindings, and every root .go file sits
behind the desktop tag, which would otherwise fail binding generation. Use
`wails dev -tags "desktop,webkit2_41"` to run it live.

Cross platform installers (.exe, .dmg, .AppImage) are wired up in Phase 5.

## Status

Phase 1 complete for the engine: hardware detection (including GPU), config with a
stable node id, registration, heartbeat streaming, reconnect with backoff, and the
local dashboard API, all verified live against the Coordinator. The Wails window
and system tray build on a machine with a webview. The rich analytics dashboard
(gauges, ranking, richer logs) is Phase 2.
