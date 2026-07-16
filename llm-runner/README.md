# LLM Runner

The distributed inference worker for the killer test. A Python module invoked by the Node during the LLM test. It is shipped inside the Node app assets.

## How it works

Beta nodes sit behind NAT and cannot reach each other directly, so the Coordinator acts as a WebSocket relay.

- The worker takes `node_role` (primary or secondary), `layers` (for example 0-16 or 17-32), and the Coordinator WebSocket URL.
- The primary node loads the lower layers of a small model, runs the forward pass to the split point, and sends the intermediate tensor through the Coordinator.
- The secondary node loads the upper layers, receives the tensor, finishes the forward pass, and returns the generated text.
- If CUDA is not available the worker falls back to CPU, slower but enough to prove the architecture.

## Stack

Python, PyTorch, Transformers, Accelerate, websocket-client. Default model microsoft/Phi-3-mini-4k-instruct.

## Status

Scaffold only. Implementation lands in Phase 4.
