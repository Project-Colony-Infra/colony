# Getting started

Zonn turns a group of ordinary machines into one virtual supercomputer,
a Zone. This guide covers the two roles: a **contributor** who donates part of
their machine, and an **operator** who groups machines into a Zone and runs work
across them.

If you only want to try the split inference test, jump to the
[Playground guide](playground.md).

## For contributors: run Zonn Node

Zonn Node is a small desktop application. It detects your hardware, lets you
choose how much to donate, registers with a Coordinator, and shows a live
dashboard of your contribution.

1. **Download and install** Zonn Node for your operating system from the
   [Releases page](https://github.com/Project-Colony-Infra/colony/releases):
   - Ubuntu: download the `.deb` and open it with App Center, or run
     `sudo apt install ./zonn-node_VERSION_amd64.deb`.
   - macOS: choose the Apple Silicon or Intel `.dmg`, open it, and drag
     **Zonn Node** into Applications.
   - Windows: run `Zonn-Node-Setup-Windows-x64.exe` and follow the installer.

   The installer includes the worker runtime used by both Playground engines. A
   contributor does not install Python, numpy, Go, Node.js, or this repository.

2. **Run it** from the operating system's application menu. On first launch the app:
   - detects your OS, CPU, RAM, disk, and GPU,
   - seeds a starting contribution of 20% of the machine (you can change this),
   - registers with the Coordinator at `localhost:8080` by default.

   Open **Settings** to point it at a different Coordinator, rename the node, and
   set exactly how much CPU, memory, GPU memory, and bandwidth you donate. Each
   slider stops at what is free right now, so your contribution and your own use
   always stay in balance. The **Available to the Zone** switch pauses and
   resumes your contribution at any time without quitting the app. Settings also
   has a **Crash reports** switch, on by default, that sends an anonymized report
   (the error type, a stack trace, and your operating system, never your hostname,
   username, or IP address) if the app recovers from a crash, so it shows up for
   the operator in Zonn Console.

3. **Watch your contribution.** The Overview shows, per resource, what your machine
   is using, what you contribute, and the free room left, which always add up to
   your total. When the Zone runs a task on your node, the "Zone use of your
   contribution" card shows how much of your pledge is actually in use. Analytics
   shows your rank, your compute units, and live utilization over time.

Your settings and a stable node id are saved to `~/.colony/config.json`, so the
same machine always comes back as the same node.

### Compute units

CPU, memory, and GPU fold into one normalized number so a CPU heavy machine and a
GPU heavy machine add to the same Zone pool: `1 CPU core = 1 unit`,
`1 GB RAM = 0.5`, `1 GB GPU memory = 1.5`. There is no separate CPU or GPU track;
whatever mix you contribute converts into the same units.

## For operators: run the Coordinator and Zonn Console

1. **Coordinator.** Download the `coordinator` binary for your platform from the
   [Releases page](https://github.com/Project-Colony-Infra/colony/releases) and run
   it, or from a checkout:

   ```
   cd coordinator
   go run ./cmd/server
   ```

   It listens for nodes on `:8080` (gRPC) and serves the admin API on `:8081`
   (REST). State lives in an embedded SQLite file, `colony.db` by default (override
   with `COORDINATOR_DB_PATH`).

2. **Zonn Console.** From a checkout:

   ```
   cd admin-dashboard
   npm install
   npm run dev
   ```

   Sign in with the beta credentials (`admin` / `admin` by default; override with
   `ADMIN_USERNAME` and `ADMIN_PASSWORD`). Point it at the Coordinator with
   `COORDINATOR_API_URL` if it is not on `localhost:8081`.

3. **Use it.**
   - **Fleet** shows every node, the compute-units pool, and the CPU versus GPU
     composition.
   - **Nodes** is the sortable table of machines and their contribution.
   - **Zones** creates a Zone from a set of nodes in one click, and deletes it
     to release the nodes back to idle.
   - **Playground** runs the split inference test on a Zone (see below).
   - **Activity** is the full log: registrations, nodes coming online and going
     offline, Zones created and deleted, and deploys.
   - **Issues** is the feed of node side warnings and errors, including crash
     reports.
   - **Feedback** is where a beta submission (a message and an optional email)
     lands, along with a running list of what has been sent in.

## The Playground: split inference across the Zone

The one flow that proves everything works together:

1. As a contributor, run two nodes (two machines) and keep them online.
2. As the operator, create a Zone containing both, on the Zones page.
3. Open the **Playground**, pick that Zone, choose a preset or type a prompt, and
   run it.
4. The Coordinator hands the primary node the lower half of a small language model
   and the secondary node the upper half. Because beta nodes sit behind NAT and
   cannot reach each other directly, the primary computes its layers and relays the
   intermediate tensor **through the Coordinator** to the secondary, which finishes
   the forward pass. The generated text comes back to the dashboard.

The `mock` engine proves this pipeline with real tensors and needs no model
download. The `real` engine runs a supported Qwen2, Llama/SmolLM2, or GPT-2 model
on CPU. Qwen 2.5 0.5B Instruct is the recommended useful starting model.

## What v0.1 is and is not

v0.1 is a deliberate proof of concept: a single Coordinator, Zonn Node, Zonn
Console, and the split inference test. It does **not** run arbitrary code or full
software across the Zone. General distributed compute (the high level
`colony.train()` idea) is the longer term vision and is intentionally out of scope
here.
