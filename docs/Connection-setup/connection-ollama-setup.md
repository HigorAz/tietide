# Ollama Connection Setup

> Audience: TieTide user wiring up a free, self-hosted LLM.
> Time: ~5 minutes (plus a one-time model pull).

## Why this step exists

Ollama runs open-weight LLMs **locally** — no API key, no per-token cost. A TieTide
**Ollama connection** is a `CUSTOM`-type connection that stores just two values:

- **baseUrl** — where your Ollama server listens (e.g. `http://localhost:11434`).
- **model** — the default model the connection uses (e.g. `qwen2.5:7b`).

Both are validated by `ollamaConfigSchema` in
`packages/shared/src/schemas/connections.schema.ts`. The connection feeds the
`ollama-generate` action node (and `ollama-embeddings`), which lets a workflow send a
prompt — with data pills mixed in — and get the model's response back as `text` (plus a
best-effort parsed `json` field when the output is valid JSON).

This is the same Ollama runtime that already powers TieTide's AI Docs feature, so if AI
Docs work, your Ollama server is reachable.

## Steps

### 1. Install Ollama and pull a model

If Ollama isn't already running, install it from <https://ollama.com> (on WSL/Linux:
`curl -fsSL https://ollama.com/install.sh | sh`), then pull a model:

```bash
ollama pull qwen2.5:7b      # recommended (see below)
# or, already present for AI Docs:
ollama pull llama3.1:8b
```

Confirm it's up: `curl http://localhost:11434/api/tags` should list your models.

### 2. Pick a model

Running locally (e.g. on WSL) you trade size for speed/quality:

| Model                        | Size (Q4) | Best for                                                                                                                               |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **`qwen2.5:7b`**             | ~4.7 GB   | **Recommended.** Strong instruction-following and reliable JSON output for the size — ideal for the "return structured data" use case. |
| `llama3.1:8b`                | ~4.7 GB   | Solid all-rounder; **already pulled** for AI Docs, so zero extra setup.                                                                |
| `llama3.2:3b` / `qwen2.5:3b` | ~2 GB     | Lower RAM / faster on modest WSL boxes; weaker reasoning.                                                                              |

You can override the model per node in the workflow editor, so the connection default is
just a fallback.

### 3. Add the connection in TieTide

1. Log in to TieTide.
2. Go to **Connections** → **Available Providers** → pick **Ollama**.
3. Fill the form:
   - **Connection name**: e.g. `Local Ollama`.
   - **baseUrl**: the URL your **worker** can reach Ollama at — the same value as the
     `OLLAMA_BASE_URL` env var the stack uses. In Docker Compose that's the service URL
     (e.g. `http://ollama:11434`), not `localhost`.
   - **model**: pick from the **dropdown**. It lists the models already **installed** on
     the server (once the base URL is reachable) plus a curated **available** list you can
     **Pull** straight from the form; choose **Other…** to type any tag manually.
4. **Connect**.

> **⚠ Self-hosted on localhost/private? Set `SSRF_ALLOWED_HOSTS`.** The worker and API
> refuse outbound calls to loopback/private addresses (SSRF protection), so a
> `baseUrl` like `http://localhost:11434` is **blocked by default** — Ollama actions, the
> connection test, and the model dropdown's live list/pull will all fail. Add the host to
> the operator allowlist and restart the stack:
> `SSRF_ALLOWED_HOSTS=localhost,127.0.0.1` (comma-separated hostnames; only hosts you
> trust bypass the guard). A publicly-resolvable Ollama host needs no change.

### 4. Test the connection

On the new `Connection` row, click **Test**. TieTide pings `GET <baseUrl>/api/tags`
(`OllamaHealthChecker`). `Test succeeded (<latencyMs>ms)` confirms the server is reachable.

> **`baseUrl` must be reachable from the worker, not your browser.** The health check and
> node execution both run server-side. If Ollama runs on your host while the worker runs in
> Docker, point `baseUrl` at the host from the container's perspective (the same URL as
> `OLLAMA_BASE_URL`), not `http://localhost:11434`.

## Nodes available

- `ollama-generate` — send a prompt (with data pills), get back `{ text, json?, usage,
model, finishReason }`. Pick this connection, optionally override the model, write your
  prompt. To get structured output, ask the model to "respond with only JSON" — the parsed
  object surfaces as the `json` data pill.
- `ollama-embeddings` — embed text for similarity/search use cases.

## Troubleshooting

- **Test fails / connection refused**: Ollama isn't running, or `baseUrl` is wrong for the
  worker's network. Verify with `curl <baseUrl>/api/tags` from where the worker runs.
- **Node fails with "model not found"**: pull the model on the server
  (`ollama pull qwen2.5:7b`), or set the node/connection model to one you've pulled.
- **Slow first response**: the model loads into memory on first use. Subsequent calls are
  faster while it stays resident.
