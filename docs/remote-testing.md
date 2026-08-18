# Remote testing and deployment

There are two ways to let contributors reach a Coordinator that is not on their
own network. Pick the tunnel for a short, informal test; pick Docker Compose on
a server when you want the Coordinator to just stay up.

- **[A temporary tunnel from your own PC](#method-1-a-temporary-tunnel-from-your-own-pc)**:
  no hosting, nothing to pay for, drops the moment you stop it. Good for a quick
  test with a handful of people you already know.
- **[Docker Compose on a server](#method-2-docker-compose-on-a-server)**: the
  Coordinator and Zonn Console run as containers on a VPS you control, with a
  stable address and data that survives a restart. Good for an actual beta.

Both need no code changes: Zonn Node already has a **Coordinator address** field
in Settings, and it does not care whether that address is a tunnel or a real
server.

## Method 1: a temporary tunnel from your own PC

For a controlled beta test you do not need to host anything. You run the
Coordinator and Zonn Console on your own machine, expose the node port to
the internet through a temporary tunnel, and share that address with testers. They
run only Zonn Node. When you are done, you stop the tunnel and everything drops.

### What is reachable

The Coordinator listens on two ports:

- `8080` gRPC, which is what **nodes** connect to. This is the only port testers
  need to reach.
- `8081` REST and WebSocket. **Zonn Console** reads the REST API locally, while
  remote workers need the `/relay` WebSocket during Playground jobs.

Tunnel only `8080` for fleet registration. Tunnel both `8080` and `8081` when
you want remote nodes to execute Playground jobs.

### Steps (you, the operator)

1. **Run the Coordinator** on your machine (from a release binary or a checkout):

   ```
   cd coordinator
   go run ./cmd/server
   ```

   It listens on `:8080` for nodes and `:8081` for the admin.

2. **Run Zonn Console** locally and sign in:

   ```
   cd admin-dashboard
   npm install
   npm run dev
   ```

   Open http://localhost:3000 (default login `admin` / `admin`).

3. **Expose ports 8080 and 8081 with tunnels.** The first endpoint carries node
   registration and heartbeats. The second carries the WebSocket tensor relay
   used by Playground jobs. With ngrok, define two TCP tunnels in its config and
   start both. Record both public addresses.

   ```
   # one time: install ngrok and add your free authtoken
   ngrok config add-authtoken <your-token>

   # start the tunnel
   ngrok tcp 8080
   ```

   ngrok prints a forwarding address like:

   ```
   Forwarding  tcp://0.tcp.ngrok.io:12345 -> localhost:8080
   ```

   Your public Coordinator address is the host and port, for example
   `0.tcp.ngrok.io:12345`.

4. Stop and restart the Coordinator with `COORDINATOR_RELAY_URL` set to the
   second endpoint, including its `/relay` path. For example:

   ```
   COORDINATOR_RELAY_URL=ws://2.tcp.ngrok.io:23456/relay go run ./cmd/server
   ```

5. **Share the port 8080 tunnel address** with your testers.

### Steps (your testers)

1. Download the Zonn Node installer for your operating system from the
   [Releases page](https://github.com/Project-Colony-Infra/colony/releases): the
   Ubuntu `.deb`, macOS `.dmg`, or Windows Setup `.exe`.
2. Install and run it from the operating system's application menu.
3. Open **Settings**, set **Coordinator address** to the address you were given
   (for example `0.tcp.ngrok.io:12345`), and save.
4. Make sure the **Available to the Zone** switch is on.

That is all. Their machine now shows up on your Fleet page, and they can watch their
own contribution on their node.

### While testing

- Every tester who connects appears on your **Fleet** and **Nodes** pages, with
  their hardware, compute units, and live status. The **Activity** page logs each
  one coming online and going offline.
- Each machine registers once, by hardware fingerprint, so a tester who restarts
  does not show up twice.

### When you are done

Stop the tunnel (Ctrl+C on ngrok) and stop the Coordinator. Every node drops to
offline and nothing is left running anywhere but your own machine.

### Notes and limits

- The node connection is plain gRPC inside the tunnel's own encrypted transport,
  which is fine for a short controlled test with people you invite. For an ongoing
  or public deployment, add a join token so only invited nodes can register, put
  the Coordinator on an always-on host, and use its HTTPS address.
- A free tunnel gives a **new random address each time you restart it**, so if you
  restart ngrok, share the new address again.
- A second public TCP endpoint for `8081`, supplied to the Coordinator through
  `COORDINATOR_RELAY_URL`, is required for split inference across remote nodes.

## Method 2: Docker Compose on a server

This runs the Coordinator and Zonn Console as containers on a server you control
(a VPS, a home server, anything with Docker), so they stay up between reboots and
have a stable address instead of a temporary tunnel. The Node app is a desktop
app for a contributor's own machine, not a container, so it never runs here.

Everything below lives in `infra/`: `docker-compose.yml`, `.env.example`, and
`init.sql`, the schema reference for the same database the Coordinator manages
itself.

### What you need

- A server with Docker and the Docker Compose plugin installed (`docker compose
  version` should print something). Most VPS providers offer an image with these
  preinstalled, or you can install Docker's official convenience script.
- A public IP address or domain for that server.
- About 1 GB of RAM is enough for the Coordinator and Zonn Console together; both
  are small services.

### What gets exposed, and why

`docker-compose.yml` publishes three ports, deliberately not the same way:

| Port | Service | Binding | Why |
|---|---|---|---|
| `8080` | Coordinator gRPC | every interface | This is what contributor nodes connect to. It has to be reachable from the internet for the whole point of a server deployment to work. |
| `3000` | Zonn Console | every interface | This is what you, the operator, sign in to. |
| `8081` | Coordinator REST | `127.0.0.1` only | Zonn Console reads this over Docker's internal network (`http://coordinator:8081`), never through the published port. The REST API has no authentication of its own, so this is bound to loopback on purpose: it is reachable from the server itself for debugging, never from the outside. |

Only `8080` and `3000` need a firewall rule opened on your VPS. Leave `8081`
alone; it is not reachable from outside the host regardless of your firewall,
because Docker never binds it past `127.0.0.1`.

### Steps

1. **Get the code onto the server** (clone the repository, or copy just the
   `infra/`, `coordinator/`, and `admin-dashboard/` directories):

   ```
   git clone https://github.com/Project-Colony-Infra/colony.git
   cd colony/infra
   ```

2. **Create your environment file** from the template and edit it:

   ```
   cp .env.example .env
   ```

   At minimum, for anything reachable by more than just you, change:
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`, the Zonn Console login. They default
     to `admin` / `admin`, which is fine on your own laptop and not fine on a
     public server.
   - `AUTH_SECRET`, which signs the admin session cookie. Generate a real one:

     ```
     openssl rand -hex 32
     ```

     Paste the result in as `AUTH_SECRET=...`. If you leave this blank, the app
     falls back to a fixed value that is visible in the source code, which means
     anyone could forge a valid session and sign in without your password.

3. **Build and start both services:**

   ```
   docker compose up -d --build
   ```

   The first build takes a few minutes (it compiles the Coordinator and builds
   the dashboard). After that, `docker compose up -d` alone is fast.

4. **Check it is healthy:**

   ```
   curl http://localhost:8081/healthz
   ```

   should print `{"status":"ok"}`. Then open `http://your-server-ip:3000` in a
   browser and sign in with the credentials you set in `.env`.

### Give contributors the address

Contributors point Zonn Node's **Coordinator address** setting at your server's
IP or domain and port `8080`, for example `203.0.113.9:8080`. Unlike the tunnel
method, this address does not change when you restart the containers.

### Data and persistence

The Coordinator's SQLite database lives in a named Docker volume
(`coordinator-data`), not inside the container, so it survives a container
restart, an image rebuild, or a `docker compose down`. It is only erased by
`docker compose down -v`, which explicitly removes volumes, so avoid that flag
unless you mean to wipe every registered node and every colony.

To back it up, copy the file out of the volume:

```
docker run --rm -v infra_coordinator-data:/data -v "$PWD":/backup alpine \
  cp /data/colony.db /backup/colony.db.bak
```

(the volume name is prefixed with your Compose project name, `infra` by default,
so if you deployed with `docker compose -p something`, use `something_coordinator-data`
instead.)

### Updating

```
git pull
docker compose up -d --build
```

Compose rebuilds only what changed and restarts just that service; the database
volume is untouched.

### Stopping

```
docker compose down
```

Stops and removes the containers. The `coordinator-data` volume, and everything
in it, stays on disk until you explicitly remove it.

### Notes and limits

- **Put a real TLS terminating reverse proxy in front of port `3000`** (Caddy,
  Nginx, or your VPS provider's load balancer) before treating this as a real
  production deployment; Zonn Console itself serves plain HTTP. Caddy in
  particular needs only a couple of lines of config to get a free, automatically
  renewed certificate for a domain pointed at your server.
- The gRPC port (`8080`) is plain, unencrypted gRPC, the same as the tunnel
  method. It is adequate for a beta with invited testers; a production
  deployment should add a join token so only invited nodes can register, which
  is intentionally out of scope for v0.1 (see `documentation/zonn/blueprint.md`
  Section 12).
- The `ADMIN_USERNAME` / `ADMIN_PASSWORD` scheme is a single shared login for the
  whole beta, not per person accounts. Treat it accordingly.
