# Admin Dashboard

The operator control plane. A Next.js 14 web app (App Router) that shows the whole fleet and drives colonies.

## Design

The browser only ever talks to this app. Route handlers under `app/api` proxy to
the Coordinator REST API, so the Coordinator address stays server side and every
request is authenticated first. Pages are client components that poll those
proxy routes, so the fleet view stays live with no dummy data.

## Auth

Beta grade. Credentials come from the environment (`ADMIN_USERNAME`,
`ADMIN_PASSWORD`). A successful login stores an httpOnly cookie holding an HMAC of
the username signed with `AUTH_SECRET`. Middleware redirects unauthenticated
browsers to the login page, and each API route validates the token before
proxying.

## Pages

```
/            fleet overview: live stat cards and a status colored node grid
/nodes       sortable, filterable node table
/nodes/[id]  one node: specs, live usage, and its error history
/colonies    list, create (multi select nodes plus a name), and delete
/issues      the global issues feed across all nodes
/login       sign in
```

## Run

```
cp .env.example .env      # set COORDINATOR_API_URL and AUTH_SECRET
npm install
npm run dev               # http://localhost:3000
```

For a production build:

```
npm run build && npm run start
```

Or with the whole stack via `infra/docker-compose.yml`.

## Stack

Next.js 14 App Router, TypeScript, Tailwind on the Colony palette. The node table
sorting and filtering are hand rolled to keep the bundle small; they can be moved
to a table library later. Reads the Coordinator REST API through server side
proxy routes.

## Status

Phase 3 complete: login and session auth, fleet overview, node table and detail,
colony create and delete, and the issues feed, all verified end to end against a
running Coordinator.
