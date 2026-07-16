# Coordinator

The central service for the v0.1 beta. Single Go binary with an embedded SQLite database.

## Responsibilities

- gRPC endpoints for node Register and a streaming Heartbeat, plus error reporting.
- REST API for the Admin dashboard: nodes, stats, colonies, and the error feed.
- A reaper that marks a node offline after about 15 seconds without a heartbeat.
- A WebSocket relay that forwards activation tensors between nodes during the LLM test.
- SQLite persistence for nodes, heartbeats, colonies, membership, and errors.

## Stack

Go, grpc-go with protobuf, chi for REST, gorilla/websocket for the relay, modernc.org/sqlite for a pure Go database driver so the binary builds without CGO.

## REST endpoints

```
GET    /api/v1/nodes            list all nodes and last known state
GET    /api/v1/stats            totals (online nodes, cores, RAM, GPUs)
POST   /api/v1/colonies         create a colony from a name and node ids
DELETE /api/v1/colonies/{id}    disband a colony and release its nodes
GET    /api/v1/errors           error feed across all nodes
```

## Status

Scaffold only. Implementation lands in Phase 0.
