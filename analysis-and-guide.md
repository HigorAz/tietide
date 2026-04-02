# TieTide — Project Analysis & Step-by-Step Guide

## 1. Project Analysis Summary

### Verdict: The project is solid, well-scoped, and viable.

Your RFC is one of the most complete I've seen for a college final project. The problem (digital fragmentation), the positioning (between Zapier simplicity and n8n power), and the tech stack are all well-reasoned. Below are my specific recommendations before you start coding.

---

## 2. Recommendations & Changes

### 2.1 Critical Changes (Do These)

**A) AI Service: Local Model with a Pragmatic Approach**
Your RFC proposes FastAPI + local LLM (Llama/Mistral) + RAG. This is ambitious but achievable if you scope it correctly. Here's the pragmatic path:
- **Model**: Use Ollama to run Llama 3.1 8B or Mistral 7B locally. Ollama gives you a Docker-friendly, OpenAI-compatible API with zero GPU configuration hassle. It runs on CPU (slower but works) or GPU if available.
- **RAG**: Start simple. Use ChromaDB (Python, lightweight) as your vector store. Embed your node taxonomy, workflow JSON schema docs, and a few annotated examples. Don't over-engineer the retrieval — 10-20 well-crafted documents are enough for the PoC.
- **FastAPI service**: Keep it thin. 3 endpoints: `POST /generate-docs` (main), `GET /health`, `POST /ingest` (to load RAG documents). The NestJS API calls FastAPI via HTTP.
- **Fallback for demo day**: Pre-generate documentation for your demo workflows and cache them. If the model is slow or down, serve cached responses instantly.
- **Development order**: Build the AI service LAST (Sprint S7). Get the core platform working first. The AI service is impressive but the platform must stand on its own.

**B) Drop the Observability Stack from Sprint 0**
Prometheus + Grafana + Loki + Promtail is 4 extra containers from day one. This creates noise when you're trying to get the core working.
- **Instead**: Use structured logging (pino/winston) to stdout + a simple `/health` endpoint. Add Prometheus metrics in S8 (Quality sprint), and Grafana/Loki only if you have time.
- **Why**: Your professors will evaluate the *platform features*, not your Grafana dashboards.

**C) Use Valkey consistently (not Redis)**
Your docs switch between "Redis" and "Valkey." Pick one name. Since Valkey is the open-source fork and BullMQ works with both, use Valkey everywhere in docs and docker-compose but configure it as Redis-compatible.

**D) Simplify the Gateway for MVP**
Traefik with TLS/Let's Encrypt is great for production but unnecessary for local dev and early sprints.
- **Instead**: Use a simple nginx reverse proxy in docker-compose for local dev. Add Traefik when you deploy to VPS (around S9-S10).

### 2.2 Recommended Improvements

**E) Add an API Client Layer (SDK)**
In your monorepo, create a `packages/api-client` that auto-generates TypeScript types from your OpenAPI spec. The frontend consumes this instead of raw fetch calls. This ensures type safety end-to-end.

**F) Use Drizzle ORM instead of Prisma**
Prisma is good, but Drizzle is lighter, faster, and gives you more control over queries. For an iPaaS where you'll do complex JSON operations on PostgreSQL, Drizzle's SQL-like syntax is more natural. However, if you're already comfortable with Prisma, stick with it — don't switch for the sake of switching.

**G) Authentication: Start with simple JWT, skip OAuth2**
Your RFC mentions OAuth2/OIDC in the roadmap. For MVP, just do email/password + JWT. Don't even mention OAuth2 in your sprint scope — it's a rabbit hole.

**H) Add a "Dry Run" mode**
When a user builds a workflow, let them test individual nodes before running the whole thing. This is a UX differentiator that's easy to implement (just execute a single node with mock input).

### 2.3 Things That Are Already Great (Don't Change)

- **Monorepo with pnpm/turborepo** — perfect choice
- **NestJS for API and Worker** — code sharing, DI, testing built-in
- **BullMQ for job queue** — native repeatable jobs, retry, DLQ
- **React Flow for canvas** — don't build your own
- **PostgreSQL with JSONB** — ideal for workflow definitions
- **Docker Compose deployment** — simple and effective
- **TDD approach** — will save you during refactors
- **The "Maré de Dados" UX concept** — unique and memorable

---

## 3. Step-by-Step Guide (What to Do Before Coding)

### Phase 0: Pre-Development Setup (1-2 days)

