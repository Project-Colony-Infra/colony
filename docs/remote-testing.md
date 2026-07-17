# Remote testing: your PC as the Coordinator

For a controlled beta test you do not need to host anything. You run the
Coordinator and the admin dashboard on your own machine, expose the node port to
the internet through a temporary tunnel, and share that address with testers. They
run only the node app. When you are done, you stop the tunnel and everything drops.

This needs no code changes: the node app already has a **Coordinator address**
field in Settings.

## What is reachable

The Coordinator listens on two ports:

- `8080` gRPC, which is what **nodes** connect to. This is the only port testers
  need to reach.
- `8081` REST, which is what your **admin dashboard** reads. It stays local to your
  machine, so it does not need to be exposed.

So you only tunnel port `8080`.

## Steps (you, the operator)

1. **Run the Coordinator** on your machine (from a release binary or a checkout):

   ```
   cd coordinator
   go run ./cmd/server
   ```

   It listens on `:8080` for nodes and `:8081` for the admin.

2. **Run the admin dashboard** locally and sign in:

   ```
   cd admin-dashboard
   npm install
   npm run dev
   ```

   Open http://localhost:3000 (default login `admin` / `admin`).

3. **Expose port 8080 with a tunnel.** The simplest is ngrok, which gives a public
   TCP address that forwards to your local Coordinator.

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

4. **Share that address** with your testers.

## Steps (your testers)

1. Download the node app for your operating system from the
   [Releases page](https://github.com/Project-Colony-Infra/colony/releases) and
   unzip it (`colony-node-linux.zip`, `colony-node-macos.zip`, or
   `colony-node-windows.zip`).
2. Run it.
3. Open **Settings**, set **Coordinator address** to the address you were given
   (for example `0.tcp.ngrok.io:12345`), and save.
4. Make sure the **Available to the Colony** switch is on.

That is all. Their machine now shows up on your Fleet page, and they can watch their
own contribution on their node.

## While testing

- Every tester who connects appears on your **Fleet** and **Nodes** pages, with
  their hardware, compute units, and live status. The **Activity** page logs each
  one coming online and going offline.
- Each machine registers once, by hardware fingerprint, so a tester who restarts
  does not show up twice.

## When you are done

Stop the tunnel (Ctrl+C on ngrok) and stop the Coordinator. Every node drops to
offline and nothing is left running anywhere but your own machine.

## Notes and limits

- The node connection is plain gRPC inside the tunnel's own encrypted transport,
  which is fine for a short controlled test with people you invite. For an ongoing
  or public deployment, add a join token so only invited nodes can register, put
  the Coordinator on an always-on host, and use its HTTPS address.
- A free tunnel gives a **new random address each time you restart it**, so if you
  restart ngrok, share the new address again.
- This test proves nodes registering and contributing and you seeing them all.
  Running the split inference job **across remote nodes** also needs the relay port
  (`8081`) reachable, which is a later step; the mock and single machine runs still
  work locally.
