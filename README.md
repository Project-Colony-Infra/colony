# Zonn

[![CI](https://github.com/Project-Colony-Infra/colony/actions/workflows/ci.yml/badge.svg)](https://github.com/Project-Colony-Infra/colony/actions/workflows/ci.yml)

One Zone. Infinite Compute.

Zonn turns a group of ordinary, unreliable machines into one virtual supercomputer. A contributor runs a small desktop app, Zonn Node, that donates part of their CPU, RAM, and GPU. An operator groups those machines into a Zone and runs real work across them, starting with distributed inference of a small language model. This repository is the Colony Engine, the technology underneath Zonn: the Coordinator, the node runtime, and the relay that makes the Zone act as one machine.

This repository holds the v0.1 beta: a working proof of concept that a handful of random computers can act as one AI supercomputer.

## What is in v0.1

- **Coordinator** a single Go service with an embedded database. It is the central brain that tracks nodes, forms Zones, and relays data between nodes during a job.
- **Zonn Node** a cross platform desktop app that detects hardware, lets the user choose how much to donate, streams status to the Coordinator, and shows a live contributor dashboard.
- **Zonn Console** a web app that shows the whole fleet, creates and deletes Zones, and deploys the language model test.
- **LLM Runner** a Python worker that splits a small model across two nodes and returns generated text.
- **Infra** Docker Compose for the Coordinator and Zonn Console, plus the database schema.

## Layout

```
coordinator/       Go service (gRPC, REST, WebSocket relay, SQLite)
node-gui/          Zonn Node, a Wails desktop app (Go daemon plus React frontend)
admin-dashboard/   Zonn Console, a Next.js 14 web app
llm-runner/        Python distributed inference worker
infra/             docker-compose, Dockerfiles, database schema
docs/              beta guide and architecture notes
```

## Quick start (Coordinator and Admin dashboard)

Requires Docker.

```
cp infra/.env.example infra/.env
cd infra
docker compose up --build
```

The Coordinator listens on port 8080 and Zonn Console on port 3000.

## Download and getting started

Contributors download Zonn Node for their operating system from the
[Releases page](https://github.com/Project-Colony-Infra/colony/releases) and run
it. See the [getting started guide](docs/getting-started.md) for contributors and
operators, and the [Playground guide](docs/playground.md) for running the split
inference test.

## The Playground: the one flow that proves it all

The point of v0.1 is one flow. An operator opens the **Playground**, picks a Zone,
chooses a preset or types a prompt, and runs it. The first node runs the lower half
of a small model and relays its intermediate result through the Coordinator to a
second node, which finishes the work and returns the generated text to the
dashboard. If that works across a few machines behind different networks, the core
idea is proven. You watch the pipeline, the result, and each node's contribution
live.

## License

Apache License 2.0. See `LICENSE`.
