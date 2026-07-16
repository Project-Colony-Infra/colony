# Node GUI

The contributor app. A cross platform desktop application built with Wails v2, a Go backend daemon plus a React and TypeScript frontend. It compiles to a single native binary per operating system.

## Responsibilities

- Run a background daemon that survives the window being closed and lives in the system tray.
- Detect hardware: OS, CPU, RAM, disk, and GPU (NVIDIA and Apple).
- Let the user cap donated CPU cores, RAM, GPU memory, and bandwidth with sliders.
- Register with the Coordinator and stream a heartbeat every 5 seconds.
- Show a live dashboard: status, usage gauges, contribution score and ranking, and an activity log.
- Reconnect with exponential backoff and never crash when the Coordinator is unreachable.

## Stack

Wails v2, Go, React, TypeScript, Tailwind, shadcn/ui, gopsutil for resource detection.

## Config

User settings persist to `~/.colony/config.json`. The frontend reads live data from a local API on `localhost:9090`.

## Status

Scaffold only. Implementation lands in Phase 1 and Phase 2.