#### Step 1: Create the GitHub Repository
```
tietide/
├── .github/
│   └── workflows/         # CI/CD pipelines (add later)
├── apps/
│   ├── api/               # NestJS API
│   ├── worker/            # NestJS Worker
│   ├── ai/                # FastAPI AI Service (Python)
│   └── spa/               # React SPA
├── packages/
│   ├── shared/            # Shared types, constants, utils
│   ├── sdk/               # Connector SDK (interfaces)
│   └── eslint-config/     # Shared ESLint config
├── infra/
│   └── docker/            # Dockerfiles, docker-compose
├── docs/                  # Architecture docs, ADRs
├── CLAUDE.md              # Claude Code instructions
├── turbo.json             # Turborepo config
├── pnpm-workspace.yaml    # Monorepo workspace
├── package.json           # Root package.json
├── .env.example           # Environment variables template
├── .gitignore
└── README.md
```

#### Step 2: Initialize the Monorepo
- Install pnpm globally
- Run `pnpm init` at root
- Create `pnpm-workspace.yaml` pointing to `apps/*` and `packages/*`
- Install turborepo: `pnpm add -D turbo`
- Configure `turbo.json` with build/test/lint pipelines

#### Step 3: Setup Development Environment
- Docker Desktop installed
- Node.js 20+ (LTS)
- Python 3.12+ (for AI service)
- pnpm 9+
- VS Code with extensions: ESLint, Prettier, Prisma, Tailwind CSS IntelliSense, Python
- Create `.env.example` with all environment variables (see CLAUDE.md)

#### Step 4: Create `docker-compose.yml`
Start with just the infrastructure services:
- PostgreSQL 16
- Valkey (Redis-compatible)
- (Optional) Mailhog for email testing

#### Step 5: Place the CLAUDE.md at the root
This is the file I'm creating for you. It will guide Claude Code through the entire project.

### Phase 1: Backend Foundation (Sprints S0-S1)

#### Step 6: Scaffold NestJS API (`apps/api`)
- `nest new api --strict --package-manager pnpm`
- Configure: TypeScript strict mode, path aliases
- Setup Prisma ORM with PostgreSQL
- Create initial schema: `User`, `Workflow`, `WorkflowExecution`
- Write first test: health check endpoint

#### Step 7: Implement Authentication (TDD)
1. Write tests for: register, login, JWT validation
2. Implement User entity and Prisma schema
3. Implement AuthService (register, login, validateToken)
4. Implement AuthController with guards
5. Test with Insomnia/Postman

#### Step 8: Implement Workflow CRUD (TDD)
1. Write tests for: create, read, update, delete, list workflows
2. Implement Workflow entity (JSON definition stored as JSONB)
3. Implement WorkflowService
4. Implement WorkflowController
5. Add OpenAPI/Swagger decorators

#### Step 9: Scaffold NestJS Worker (`apps/worker`)
- Create separate NestJS app for the worker
- Configure BullMQ with Valkey connection
- Create a basic queue consumer that logs jobs
- Write test: enqueue job → worker processes it

### Phase 2: Execution Engine (Sprints S2-S3)

#### Step 10: Build the Execution Engine (TDD)
1. Define the Node interface (SDK):
   ```typescript
   interface NodeDefinition {
     type: string;
     execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput>;
   }
   ```
2. Implement ManualTrigger node
3. Implement HTTPRequest node
4. Implement ConditionalIF node
5. Build the WorkflowRunner that traverses the node graph
6. Write integration tests: multi-node workflow execution

#### Step 11: Connect API → Queue → Worker
1. API enqueues workflow execution via BullMQ
2. Worker picks up the job
3. Worker runs the WorkflowRunner
4. Results are persisted to PostgreSQL
5. Write E2E test: API trigger → queue → worker → DB

### Phase 3: Frontend & Editor (Sprints S4-S5)

#### Step 12: Scaffold React SPA (`apps/spa`)
- `pnpm create vite spa --template react-ts`
- Install: React Flow, Tailwind CSS, shadcn/ui, Zustand
- Configure the design system (CSS variables, dark theme)
- Create basic layout: sidebar + canvas + config panel

#### Step 13: Build the Visual Editor ("Maré de Dados")
1. Implement CustomNode component (hybrid circle + card)
2. Implement LivingInkEdge component (animated connections)
3. Implement node library sidebar (drag to add)
4. Implement node configuration panel (right side)
5. Implement save/load workflow (connect to API)

