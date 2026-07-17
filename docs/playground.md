# Playground

The Playground is where an operator runs work on a Colony and watches the whole
system solve it together. In v0.1 the work is the **split LLM inference test**: a
small language model is divided across two nodes, and they cooperate through the
Coordinator to answer a prompt.

Open it from the admin dashboard nav: **Playground**.

## What it does

You give the Colony a task (a prompt for the language model). The Coordinator:

1. picks two online nodes in the Colony, a primary and a secondary,
2. gives the primary the lower transformer layers and the secondary the upper
   layers,
3. has the primary compute its layers and relay the intermediate activation tensor
   through the Coordinator to the secondary (nodes behind NAT never talk directly),
4. lets the secondary finish the forward pass and return the generated text.

## Running a task

1. **Pick a Colony.** The selector lists active colonies. The test needs at least
   two online nodes in the Colony; if the selected one has fewer, the Run button is
   disabled and tells you so. No colonies yet? Create one on the Colonies page.

2. **Choose a task.** Click a preset to fill the prompt, or type your own in the
   task box. This is the prompt the language model answers.

3. **Pick an engine.**
   - `mock` (default) proves the pipeline with real relayed tensors and needs no
     model download. Use this to see the system work end to end quickly.
   - `real` runs an actual small model (for example
     `microsoft/Phi-3-mini-4k-instruct`) on CPU. It is slower and downloads the
     model on first use.

   Set the model name and the maximum number of new tokens if you want.

4. **Run on the Colony.** The run view appears below.

## What you see while it runs

- **The pipeline**, left to right: the primary node, the Coordinator tensor relay,
  and the secondary node. Each node shows its status, live CPU and memory use, and
  its compute units, so you can watch each machine take part.
- **The job status**: PENDING while it is queued to the nodes, RUNNING while the
  workers compute and relay, then DONE or FAILED.
- **The result**: the generated text once the job is DONE, or the error if it
  failed.
- **Each node's contribution** to solving the task, from its compute units and live
  utilization.

Recent runs are listed so you can reopen any of them.

## Measuring contribution

While a task runs, each participating node's contributor dashboard shows a "Colony
use of your contribution" card: how much of the CPU and memory that node pledged is
actually being drawn by the Colony right now, versus how much is still free. That
is the contributor side of the same run you launched here.

## Scope note

The Playground runs the split inference test, which is v0.1's real distributed
capability. It is not a general code runner: the task you provide is a prompt for
the model, not arbitrary code. Running imported software or custom code across the
Colony is the longer term vision and is intentionally out of scope for v0.1.
