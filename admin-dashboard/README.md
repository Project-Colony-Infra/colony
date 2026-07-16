# Admin Dashboard

The operator control plane. A Next.js 14 web app (App Router) that shows the whole fleet and drives colonies and the LLM test.

## Responsibilities

- Simple auth for the beta.
- Fleet overview: live stat cards and a status colored grid of nodes.
- Node table: sortable and filterable, with a detail view for specs and recent errors.
- Colony management: create with a node multi select, list, and delete.
- Issues feed: all node errors in reverse chronological order.
- Deploy LLM: prompt input, dispatch to a colony, and a live monitor.

## Stack

Next.js 14, TypeScript, Tailwind, shadcn/ui, Recharts, @tanstack/react-table. Reads the Coordinator REST API. No dummy data, every number is live.

## Status

Scaffold only. Implementation lands in Phase 3 and Phase 4.
