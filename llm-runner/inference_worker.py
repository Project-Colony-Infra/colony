#!/usr/bin/env python3
"""Split inference worker for the Project Colony killer test.

A model is split across two nodes. The primary node holds the lower layers and
the secondary node holds the upper layers. The nodes sit behind NAT and cannot
reach each other, so every activation tensor travels over a WebSocket to the
Coordinator, which relays it to the peer.

The worker ships a tiny standard library WebSocket client so it has no third
party network dependency. Two engines are available:

  mock  real numpy matrix math split across the two nodes. Proves the relay and
        the split compute end to end without downloading a model. Output is
        deterministic gibberish, clearly labelled.
  real  a genuine transformers model (GPT-2 family) split by layer. Needs torch
        and transformers installed and the model available locally.

Protocol over the relay:
  binary frame  a serialized numpy array (an activation tensor, or a single
                next-token id going back to the primary)
  text frame    JSON control: {"type":"result","text":...} from the secondary
                when generation finishes, or {"type":"stop"} from the Coordinator
"""

import argparse
import base64
import io
import json
import os
import socket
import struct
import sys
from urllib.parse import urlparse

import numpy as np


# --------------------------------------------------------------------------- #
# Minimal WebSocket client (RFC 6455, client side only).
# --------------------------------------------------------------------------- #

OP_TEXT = 0x1
OP_BINARY = 0x2
OP_CLOSE = 0x8
OP_PING = 0x9
OP_PONG = 0xA


