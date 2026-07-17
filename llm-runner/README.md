# LLM Runner

The distributed inference worker for the killer test. `inference_worker.py` is
launched by a node during an LLM job. It splits a model across two nodes and
relays the intermediate activations through the Coordinator.

## How it works

Beta nodes sit behind NAT and cannot reach each other directly, so the
Coordinator acts as a WebSocket relay. The worker ships a small standard library
WebSocket client, so it has no third party network dependency.

- The primary node holds the lower layers. It embeds the prompt, runs its layers,
  and sends the activation tensor over the relay.
- The secondary node holds the upper layers. It receives the tensor, finishes the
  forward pass, samples the next token, and sends it back so the primary can
  continue. When generation ends it returns the final text.

Tensors travel as self describing numpy arrays. Control messages (the final
result, or a stop signal) travel as JSON text frames.

## Engines

```
mock   real numpy matrix math split across the two nodes. No model download, so
       it runs anywhere and proves the relay and the split compute end to end.
       Output is deterministic gibberish, clearly labelled.
real   a genuine GPT-2 family model split by layer. Needs torch and transformers
       installed and the model available on the nodes.
```

## Run by hand

Two terminals, against a running Coordinator relay on port 8081:

```
python3 inference_worker.py --role secondary --engine mock \
  --relay-ws 'ws://localhost:8081/relay?job=demo&role=secondary'

python3 inference_worker.py --role primary --engine mock --prompt 'Hello' \
  --relay-ws 'ws://localhost:8081/relay?job=demo&role=primary'
```

In normal operation the node daemon launches both workers automatically when the
admin deploys a job. It finds the script via `COLONY_WORKER_SCRIPT` and the
interpreter via `COLONY_PYTHON` (default `python3`).

## Dependencies

The mock engine needs only numpy. The real engine additionally needs torch and
transformers, which the node bundles with its Python runtime for the beta.

## Status

Phase 4 complete. The full pipeline is verified end to end with the mock engine:
the admin deploys a job, both nodes launch workers, the primary relays activation
tensors through the Coordinator to the secondary, and the result returns to the
dashboard. The real engine uses the identical relay path.