#### Step 14: Build Workflow Management Pages
1. Dashboard: list all workflows
2. Create new workflow modal
3. Workflow settings page
4. Connect everything to API via fetch/axios

### Phase 4: History & Monitoring (Sprint S6)

#### Step 15: Execution History
1. API endpoint: list executions for a workflow
2. API endpoint: get execution detail (per-node logs)
3. Frontend: execution history table with filters
4. Frontend: execution detail view (node-by-node)

### Phase 5: AI Documentation Service (Sprint S7)

#### Step 16: Setup Ollama + Model
1. Add Ollama to `docker-compose.yml` (runs Llama 3.1 8B or Mistral 7B)
2. Pull the model on first start: `ollama pull llama3.1:8b`
3. Verify the model responds via `http://localhost:11434/api/generate`

#### Step 17: Build FastAPI AI Service (`apps/ai`)
1. Create `apps/ai/` with Python project: FastAPI, chromadb, langchain, httpx
2. Create `Dockerfile` with Python 3.12 slim
3. Implement health check: `GET /health` (checks Ollama connectivity)
4. Implement RAG ingestion: `POST /ingest`
   - Load node taxonomy docs (what each node type does)
   - Load workflow JSON schema description
   - Load 3-5 annotated example workflows with their documentation
   - Embed and store in ChromaDB (persistent volume)
5. Implement documentation generation: `POST /generate-docs`
   - Receive workflow JSON
   - Query ChromaDB for relevant context (node descriptions, similar examples)
   - Build prompt: system context + RAG results + workflow JSON
   - Call Ollama API (OpenAI-compatible endpoint)
   - Return structured documentation (objective, steps, triggers, actions, decisions)
6. Write tests: health check, ingestion, generation with mock Ollama

#### Step 18: Integrate AI with TieTide Platform
1. NestJS API endpoint: `POST /api/workflows/:id/generate-docs`
2. API calls FastAPI service via HTTP
3. Frontend: "Generate Documentation" button on workflow page
4. Display generated documentation with edit/copy capability
5. Cache generated docs in PostgreSQL (avoid re-generating for unchanged workflows)

### Phase 6: Quality & Polish (Sprints S8-S12)

#### Step 19: Quality Gates
- Ensure 70%+ test coverage on core modules
- Run load tests (k6 or artillery) for API performance
- Fix any failing E2E tests

#### Step 20: Security Hardening
- Encrypt secrets in DB (libsodium)
- Add rate limiting (NestJS throttler)
- HMAC webhook validation
- Security headers (Helmet)

#### Step 21: Deployment
- Finalize docker-compose for production
- Setup VPS with TLS
- Configure CI/CD pipeline (GitHub Actions)
- Deploy and test

#### Step 22: Demo Preparation
- Create demo workflows with real integrations
- Record backup video of the demo
- Prepare presentation slides
- Print poster

---

## 4. Architecture Decision Records (Quick Reference)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript 100% | Type safety, code sharing, single language |
| API Framework | NestJS | DI, modules, testing, enterprise patterns |
| Frontend | React + Vite | Ecosystem, React Flow compatibility |
| Database | PostgreSQL | JSONB, robustness, industry standard |
| ORM | Prisma | Type safety, migrations, DX |
| Queue | BullMQ + Valkey | Repeatable jobs, retry/DLQ, zero cost |
| State Management | Zustand | Simple, performant, minimal boilerplate |
| Canvas Library | React Flow | Industry standard for node-based UIs |
| UI Components | shadcn/ui + Tailwind | Accessible, customizable, fast |
| Monorepo | pnpm + Turborepo | Code sharing, single versioning |
| AI (MVP) | Ollama + FastAPI + ChromaDB | Local model proves learning, privacy-first, self-hostable |
| Auth | JWT (local) | Simple, stateless, well-understood |
| Deployment | Docker Compose | Single command setup, portable |

---

## 5. Risk Mitigation for College Context

| Risk | Mitigation |
|------|-----------|
| Scope creep | Strict MVP: only 3 triggers + 3 actions. Everything else is "future" |
| AI PoC fails | Have cached/pre-generated docs for demo workflows. Ollama can run on CPU if no GPU available (slower but works). Keep FastAPI service thin so it starts fast |
| Time pressure | The editor (React Flow) and execution engine are the 2 must-haves. Everything else is secondary |
| Demo day issues | Deploy 1 week early, have offline demo video as backup |
| Professor expectations | Document every decision in ADRs, show testing coverage, demonstrate CI/CD |
