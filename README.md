# TieTide

> Open-source, self-hostable iPaaS for integration and automation. Visual workflow editor + asynchronous execution engine + AI-generated process documentation.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E=20-339933)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220)
![Status: MVP](https://img.shields.io/badge/status-MVP-orange)

TieTide is a portfolio-grade alternative to Zapier / n8n with the trade-offs flipped: open-source, self-hosted, and explicitly designed to combine **low-code** (drag-and-drop "Maré de Dados" canvas) with **pro-code** extensibility (TypeScript SDK for custom nodes). It also generates human-readable workflow documentation from a local LLM via RAG — a feature absent from comparable tools.

This is the codebase for an academic capstone (Engenharia de Software, 2025–2026); the long-form RFC that motivates every design decision is at [`docs/rfc.md`](docs/rfc.md).

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  SPA (React) │────▶│ API (NestJS) │────▶│    Queue     │
│  Port 5173   │◀────│  Port 3030   │     │  (Valkey)    │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼──────┐     ┌──────▼──────┐
                    │  PostgreSQL  │◀────│Worker(NestJS)│
                    │  Port 5432   │     │  (BullMQ)    │
                    └─────────────┘     └─────────────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │  AI Service  │────▶│   Ollama     │
                    │  (FastAPI)   │     │  Port 11434  │
                    │  Port 8000   │     └─────────────┘
                    └──────┬──────┘
                    ┌──────▼──────┐
                    │  ChromaDB    │
                    └─────────────┘
```

**Request flow.** SPA calls REST → API persists + enqueues to Valkey → Worker consumes job, executes the workflow node DAG (Kahn's topological sort), persists `ExecutionStep`s → SPA polls execution status.

**AI flow.** `POST /v1/workflows/:id/generate-docs` → API → FastAPI service → ChromaDB (RAG) → Ollama (`llama3.1:8b`) → markdown documentation persisted to `WorkflowDocumentation`.

**Layered.** Controllers → Services → Repositories/Adapters. Business logic lives in services only. The full C4 model is in the [RFC](docs/rfc.md#3232-modelos-c4).

---

## Repo layout

```
tietide/
├── apps/
│   ├── api/          NestJS REST API (port 3030, prefix /v1)
│   ├── worker/       NestJS BullMQ consumer
│   ├── spa/          React + Vite + React Flow editor (port 5173)
│   └── ai/           FastAPI service for RAG-backed doc generation (port 8000)
├── packages/
│   ├── shared/       Zod schemas + TypeScript types (zero runtime deps)
│   ├── sdk/          INodeExecutor contract for custom nodes (frozen post-S4)
│   └── eslint-config/
├── infra/
│   ├── docker/       docker-compose.yml for stateful deps
│   ├── scripts/      backup-postgres.sh, restore-postgres.sh, healthcheck-alert.sh
│   ├── load/         k6 performance tests
│   └── ci/
└── docs/
    ├── deployment.md VPS deployment with Docker Compose, TLS, backups
    ├── runbook.md    Incident playbooks (queue stuck, DB restore, ...)
    ├── sdk-guide.md  How to build a new node type
    ├── rfc.md        Academic RFC (Portuguese) — long-form rationale
    └── claude/       Implementation reference docs (stack, schema, hurdles, patterns)
```

---

## Quick start (local development)

### Prerequisites

- **Node.js** 20 LTS
- **pnpm** 10.x — `npm install -g pnpm`
- **Docker** + **Docker Compose** plugin
- **Python** 3.12+ (for the AI service)
- ~12 GB free RAM if you want the local Llama model running

### Bring it up

```bash
# 1. Clone
git clone https://github.com/<your-fork>/tietide.git
cd tietide

# 2. Configure
cp .env.example .env

# 3. Install JS deps (postinstall runs prisma generate)
pnpm install

# 4. Start stateful deps (Postgres, Valkey, Ollama, ChromaDB, Mailhog)
docker compose -f infra/docker/docker-compose.yml up -d

# 5. Apply database migrations
pnpm --filter @tietide/api prisma migrate dev

# 6. Pull the AI model (first time only — ~5 GB)
docker compose -f infra/docker/docker-compose.yml exec ollama ollama pull llama3.1:8b

# 7. Run everything in dev mode (API:3030, SPA:5173, Worker, AI:8000)
pnpm dev
```

Open **http://localhost:5173**, register an account, create a workflow, hit "Run".

### Useful scripts

| Command                  | What it does                                |
| ------------------------ | ------------------------------------------- |
| `pnpm dev`               | Start all apps in watch mode                |
| `pnpm build`             | Build every package and app                 |
| `pnpm test`              | Run every test suite (Jest, Vitest, pytest) |
| `pnpm lint`              | ESLint across the monorepo                  |
| `pnpm typecheck`         | `tsc --noEmit` across the monorepo          |
| `pnpm format`            | Prettier on everything                      |
| `pnpm loadtest:api`      | k6 read-path p95 < 200 ms                   |
| `pnpm loadtest:workflow` | k6 3-node workflow p95 < 5 s                |

> **Windows note:** Turborepo can be blocked by Application Control on Windows ([hurdle #17](docs/claude/hurdles.md)). Local scripts use `pnpm -r`; CI uses Turbo on Linux.

---

## Production deployment

For VPS deployment with Docker Compose, TLS via Let's Encrypt, encrypted backups, and SMTP health alerting, follow [**docs/deployment.md**](docs/deployment.md). When something breaks, [**docs/runbook.md**](docs/runbook.md) has the playbooks.

To extend the platform with a new connector (HTTP node, Slack node, your own API), follow [**docs/sdk-guide.md**](docs/sdk-guide.md).

---

## Documentation map

| If you want to...                                        | Read                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| Understand the project's motivation and design decisions | [docs/rfc.md](docs/rfc.md)                                   |
| Deploy to a VPS                                          | [docs/deployment.md](docs/deployment.md)                     |
| Handle an incident                                       | [docs/runbook.md](docs/runbook.md)                           |
| Add a new node type                                      | [docs/sdk-guide.md](docs/sdk-guide.md)                       |
| Look up environment variables                            | [docs/claude/environment.md](docs/claude/environment.md)     |
| Look up the database schema                              | [docs/claude/schema.md](docs/claude/schema.md)               |
| Look up REST endpoints                                   | [docs/claude/api-endpoints.md](docs/claude/api-endpoints.md) |
| Look up the SDK contract                                 | [docs/claude/sdk-contract.md](docs/claude/sdk-contract.md)   |
| Find the design system tokens                            | [docs/claude/design-system.md](docs/claude/design-system.md) |
| Run / interpret performance tests                        | [docs/performance/README.md](docs/performance/README.md)     |
| Operate backups + alerting                               | [infra/backups/README.md](infra/backups/README.md)           |

The `CLAUDE.md` file at the repo root is a navigation hub for AI-assisted development and is the canonical index of architectural patterns, security mandates, and known hurdles.

---

## Status

**MVP development** — targeting May 2026 for the academic deliverable, then continued as a real product. The roadmap by sprint is in [docs/rfc.md §4.1](docs/rfc.md#41-cronograma).

Sprint progress is tracked on the [GitHub Project board](docs/claude/project-management.md).

---

## License

MIT — see [LICENSE](LICENSE). All third-party dependencies are MIT, Apache-2.0, BSD, or ISC; the licensing matrix is in [docs/rfc.md §3.3.4](docs/rfc.md#334-licenciamento).
