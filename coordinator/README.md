# Coordinator

The central service for the v0.1 beta. Single Go binary with an embedded SQLite database.

## Responsibilities

- gRPC endpoints for node Register and a streaming Heartbeat, plus error reporting.
- REST API for the Admin dashboard: nodes, stats, colonies, and the error feed.
- A reaper that marks a node offline after about 15 seconds without a heartbeat.
- A WebSocket relay that forwards activation tensors between nodes during the LLM test.
- SQLite persistence for nodes, heartbeats, colonies, membership, and errors.

## Stack

Go, grpc-go with protobuf, chi for REST, modernc.org/sqlite for a pure Go database driver so the binary builds without CGO. The WebSocket relay for the LLM test lands in Phase 4.

## Ports

- gRPC for node agents on 8080 (`COORDINATOR_GRPC_PORT`).
- REST and WebSocket for the admin dashboard on 8081 (`COORDINATOR_HTTP_PORT`).

## REST endpoints

```
GET    /healthz                 liveness check
GET    /api/v1/nodes            list all nodes and last known state
GET    /api/v1/nodes/{id}       one node with its live utilization
GET    /api/v1/stats            totals (online nodes, cores, RAM, GPUs)
GET    /api/v1/leaderboard      nodes ranked by contribution score
GET    /api/v1/colonies         active colonies with their member node ids
POST   /api/v1/colonies         create a colony from a name and node ids
DELETE /api/v1/colonies/{id}    disband a colony and release its nodes
GET    /api/v1/errors           issues feed across all nodes (newest first)
```

## Layout

```
cmd/server/          the coordinator binary
cmd/testclient/      simulates several node agents for validation
proto/               node.proto and the generated gRPC stubs
internal/config/     environment configuration
internal/model/      shared domain types (Node, Colony, Resources)
internal/db/         SQLite connection, schema, and typed queries
internal/state/      in-memory node cache and the offline reaper
internal/grpcserver/ NodeService implementation
internal/rest/       admin dashboard HTTP API
```

## Run

```
go run ./cmd/server
```

To regenerate the gRPC stubs after editing `proto/node.proto` (needs protoc and the
Go plugins on PATH):

```
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative proto/node.proto
```

## Validate

With the server running, simulate a fleet of nodes:

```
go run ./cmd/testclient -addr localhost:8080 -n 6 -drop 2 -run 28s
```

This registers six nodes, streams heartbeats, and stops two partway through so
the reaper marks them offline. Watch the fleet with `curl localhost:8081/api/v1/nodes`.

## Status

Phase 0 complete: registration, heartbeat streaming, the offline reaper, colony
create and delete, the issues feed, and the leaderboard all work against SQLite.