class WSClient:
    def __init__(self, url):
        parsed = urlparse(url)
        self.host = parsed.hostname
        self.port = parsed.port or 80
        self.path = parsed.path or "/"
        if parsed.query:
            self.path += "?" + parsed.query
        self.sock = None

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(1024)
            if not chunk:
                raise ConnectionError("relay closed during handshake")
            resp += chunk
        if b" 101 " not in resp.split(b"\r\n", 1)[0]:
            raise ConnectionError(f"relay handshake failed: {resp.splitlines()[0]!r}")

    def _recv_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("relay closed")
            buf += chunk
        return buf

    def _send_frame(self, opcode, payload):
        header = bytearray([0x80 | opcode])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack("!H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack("!Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def send_binary(self, data):
        self._send_frame(OP_BINARY, data)

    def send_text(self, text):
        self._send_frame(OP_TEXT, text.encode("utf-8"))

    def recv(self):
        """Return (opcode, payload), transparently answering pings."""
        while True:
            b0, b1 = self._recv_exact(2)
            opcode = b0 & 0x0F
            masked = b1 & 0x80
            length = b1 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else None
            payload = self._recv_exact(length) if length else b""
            if mask:
                payload = bytes(p ^ mask[i % 4] for i, p in enumerate(payload))
            if opcode == OP_PING:
                self._send_frame(OP_PONG, payload)
                continue
            if opcode == OP_PONG:
                continue
            return opcode, payload

    def close(self):
        try:
            if self.sock:
                self._send_frame(OP_CLOSE, b"")
                self.sock.close()
        except OSError:
            pass


# --------------------------------------------------------------------------- #
# Tensor serialization using the self describing numpy .npy format.
# --------------------------------------------------------------------------- #

def pack(array):
    buf = io.BytesIO()
    np.save(buf, np.asarray(array))
    return buf.getvalue()


def unpack(data):
    return np.load(io.BytesIO(data))


# --------------------------------------------------------------------------- #
# Mock engine: real split matrix math, no model download.
# --------------------------------------------------------------------------- #

class MockEngine:
    """A tiny two stage network. The primary embeds tokens and applies the first
    projection, the secondary applies the second projection and picks the next
    token. It is not a language model, but it exercises the exact same split and
    relay as the real path with deterministic output."""

    vocab = 256
    dim = 32
    eos = -1  # never emitted, generation stops on the token budget

    def __init__(self):
        rng = np.random.default_rng(1234)
        self.embed = rng.standard_normal((self.vocab, self.dim)).astype(np.float32)
        self.w1 = rng.standard_normal((self.dim, self.dim)).astype(np.float32)
        self.w2 = rng.standard_normal((self.dim, self.vocab)).astype(np.float32)

    def encode(self, text):
        return list(text.encode("utf-8"))

    def decode(self, ids):
        return bytes(max(0, min(255, i)) for i in ids).decode("utf-8", errors="replace")

    def lower(self, ids):
        x = self.embed[np.asarray(ids) % self.vocab]
        return np.tanh(x @ self.w1).astype(np.float32)

    def upper(self, hidden):
        logits = hidden[-1] @ self.w2
        # Map to a printable ASCII byte so the relayed result is readable.
        return 32 + int(np.argmax(logits)) % 95


# --------------------------------------------------------------------------- #
# Real engine: a GPT-2 family model split by layer. Reference path, needs torch.
# --------------------------------------------------------------------------- #

class RealEngine:
    def __init__(self, model_name, split):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForCausalLM.from_pretrained(model_name)
        self.model.eval()
        self.eos = self.tokenizer.eos_token_id if self.tokenizer.eos_token_id is not None else -1

        # GPT-2 style layout: transformer.h is the list of blocks.
        self.t = self.model.transformer
        self.n_layers = len(self.t.h)
        self.split_at = max(1, int(self.n_layers * split))

    def encode(self, text):
        return self.tokenizer.encode(text)

    def decode(self, ids):
        return self.tokenizer.decode(ids)

    def lower(self, ids):
        torch = self.torch
        with torch.no_grad():
            input_ids = torch.tensor([ids], dtype=torch.long)
            positions = torch.arange(0, len(ids), dtype=torch.long).unsqueeze(0)
            hidden = self.t.wte(input_ids) + self.t.wpe(positions)
            for block in self.t.h[: self.split_at]:
                hidden = block(hidden)[0]
        return hidden.squeeze(0).numpy().astype(np.float32)

    def upper(self, hidden):
        torch = self.torch
        with torch.no_grad():
            h = torch.tensor(hidden).unsqueeze(0)
            for block in self.t.h[self.split_at :]:
                h = block(h)[0]
            h = self.t.ln_f(h)
            logits = self.model.lm_head(h)
            return int(torch.argmax(logits[0, -1]).item())


def build_engine(engine, model_name, split):
    if engine == "real":
        return RealEngine(model_name, split)
    return MockEngine()


# --------------------------------------------------------------------------- #
# Roles.
# --------------------------------------------------------------------------- #

def run_primary(ws, engine, prompt):
    tokens = engine.encode(prompt)
    relayed = 0
    while True:
        hidden = engine.lower(tokens)
        ws.send_binary(pack(hidden))
        relayed += 1
        opcode, payload = ws.recv()
        if opcode == OP_TEXT:
            msg = json.loads(payload.decode("utf-8"))
            if msg.get("type") == "stop":
                break
        elif opcode == OP_BINARY:
            next_id = int(unpack(payload))
            tokens.append(next_id)
        elif opcode == OP_CLOSE:
            break
    print(f"primary: relayed {relayed} activation tensors", flush=True)


def run_secondary(ws, engine, prompt, max_new_tokens):
    prompt_ids = engine.encode(prompt)
    generated = []
    while True:
        opcode, payload = ws.recv()
        if opcode == OP_TEXT:
            msg = json.loads(payload.decode("utf-8"))
            if msg.get("type") == "stop":
                break
            continue
        if opcode == OP_CLOSE:
            break
        hidden = unpack(payload)
        next_id = engine.upper(hidden)
        generated.append(next_id)
        if len(generated) >= max_new_tokens or next_id == engine.eos:
            text = engine.decode(prompt_ids + generated)
            if isinstance(engine, MockEngine):
                text = "[mock split-inference] " + engine.decode(generated)
            ws.send_text(json.dumps({"type": "result", "text": text}))
            print(f"secondary: produced {len(generated)} tokens", flush=True)
            break
        ws.send_binary(pack(np.array(next_id)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--role", required=True, choices=["primary", "secondary"])
    parser.add_argument("--relay-ws", required=True)
    parser.add_argument("--engine", default="mock", choices=["mock", "real"])
    parser.add_argument("--model", default="gpt2")
    parser.add_argument("--prompt", default="")
    parser.add_argument("--max-new-tokens", type=int, default=20)
    parser.add_argument("--split", type=float, default=0.5)
    args = parser.parse_args()

    engine = build_engine(args.engine, args.model, args.split)
    ws = WSClient(args.relay_ws)
    ws.connect()
    print(f"{args.role}: connected to relay with the {args.engine} engine", flush=True)

    try:
        if args.role == "primary":
            run_primary(ws, engine, args.prompt)
        else:
            run_secondary(ws, engine, args.prompt, args.max_new_tokens)
    except Exception as exc:  # noqa: BLE001 report failures back through the relay
        try:
            ws.send_text(json.dumps({"type": "error", "error": f"{args.role}: {exc}"}))
        except OSError:
            pass
        print(f"{args.role}: error: {exc}", file=sys.stderr, flush=True)
        ws.close()
        sys.exit(1)

    ws.close()


if __name__ == "__main__":
    main()
