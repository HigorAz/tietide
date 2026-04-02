# CLAUDE.md — TieTide iPaaS Platform

> **Last updated**: 2026-03-04
> **Project**: TieTide — Integration & Automation Platform as a Service (iPaaS)
> **Author**: Higor Azevedo
> **Status**: MVP Development (Portfólio II)

---

## 1. Architecture Overview

TieTide is an open-source, self-hostable iPaaS platform built as a monorepo with three main applications and shared packages. The architecture follows an **event-driven** pattern with a decoupled API and Worker communicating through a message queue.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SPA (React)│────▶│  API (NestJS)│────▶│  Queue       │
│   Port 5173  │◀────│  Port 3000   │     │  (Valkey)    │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                    │
                    ┌──────▼──────┐     ┌──────▼──────┐
                    │  PostgreSQL  │◀────│Worker (NestJS)│
                    │  Port 5432   │     │  (BullMQ)    │
                    └─────────────┘     └─────────────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │  AI Service  │────▶│   Ollama     │
                    │  (FastAPI)   │     │  (LLM local) │
                    │  Port 8000   │     │  Port 11434  │
                    └──────┬──────┘     └─────────────┘
                           │
                    ┌──────▼──────┐
                    │  ChromaDB    │
                    │  (Vector DB) │
                    └─────────────┘
```

### Request Flow
1. **User** interacts with the SPA (React + React Flow canvas)
2. **SPA** calls the **API** via REST endpoints
3. **API** validates, persists to **PostgreSQL**, and enqueues jobs to **Valkey** via BullMQ
4. **Worker** consumes jobs, executes workflow nodes sequentially, persists execution results
5. **SPA** polls or receives updates on execution status

### AI Documentation Flow
1. **User** clicks "Generate Documentation" on a workflow
2. **SPA** calls `POST /api/workflows/:id/generate-docs`
3. **API** fetches workflow definition, calls **AI Service** (FastAPI) via HTTP
4. **AI Service** queries **ChromaDB** for relevant context (node taxonomy, examples)
5. **AI Service** builds a prompt with RAG context + workflow JSON, calls **Ollama** (local LLM)
6. **Ollama** generates documentation text, returns to AI Service → API → SPA

### Key Architectural Patterns
- **Layered Architecture**: Controllers → Services → Repositories/Adapters
- **Ports & Adapters (Hexagonal)**: Infrastructure is behind interfaces (DB, queue, HTTP clients)
- **Event-Driven**: API ↔ Worker communication via BullMQ jobs
- **Plugin Architecture**: Nodes implement a standard interface for extensibility
- **Monorepo**: Shared types and SDK across all apps

---

## 2. Full Technology Stack

### Languages
| Component | Language | Version |
|-----------|----------|---------|
| API | TypeScript | 5.x |
| Worker | TypeScript | 5.x |
| SPA | TypeScript | 5.x |
| AI Service | Python | 3.12+ |
| Tooling | Node.js | 20 LTS |

### Frameworks & Libraries

**API (`apps/api`)**
- NestJS 10.x — framework with DI, modules, guards, pipes
- Prisma 5.x — ORM with migrations and type generation
- BullMQ 5.x — job producer (enqueue workflow executions)
- class-validator + class-transformer — DTO validation
- @nestjs/swagger — OpenAPI/Swagger auto-generation
- @nestjs/jwt + passport-jwt — JWT authentication
- helmet — security headers
- pino / nestjs-pino — structured JSON logging

**Worker (`apps/worker`)**
- NestJS 10.x — same framework as API for consistency
- BullMQ 5.x — job consumer (process workflow executions)
- Prisma 5.x — shared schema with API
- libsodium-wrappers — decrypt secrets at execution time

**SPA (`apps/spa`)**
- React 18.x — UI library
- Vite 5.x — build tool and dev server
- React Flow 11.x — node-based canvas editor
- Tailwind CSS 3.x — utility-first CSS
- shadcn/ui — accessible component library (built on Radix UI)
- Zustand 4.x — lightweight state management
- React Router 6.x — client-side routing
- Axios or ky — HTTP client

**Shared (`packages/shared`)**
- Zod — runtime validation schemas shared between API and SPA
- TypeScript interfaces — workflow definitions, node types, execution results

**Connector SDK (`packages/sdk`)**
- Node interface definitions
- Input/output schemas
- Validation utilities

**AI Service (`apps/ai`)**
- FastAPI 0.110+ — Python async web framework
- LangChain 0.2+ — LLM orchestration, prompt templates, RAG pipeline
- ChromaDB 0.5+ — lightweight vector database for RAG embeddings
- sentence-transformers — text embedding model (all-MiniLM-L6-v2)
- httpx — async HTTP client to call Ollama API
- uvicorn — ASGI server
- pydantic — request/response validation
- pytest + httpx — testing

### Infrastructure
| Service | Image/Version | Port | Purpose |
|---------|--------------|------|---------|
| PostgreSQL | postgres:16-alpine | 5432 | Primary database |
| Valkey | valkey/valkey:8-alpine | 6379 | Message queue (Redis-compatible) |
| Ollama | ollama/ollama:latest | 11434 | Local LLM inference (Llama 3.1 8B / Mistral 7B) |
| ChromaDB | chromadb/chroma:latest | 8001 | Vector database for RAG embeddings |
| Mailhog | mailhog/mailhog | 8025/1025 | Email testing (dev only) |

### DevX & Quality
- **pnpm 9.x** — package manager
- **Turborepo** — monorepo build orchestration
- **ESLint** — linting (flat config)
- **Prettier** — code formatting
- **Husky** — git hooks (pre-commit)
- **lint-staged** — run linters on staged files
- **Commitlint** — conventional commits enforcement
- **Vitest** — unit/integration testing (SPA)
- **Jest** — unit/integration testing (API, Worker)
- **Supertest** — HTTP integration testing

### CI/CD
- **GitHub Actions** — lint, test, coverage, build, Docker image push
- **Docker Compose** — local development and production deployment
- **GitHub Container Registry** — Docker image storage

---

## 3. Environment Variables

### Root `.env` (Docker Compose)
```bash
# === Database ===
DATABASE_URL=postgresql://tietide:tietide_secret@localhost:5432/tietide?schema=public
POSTGRES_USER=tietide
POSTGRES_PASSWORD=tietide_secret
POSTGRES_DB=tietide

# === Valkey/Redis ===
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# === API ===
API_PORT=3000
API_HOST=0.0.0.0
NODE_ENV=development

# === Authentication ===
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# === Secrets Encryption ===
ENCRYPTION_MASTER_KEY=base64-encoded-32-byte-key-for-libsodium

# === AI Service (Local Model via Ollama) ===
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b           # or mistral:7b
AI_SERVICE_URL=http://localhost:8000
CHROMA_HOST=localhost
CHROMA_PORT=8001
CHROMA_COLLECTION=tietide_docs
EMBEDDING_MODEL=all-MiniLM-L6-v2   # sentence-transformers model for RAG

# === Worker ===
WORKER_CONCURRENCY=5
WORKER_MAX_RETRIES=3
WORKER_RETRY_DELAY=5000

# === SPA ===
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=TieTide

# === Logging ===
LOG_LEVEL=debug               # debug | info | warn | error

# === Webhooks ===
WEBHOOK_BASE_URL=http://localhost:3000/webhooks
WEBHOOK_HMAC_SECRET=your-webhook-hmac-secret
```

### Production Additions
```bash
# === TLS/Gateway ===
DOMAIN=app.tietide.com
ACME_EMAIL=admin@tietide.com

# === Database (Production) ===
DATABASE_URL=postgresql://user:pass@db-host:5432/tietide?schema=public&sslmode=require

# === Rate Limiting ===
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# === AI Service (Production — use GPU-enabled host) ===
OLLAMA_NUM_PARALLEL=2              # Concurrent requests
OLLAMA_MAX_LOADED_MODELS=1         # Memory management
```

---

## 4. Directory Structure

```
tietide/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + test + coverage on PR
│       └── deploy.yml                # Build + push Docker images on merge to main
│
├── apps/
│   ├── api/                          # NestJS REST API
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap, Swagger setup
│   │   │   ├── app.module.ts          # Root module
│   │   │   ├── common/               # Guards, interceptors, filters, decorators
│   │   │   │   ├── guards/
│   │   │   │   │   └── jwt-auth.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── logging.interceptor.ts
│   │   │   │   ├── filters/
│   │   │   │   │   └── http-exception.filter.ts
│   │   │   │   └── decorators/
│   │   │   │       └── current-user.decorator.ts
│   │   │   ├── auth/                  # Authentication module
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.controller.spec.ts
│   │   │   │   ├── auth.service.spec.ts
│   │   │   │   ├── dto/
│   │   │   │   │   ├── register.dto.ts
│   │   │   │   │   └── login.dto.ts
│   │   │   │   └── strategies/
│   │   │   │       └── jwt.strategy.ts
│   │   │   ├── workflows/             # Workflow CRUD module
│   │   │   │   ├── workflows.module.ts
│   │   │   │   ├── workflows.controller.ts
│   │   │   │   ├── workflows.service.ts
│   │   │   │   ├── workflows.controller.spec.ts
│   │   │   │   ├── workflows.service.spec.ts
│   │   │   │   └── dto/
│   │   │   │       ├── create-workflow.dto.ts
│   │   │   │       └── update-workflow.dto.ts
│   │   │   ├── executions/            # Execution history module
│   │   │   │   ├── executions.module.ts
│   │   │   │   ├── executions.controller.ts
│   │   │   │   ├── executions.service.ts
│   │   │   │   └── dto/
│   │   │   ├── webhooks/              # Webhook trigger endpoints
│   │   │   │   ├── webhooks.module.ts
│   │   │   │   ├── webhooks.controller.ts
│   │   │   │   └── webhooks.service.ts
│   │   │   ├── secrets/               # Encrypted secrets management
│   │   │   │   ├── secrets.module.ts
│   │   │   │   ├── secrets.controller.ts
│   │   │   │   ├── secrets.service.ts
│   │   │   │   └── crypto.service.ts
│   │   │   ├── ai/                    # AI documentation generation
│   │   │   │   ├── ai.module.ts
│   │   │   │   ├── ai.controller.ts
│   │   │   │   └── ai.service.ts
│   │   │   ├── health/                # Health check endpoint
│   │   │   │   ├── health.module.ts
│   │   │   │   └── health.controller.ts
│   │   │   └── prisma/                # Prisma service wrapper
│   │   │       ├── prisma.module.ts
│   │   │       └── prisma.service.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Database schema
│   │   │   ├── migrations/            # Auto-generated migrations
│   │   │   └── seed.ts                # Seed data for development
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts        # E2E tests
│   │   │   └── jest-e2e.json
│   │   ├── Dockerfile
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── jest.config.ts
│   │   └── package.json
│   │
│   ├── worker/                        # NestJS Worker (Job Consumer)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── worker.module.ts
│   │   │   ├── engine/                # Workflow execution engine
│   │   │   │   ├── engine.module.ts
│   │   │   │   ├── engine.service.ts  # Orchestrates node execution
│   │   │   │   ├── engine.service.spec.ts
│   │   │   │   ├── workflow-runner.ts  # Traverses the node graph
│   │   │   │   └── workflow-runner.spec.ts
│   │   │   ├── processors/            # BullMQ job processors
│   │   │   │   ├── workflow.processor.ts
│   │   │   │   └── workflow.processor.spec.ts
│   │   │   ├── nodes/                 # Node implementations
│   │   │   │   ├── registry.ts        # Node type registry
│   │   │   │   ├── triggers/
│   │   │   │   │   ├── manual.trigger.ts
│   │   │   │   │   ├── manual.trigger.spec.ts
│   │   │   │   │   ├── cron.trigger.ts
│   │   │   │   │   ├── cron.trigger.spec.ts
│   │   │   │   │   ├── webhook.trigger.ts
│   │   │   │   │   └── webhook.trigger.spec.ts
│   │   │   │   └── actions/
│   │   │   │       ├── http-request.action.ts
│   │   │   │       ├── http-request.action.spec.ts
│   │   │   │       ├── code.action.ts
│   │   │   │       ├── code.action.spec.ts
│   │   │   │       ├── conditional.action.ts
│   │   │   │       └── conditional.action.spec.ts
│   │   │   └── prisma/
│   │   │       ├── prisma.module.ts
│   │   │       └── prisma.service.ts
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   ├── jest.config.ts
│   │   └── package.json
│   │
│   └── spa/                           # React SPA (Frontend)
│       ├── src/
│       │   ├── main.tsx               # Entry point
│       │   ├── App.tsx                # Root component with router
│       │   ├── index.css              # Global styles + CSS variables
│       │   ├── api/                   # API client layer
│       │   │   ├── client.ts          # Axios/ky instance with auth interceptor
│       │   │   ├── auth.api.ts
│       │   │   ├── workflows.api.ts
│       │   │   └── executions.api.ts
│       │   ├── components/
│       │   │   ├── ui/                # shadcn/ui components
│       │   │   ├── layout/
│       │   │   │   ├── AppLayout.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── Header.tsx
│       │   │   ├── nodes/             # React Flow custom nodes
│       │   │   │   ├── CustomNode.tsx
│       │   │   │   ├── TriggerNode.tsx
│       │   │   │   └── ActionNode.tsx
│       │   │   ├── edges/             # React Flow custom edges
│       │   │   │   └── LivingInkEdge.tsx
│       │   │   └── editor/            # Workflow editor components
│       │   │       ├── Canvas.tsx
│       │   │       ├── NodeLibrary.tsx
│       │   │       ├── NodeConfigPanel.tsx
│       │   │       └── EditorToolbar.tsx
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx
│       │   │   ├── RegisterPage.tsx
│       │   │   ├── DashboardPage.tsx
│       │   │   ├── WorkflowEditorPage.tsx
│       │   │   ├── ExecutionHistoryPage.tsx
│       │   │   └── ExecutionDetailPage.tsx
│       │   ├── stores/                # Zustand stores
│       │   │   ├── auth.store.ts
│       │   │   ├── workflow.store.ts
│       │   │   └── editor.store.ts
│       │   ├── hooks/                 # Custom React hooks
│       │   │   ├── useAuth.ts
│       │   │   └── useWorkflow.ts
│       │   ├── types/                 # Frontend-specific types
│       │   │   └── editor.types.ts
│       │   └── utils/
│       │       ├── cn.ts              # className utility
│       │       └── format.ts
│       ├── public/
│       ├── Dockerfile
│       ├── tailwind.config.ts
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── package.json
│
│   └── ai/                            # FastAPI AI Service (Python)
│       ├── src/
│       │   ├── main.py                # FastAPI app bootstrap, CORS, lifespan
│       │   ├── config.py              # Settings from env vars (pydantic-settings)
│       │   ├── routes/
│       │   │   ├── health.py          # GET /health
│       │   │   ├── docs.py            # POST /generate-docs
│       │   │   └── ingest.py          # POST /ingest (load RAG documents)
│       │   ├── services/
│       │   │   ├── llm_service.py     # Ollama client wrapper
│       │   │   ├── rag_service.py     # ChromaDB query + context builder
│       │   │   ├── prompt_service.py  # Prompt templates for documentation
│       │   │   └── embedding_service.py # sentence-transformers embeddings
│       │   ├── models/
│       │   │   ├── workflow.py        # Pydantic models for workflow JSON
│       │   │   └── responses.py       # Response models
│       │   └── data/
│       │       ├── node_taxonomy.json # Description of each node type
│       │       └── examples/          # Annotated workflow examples for RAG
│       │           ├── crm_notification.json
│       │           └── data_sync.json
│       ├── tests/
│       │   ├── conftest.py
│       │   ├── test_health.py
│       │   ├── test_generate_docs.py
│       │   └── test_rag_service.py
│       ├── Dockerfile
│       ├── requirements.txt
│       ├── pyproject.toml
│       └── README.md
│
├── packages/
│   ├── shared/                        # Shared types and utilities
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types/
│   │   │   │   ├── workflow.types.ts  # WorkflowDefinition, NodeDefinition, Edge
│   │   │   │   ├── execution.types.ts # ExecutionStatus, StepResult
│   │   │   │   ├── node.types.ts      # NodeType enum, NodeInput, NodeOutput
│   │   │   │   └── user.types.ts
│   │   │   ├── constants/
│   │   │   │   ├── node-types.ts      # NODE_TYPES enum
│   │   │   │   └── execution-status.ts
│   │   │   └── schemas/               # Zod schemas (shared validation)
│   │   │       ├── workflow.schema.ts
│   │   │       └── node.schema.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── sdk/                           # Connector/Node SDK
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── interfaces/
│   │   │   │   ├── node.interface.ts  # INode, INodeExecutor
│   │   │   │   └── context.interface.ts
│   │   │   └── base/
│   │   │       ├── base-trigger.ts
│   │   │       └── base-action.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── eslint-config/                 # Shared ESLint configuration
│       ├── index.js
│       └── package.json
│
├── infra/
│   └── docker/
│       ├── docker-compose.yml         # Dev: all services
│       ├── docker-compose.prod.yml    # Prod: with TLS, optimized images
│       ├── api.Dockerfile
│       ├── worker.Dockerfile
│       ├── spa.Dockerfile
│       └── nginx.conf                 # Reverse proxy for SPA
│
├── docs/
│   ├── adr/                           # Architecture Decision Records
│   │   ├── 001-monorepo-structure.md
│   │   ├── 002-nestjs-for-backend.md
│   │   ├── 003-bullmq-over-rabbitmq.md
│   │   └── 004-external-llm-for-mvp.md
│   ├── api/                           # API documentation
│   └── guides/
│       ├── deployment.md
│       └── development.md
│
├── CLAUDE.md                          # THIS FILE
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
├── .prettierrc
├── .eslintrc.js
├── commitlint.config.js
└── README.md
```

---

## 5. Database Schema (Prisma)

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt hashed
  name      String
  role      Role     @default(USER)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  workflows  Workflow[]
  secrets    Secret[]
  auditLogs  AuditLog[]

  @@map("users")
}

enum Role {
  USER
  ADMIN
}

model Workflow {
  id          String         @id @default(uuid())
  name        String
  description String?
  definition  Json           // Full workflow graph: nodes + edges
  isActive    Boolean        @default(false) @map("is_active")
  version     Int            @default(1)
  userId      String         @map("user_id")
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")

  user       User             @relation(fields: [userId], references: [id])
  executions WorkflowExecution[]
  webhooks   Webhook[]

  @@map("workflows")
}

model WorkflowExecution {
  id          String          @id @default(uuid())
  workflowId  String          @map("workflow_id")
  status      ExecutionStatus @default(PENDING)
  triggerType String          @map("trigger_type") // manual, cron, webhook
  triggerData Json?           @map("trigger_data")
  startedAt   DateTime?       @map("started_at")
  finishedAt  DateTime?       @map("finished_at")
  error       String?
  createdAt   DateTime        @default(now()) @map("created_at")

  workflow Workflow         @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  steps    ExecutionStep[]

  @@index([workflowId, createdAt(sort: Desc)])
  @@map("workflow_executions")
}

enum ExecutionStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
  CANCELLED
}

model ExecutionStep {
  id          String   @id @default(uuid())
  executionId String   @map("execution_id")
  nodeId      String   @map("node_id")    // ID of the node in the workflow definition
  nodeType    String   @map("node_type")
  nodeName    String   @map("node_name")
  status      ExecutionStatus @default(PENDING)
  inputData   Json?    @map("input_data")
  outputData  Json?    @map("output_data")
  error       String?
  startedAt   DateTime? @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  durationMs  Int?     @map("duration_ms")

  execution WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([executionId])
  @@map("execution_steps")
}

model Secret {
  id        String   @id @default(uuid())
  name      String
  value     String   // Encrypted with libsodium (XChaCha20-Poly1305)
  nonce     String   // Encryption nonce
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, name])
  @@map("secrets")
}

model Webhook {
  id         String   @id @default(uuid())
  workflowId String   @map("workflow_id")
  path       String   @unique // Unique URL path: /webhooks/:path
  hmacSecret String   @map("hmac_secret") // For HMAC validation
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")

  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@map("webhooks")
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  action    String   // WORKFLOW_CREATED, WORKFLOW_EXECUTED, SECRET_CREATED, etc.
  resource  String   // workflow, secret, user
  resourceId String? @map("resource_id")
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("audit_logs")
}
```

---

## 6. Services, Jobs & Models per App

### API (`apps/api`)

| Module | Service | Responsibilities |
|--------|---------|-----------------|
| Auth | AuthService | Register, login, JWT generation, password hashing (bcrypt) |
| Auth | JwtStrategy | Passport strategy for JWT validation |
| Workflows | WorkflowsService | CRUD operations, validation, version management |
| Executions | ExecutionsService | List/get executions, trigger manual execution (enqueue to BullMQ) |
| Webhooks | WebhooksService | Create webhook URLs, validate HMAC signatures, enqueue execution |
| Secrets | SecretsService | CRUD with encryption/decryption |
| Secrets | CryptoService | libsodium encrypt/decrypt wrapper |
| AI | AiService | Call FastAPI AI service via HTTP, cache results in PostgreSQL |
| Health | HealthController | GET /health — DB + Redis connectivity check |
| Prisma | PrismaService | Database connection lifecycle (onModuleInit, onModuleDestroy) |

**BullMQ Queues (Producer Side)**:
| Queue Name | Job Type | Payload |
|------------|----------|---------|
| `workflow-execution` | `execute` | `{ executionId, workflowId, triggerType, triggerData }` |
| `workflow-execution` | `cron` | `{ workflowId, cronExpression }` (repeatable) |

### Worker (`apps/worker`)

| Module | Service | Responsibilities |
|--------|---------|-----------------|
| Engine | EngineService | Orchestrate full workflow execution |
| Engine | WorkflowRunner | Graph traversal: resolve node order, execute in sequence |
| Processors | WorkflowProcessor | BullMQ consumer: receive jobs, call EngineService |
| Nodes | NodeRegistry | Map node types to executor classes |
| Nodes/Triggers | ManualTrigger | Pass-through trigger (returns trigger data) |
| Nodes/Triggers | CronTrigger | Provides cron metadata as output |
| Nodes/Triggers | WebhookTrigger | Provides webhook payload as output |
| Nodes/Actions | HttpRequestAction | Execute HTTP requests with configurable method/headers/body |
| Nodes/Actions | ConditionalAction | Evaluate IF conditions, route to true/false branches |
| Nodes/Actions | CodeAction | Execute user-provided JS/TS code (sandboxed in future) |

**BullMQ Consumer**:
- Queue: `workflow-execution`
- Concurrency: `WORKER_CONCURRENCY` (default 5)
- Retry: `WORKER_MAX_RETRIES` with exponential backoff
- DLQ: Failed jobs after max retries go to `workflow-execution-dlq`

### AI Service (`apps/ai`)

| Module/File | Component | Responsibilities |
|-------------|-----------|-----------------|
| routes | health.py | GET /health — check Ollama + ChromaDB connectivity |
| routes | docs.py | POST /generate-docs — receive workflow JSON, return documentation |
| routes | ingest.py | POST /ingest — load/reload RAG documents into ChromaDB |
| services | llm_service.py | Async wrapper for Ollama API (OpenAI-compatible format) |
| services | rag_service.py | Query ChromaDB, retrieve relevant context for prompt |
| services | prompt_service.py | Build structured prompts: system context + RAG results + workflow JSON |
| services | embedding_service.py | Generate embeddings via sentence-transformers (all-MiniLM-L6-v2) |
| data | node_taxonomy.json | Descriptions of all node types (triggers, actions, logic) |
| data/examples | *.json | Annotated workflow examples with expected documentation output |

**RAG Pipeline**:
1. **Ingest**: On startup (or via `/ingest`), load `node_taxonomy.json` + example workflows
2. **Embed**: Generate embeddings with sentence-transformers, store in ChromaDB
3. **Query**: When generating docs, embed the workflow JSON, retrieve top-K similar documents
4. **Prompt**: Combine system prompt + retrieved context + workflow JSON → send to Ollama
5. **Generate**: Ollama returns structured documentation (objective, steps, data flow)

**Ollama Configuration**:
- Model: `llama3.1:8b` (default) or `mistral:7b`
- Context window: 8192 tokens
- Temperature: 0.3 (low for consistent documentation)
- Ollama exposes OpenAI-compatible API at `http://ollama:11434/v1/chat/completions`

### SPA (`apps/spa`)

| Store (Zustand) | State | Actions |
|-----------------|-------|---------|
| authStore | user, token, isAuthenticated | login, register, logout, refreshToken |
| workflowStore | workflows[], currentWorkflow | fetchAll, create, update, delete, setActive |
| editorStore | nodes[], edges[], selectedNode, isDirty | addNode, removeNode, updateNode, addEdge, removeEdge, save |

---

## 7. Common Hurdles & Solutions

### Hurdle 1: BullMQ connection fails in Docker
**Problem**: Worker can't connect to Valkey because it starts before Valkey is ready.
**Solution**: Add `depends_on` with health check in docker-compose:
```yaml
worker:
  depends_on:
    valkey:
      condition: service_healthy
valkey:
  healthcheck:
    test: ["CMD", "valkey-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 5
```

### Hurdle 2: Prisma Client not generated
**Problem**: `PrismaClient` types missing after fresh clone.
**Solution**: Add `prisma generate` to postinstall script:
```json
"scripts": {
  "postinstall": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:push": "prisma db push",
  "db:seed": "prisma db seed"
}
```

### Hurdle 3: React Flow nodes lose state on re-render
**Problem**: Custom nodes re-render and lose internal state.
**Solution**: Memoize custom node components with `React.memo()` and use Zustand store for node data instead of local state:
```tsx
const CustomNode = React.memo(({ id, data }: NodeProps) => {
  // Read from Zustand store, not local state
  const nodeConfig = useEditorStore((s) => s.getNodeConfig(id));
  return <div>...</div>;
});
```

### Hurdle 4: Circular dependency between API and Worker packages
**Problem**: Both apps import from `packages/shared` but also need Prisma types.
**Solution**: Prisma schema lives in `apps/api/prisma/` and both apps reference the same generated client. Add to both apps' `package.json`:
```json
"dependencies": {
  "@tietide/shared": "workspace:*"
}
```
And in `tsconfig.json` use path aliases for the generated Prisma client.

### Hurdle 5: Workflow execution order — which node runs first?
**Problem**: The workflow definition is a graph, but execution must be sequential/ordered.
**Solution**: Use topological sort (Kahn's algorithm) on the directed acyclic graph (DAG):
```typescript
function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  // 1. Build adjacency list and in-degree map
  // 2. Start with nodes that have in-degree 0 (triggers)
  // 3. Process queue, reducing in-degree of neighbors
  // 4. Return ordered list
}
```

### Hurdle 6: CORS errors between SPA and API
**Problem**: Browser blocks requests from `localhost:5173` to `localhost:3000`.
**Solution**: Configure CORS in NestJS `main.ts`:
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
});
```

### Hurdle 7: Prisma migrations conflict in development
**Problem**: Multiple `prisma migrate dev` runs create conflicting migrations.
**Solution**: During early development, use `prisma db push` (no migrations) for rapid iteration. Switch to proper migrations when the schema stabilizes (around Sprint S3).

### Hurdle 8: BullMQ repeatable jobs (cron) duplicate on restart
**Problem**: Every time the worker restarts, it creates duplicate repeatable jobs.
**Solution**: Use `removeOnComplete` and check for existing repeatables:
```typescript
const existingJobs = await queue.getRepeatableJobs();
const existing = existingJobs.find(j => j.key === jobKey);
if (!existing) {
  await queue.add('cron', payload, { repeat: { cron } });
}
```

### Hurdle 9: JWT token expiration handling on frontend
**Problem**: User gets 401 errors when token expires mid-session.
**Solution**: Axios interceptor that catches 401, attempts refresh, and retries:
```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      authStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### Hurdle 10: Docker build context too large (node_modules)
**Problem**: Docker build sends gigabytes of `node_modules` as context.
**Solution**: Add `.dockerignore`:
```
node_modules
.git
*.md
.env*
dist
coverage
```

### Hurdle 11: Zustand store not persisting across page refreshes
**Problem**: Auth state lost on refresh.
**Solution**: Use Zustand `persist` middleware with localStorage for auth only:
```typescript
export const useAuthStore = create(
  persist(
    (set) => ({ token: null, user: null, /* ... */ }),
    { name: 'tietide-auth', partialize: (state) => ({ token: state.token }) }
  )
);
```

### Hurdle 12: Webhook HMAC validation timing attack
**Problem**: Simple string comparison is vulnerable to timing attacks.
**Solution**: Use `crypto.timingSafeEqual`:
```typescript
import { timingSafeEqual, createHmac } from 'crypto';

function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### Hurdle 13: Ollama model not downloaded on first `docker compose up`
**Problem**: Ollama container starts but has no model. AI service fails with connection errors.
**Solution**: Create an init script that pulls the model after Ollama starts:
```yaml
# docker-compose.yml
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
    interval: 10s
    timeout: 5s
    retries: 10

ollama-init:
  image: curlimages/curl:latest
  depends_on:
    ollama:
      condition: service_healthy
  entrypoint: >
    sh -c "curl -X POST http://ollama:11434/api/pull -d '{\"name\": \"llama3.1:8b\"}' && echo 'Model pulled successfully'"
  restart: "no"
```

### Hurdle 14: ChromaDB embeddings dimension mismatch
**Problem**: If you switch embedding models, ChromaDB rejects new vectors because dimensions don't match the existing collection.
**Solution**: Always delete and recreate the collection when changing models:
```python
# rag_service.py
def reset_collection(self):
    self.client.delete_collection(name=settings.CHROMA_COLLECTION)
    self.collection = self.client.create_collection(
        name=settings.CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"}
    )
```

### Hurdle 15: Ollama response is slow (30+ seconds) on CPU-only machines
**Problem**: Local LLM inference without GPU is slow, especially for longer documentation.
**Solution**: Multiple mitigations:
1. Use a smaller model: `mistral:7b` is faster than `llama3.1:8b`
2. Limit `max_tokens` to 1024 (documentation doesn't need to be a novel)
3. Cache generated docs in PostgreSQL — only regenerate if workflow changed
4. For demo day: pre-warm the model by sending a dummy request on startup
```python
# In FastAPI lifespan
async def warmup_model():
    await llm_service.generate("Say hello", max_tokens=10)
```

### Hurdle 16: FastAPI AI service can't find ChromaDB in Docker network
**Problem**: `localhost` doesn't resolve between containers.
**Solution**: Use Docker service names as hostnames:
```python
# config.py
CHROMA_HOST = os.getenv("CHROMA_HOST", "chromadb")  # Docker service name, not localhost
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
```

---

## 8. Design Patterns

### Pattern 1: Repository Pattern (Data Access)
Each entity has a repository that abstracts Prisma queries. Services never call Prisma directly.
```typescript
// workflows.repository.ts
@Injectable()
export class WorkflowsRepository {
  constructor(private prisma: PrismaService) {}
  async findByUserId(userId: string): Promise<Workflow[]> {
    return this.prisma.workflow.findMany({ where: { userId } });
  }
}
```

### Pattern 2: Strategy Pattern (Node Execution)
Each node type implements the `INodeExecutor` interface. The engine resolves the right executor at runtime.
```typescript
interface INodeExecutor {
  readonly type: string;
  execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput>;
}
```

### Pattern 3: Registry Pattern (Node Registration)
A central registry maps node type strings to executor instances.
```typescript
@Injectable()
export class NodeRegistry {
  private executors = new Map<string, INodeExecutor>();
  register(executor: INodeExecutor) { this.executors.set(executor.type, executor); }
  resolve(type: string): INodeExecutor { return this.executors.get(type); }
}
```

### Pattern 4: Builder Pattern (Workflow Definition)
Use a builder to construct workflow definitions for testing.
```typescript
const workflow = new WorkflowBuilder()
  .addTrigger('manual', { name: 'Start' })
  .addAction('http-request', { url: 'https://api.example.com' })
  .addAction('conditional', { condition: '{{prev.status}} === 200' })
  .connect('trigger-1', 'action-1')
  .connect('action-1', 'action-2')
  .build();
```

### Pattern 5: Guard Pattern (Authentication)
NestJS guards protect routes. Apply globally or per-controller.
```typescript
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController { /* all routes require auth */ }
```

### Pattern 6: DTO + Validation Pipeline
All input is validated through DTOs before reaching services.
```typescript
@IsString() @MinLength(1) @MaxLength(255) name: string;
@IsObject() @ValidateNested() definition: WorkflowDefinitionDto;
```

### Pattern 7: Event Pattern (API → Worker)
API enqueues events; Worker processes them. Never direct calls.
```typescript
// API side (producer)
await this.executionQueue.add('execute', { executionId, workflowId });

// Worker side (consumer)
@Processor('workflow-execution')
export class WorkflowProcessor {
  @Process('execute')
  async handleExecution(job: Job<ExecutionPayload>) { /* ... */ }
}
```

### Pattern 8: Interceptor Pattern (Logging, Timing)
NestJS interceptors wrap all requests for cross-cutting concerns.
```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => console.log(`${context.getHandler().name} - ${Date.now() - start}ms`))
    );
  }
}
```

### Pattern 9: Factory Pattern (Node Creation)
Create node instances from workflow definition JSON.
```typescript
class NodeFactory {
  static create(definition: NodeDefinition): INodeExecutor {
    switch (definition.type) {
      case 'http-request': return new HttpRequestAction(definition.config);
      case 'conditional': return new ConditionalAction(definition.config);
      default: throw new Error(`Unknown node type: ${definition.type}`);
    }
  }
}
```

### Pattern 10: Singleton Pattern (Prisma Client)
One Prisma client instance per application, managed by NestJS DI.
```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect(); }
}
```

### Pattern 11: Adapter Pattern (External Services)
External HTTP calls are wrapped in adapters that can be mocked in tests.
```typescript
interface IHttpAdapter {
  request(config: HttpRequestConfig): Promise<HttpResponse>;
}
// Production: uses axios; Tests: uses mock
```

### Pattern 12: Observer Pattern (Execution Status Updates)
Emit events when execution status changes (for future WebSocket support).
```typescript
@Injectable()
export class ExecutionEventEmitter {
  private emitter = new EventEmitter();
  onStatusChange(executionId: string, callback: (status: ExecutionStatus) => void) { /* ... */ }
  emit(executionId: string, status: ExecutionStatus) { /* ... */ }
}
```

### Pattern 13: Middleware Pattern (Webhook Validation)
Validate HMAC signature before the request reaches the controller.
```typescript
@Injectable()
export class WebhookValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const signature = req.headers['x-webhook-signature'];
    if (!verifyHmac(req.rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    next();
  }
}
```

### Pattern 14: Template Method Pattern (Base Node Class)
Base class defines execution lifecycle; subclasses implement specifics.
```typescript
abstract class BaseAction implements INodeExecutor {
  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    this.validate(input);           // Template step 1
    const result = await this.run(input, context);  // Template step 2 (abstract)
    return this.transform(result);   // Template step 3
  }
  abstract run(input: NodeInput, context: ExecutionContext): Promise<any>;
  protected validate(input: NodeInput) { /* default validation */ }
  protected transform(result: any): NodeOutput { return { data: result }; }
}
```

---

## 9. Testing Strategy (TDD)

### Test Pyramid
```
        ┌────────┐
        │  E2E   │  ← 10% (critical user flows)
       ┌┴────────┴┐
       │Integration│  ← 30% (API endpoints, DB queries)
      ┌┴──────────┴┐
      │    Unit     │  ← 60% (services, nodes, utils)
      └────────────┘
```

### Testing Rules
1. **Write the test FIRST** (Red → Green → Refactor)
2. **Every node type** has at least 3 tests: happy path, error case, edge case
3. **Every API endpoint** has integration tests with Supertest
4. **Every service method** has unit tests with mocked dependencies
5. **Naming convention**: `describe('ServiceName') → describe('methodName') → it('should...')`
6. **No test should depend on another test** — each test sets up its own state
7. **Use factories** for test data (avoid hardcoded objects in every test)

### Test Configuration
- **API/Worker**: Jest + `@nestjs/testing` + Supertest
- **SPA**: Vitest + React Testing Library
- **Coverage target**: 70% minimum on core modules (engine, API services)

### Test File Locations
- Unit tests: Co-located with source files (`*.spec.ts`)
- E2E tests: `apps/api/test/*.e2e-spec.ts`
- SPA tests: `apps/spa/src/**/*.test.tsx`

---

## 10. Design System (CSS Variables)

```css
:root {
  /* === Background === */
  --bg-deep-blue: #0A2540;
  --bg-surface: #112240;
  --bg-elevated: #1A3050;

  /* === Accent (The Tide) === */
  --accent-teal: #00D4B3;
  --accent-teal-hover: #00E8C4;
  --accent-teal-muted: rgba(0, 212, 179, 0.15);

  /* === Text === */
  --text-primary: #F6F8FA;
  --text-secondary: #6B7C93;
  --text-muted: #4A5568;

  /* === Feedback === */
  --feedback-success: #12B886;
  --feedback-error: #F03E3E;
  --feedback-warning: #FAB005;
  --feedback-info: #339AF0;

  /* === Node Status === */
  --status-idle: #6B7C93;
  --status-running: #FAB005;
  --status-success: #12B886;
  --status-failed: #F03E3E;

  /* === Spacing (consistent 4px grid) === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* === Border Radius === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

---

## 11. API Endpoints Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Login, returns JWT |
| GET | `/auth/me` | Yes | Get current user |

### Workflows
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/workflows` | Yes | List user's workflows |
| POST | `/workflows` | Yes | Create workflow |
| GET | `/workflows/:id` | Yes | Get workflow by ID |
| PATCH | `/workflows/:id` | Yes | Update workflow |
| DELETE | `/workflows/:id` | Yes | Delete workflow |
| POST | `/workflows/:id/execute` | Yes | Trigger manual execution |
| POST | `/workflows/:id/generate-docs` | Yes | Generate AI documentation |

### Executions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/workflows/:id/executions` | Yes | List executions |
| GET | `/executions/:id` | Yes | Get execution detail |
| GET | `/executions/:id/steps` | Yes | Get execution steps |

### Webhooks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/webhooks/:path` | HMAC | Receive webhook (trigger workflow) |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check (DB + Redis) |

### Secrets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/secrets` | Yes | List secrets (names only, masked values) |
| POST | `/secrets` | Yes | Create secret |
| PATCH | `/secrets/:id` | Yes | Update secret |
| DELETE | `/secrets/:id` | Yes | Delete secret |

### AI Service (Internal — FastAPI, port 8000)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check (Ollama + ChromaDB connectivity) |
| POST | `/generate-docs` | Internal | Receive workflow JSON, return generated documentation |
| POST | `/ingest` | Internal | Load/reload RAG documents into ChromaDB |

> **Note**: The AI Service is internal-only. The NestJS API proxies requests to it via `POST /api/workflows/:id/generate-docs`. The SPA never calls the AI Service directly.

---

## 12. Post-Implementation Checklist

### Per Feature
- [ ] Tests written BEFORE implementation (TDD)
- [ ] All tests passing (unit + integration)
- [ ] No TypeScript errors (`pnpm turbo typecheck`)
- [ ] Linting passes (`pnpm turbo lint`)
- [ ] API endpoint documented in Swagger decorators
- [ ] Error handling covers edge cases
- [ ] No hardcoded values (use env vars or constants)
- [ ] No `console.log` left (use structured logger)
- [ ] Code reviewed (self-review checklist)

### Per Sprint
- [ ] All user stories completed
- [ ] Coverage >= 70% on modified modules
- [ ] Docker Compose still works (`docker compose up` from scratch)
- [ ] No security vulnerabilities (`pnpm audit`)
- [ ] README updated if setup changed
- [ ] CLAUDE.md updated with new patterns/hurdles

### Pre-Demo
- [ ] Production build works
- [ ] All demo workflows tested end-to-end
- [ ] Fallback demo video recorded
- [ ] No secrets in codebase
- [ ] Health checks passing
- [ ] Error states handled gracefully in UI

---

## 13. Coding Conventions

### TypeScript
- **Strict mode** always enabled
- **No `any` type** — use `unknown` and narrow
- **Interfaces** for contracts, **types** for unions/intersections
- **Enums**: Use `const enum` or string literal unions for node types
- **Naming**: PascalCase for classes/interfaces, camelCase for functions/variables, UPPER_SNAKE for constants

### NestJS
- **One module per domain** (auth, workflows, executions, etc.)
- **Controllers** only handle HTTP — no business logic
- **Services** contain business logic — no Prisma calls directly
- **Repositories** handle data access — no business logic
- **DTOs** validated with class-validator decorators

### React
- **Functional components** only (no class components)
- **Hooks** for state and effects
- **Zustand** for global state — no prop drilling beyond 2 levels
- **Component files**: PascalCase (`CustomNode.tsx`)
- **Hook files**: camelCase with `use` prefix (`useWorkflow.ts`)

### Git
- **Branch naming**: `feature/[ticket]-short-description`, `fix/[ticket]-short-description`
- **Commit format**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- **PR**: Always against `dev` branch, squash merge to `main`

---

## 14. Node Interface Contract (SDK)

```typescript
// packages/sdk/src/interfaces/node.interface.ts

export interface NodeInput {
  data: Record<string, unknown>;       // Data from previous node
  params: Record<string, unknown>;     // Node configuration parameters
  credentials?: Record<string, string>; // Decrypted secrets
}

export interface NodeOutput {
  data: Record<string, unknown>;
  metadata?: {
    statusCode?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

export interface ExecutionContext {
  executionId: string;
  workflowId: string;
  nodeId: string;
  logger: Logger;
  getSecret(name: string): Promise<string>;
}

export interface INodeExecutor {
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'trigger' | 'action' | 'logic';
  readonly inputSchema: ZodSchema;   // Validates params
  readonly outputSchema: ZodSchema;  // Describes output shape

  execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput>;
}
```

---

## 15. Workflow Definition JSON Structure

```typescript
// packages/shared/src/types/workflow.types.ts

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;                        // Unique within workflow (uuid)
  type: string;                      // e.g., 'manual-trigger', 'http-request', 'conditional'
  name: string;                      // User-given label
  position: { x: number; y: number }; // Canvas position
  config: Record<string, unknown>;   // Node-specific configuration
}

export interface WorkflowEdge {
  id: string;
  source: string;                    // Source node ID
  target: string;                    // Target node ID
  sourceHandle?: string;             // For branching (e.g., 'true' | 'false')
  targetHandle?: string;
}
```

**Example workflow JSON**:
```json
{
  "nodes": [
    { "id": "n1", "type": "manual-trigger", "name": "Start", "position": { "x": 100, "y": 100 }, "config": {} },
    { "id": "n2", "type": "http-request", "name": "Fetch Data", "position": { "x": 300, "y": 100 }, "config": { "method": "GET", "url": "https://api.example.com/data", "headers": {} } },
    { "id": "n3", "type": "conditional", "name": "Check Status", "position": { "x": 500, "y": 100 }, "config": { "condition": "{{n2.data.statusCode}} === 200" } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3" }
  ]
}
```

---

## 16. Continuous Improvement

This CLAUDE.md is a living document. Update it when:
- A new pattern is established
- A new hurdle is discovered and solved
- The architecture evolves
- New environment variables are added
- New endpoints are created
- Test conventions change

**Format for updates**:
```markdown
### Hurdle N+1: [Title]
**Problem**: ...
**Solution**: ...
**Date Added**: YYYY-MM-DD
```

---

## 17. Project Management (GitHub Projects + Claude Code)

### Overview
We use **GitHub Projects** (V2) as our planning tool. Every task is a GitHub Issue. Claude Code updates tasks automatically via the `gh` CLI after completing work.

### Board Structure
The project board uses a **Board view** with these columns:

| Column | Meaning |
|--------|---------|
| **Backlog** | Not yet planned for a sprint |
| **Sprint Ready** | Planned for the current sprint, not started |
| **In Progress** | Actively being worked on |
| **In Review** | Code done, needs self-review or testing |
| **Done** | Completed, tested, merged |

### Labels
| Label | Color | Usage |
|-------|-------|-------|
| `sprint:S0` through `sprint:S12` | blue | Sprint assignment |
| `type:feature` | green | New functionality |
| `type:infra` | gray | Infrastructure/DevOps |
| `type:test` | yellow | Testing tasks |
| `type:docs` | purple | Documentation |
| `type:bug` | red | Bug fixes |
| `type:refactor` | orange | Code improvement |
| `priority:critical` | red | Must finish this sprint |
| `priority:high` | orange | Should finish this sprint |
| `priority:medium` | yellow | Nice to finish this sprint |
| `priority:low` | gray | Can move to next sprint |
| `area:api` | light blue | NestJS API |
| `area:worker` | light green | NestJS Worker |
| `area:spa` | pink | React SPA |
| `area:ai` | violet | FastAPI AI Service |
| `area:shared` | teal | Shared packages |
| `area:infra` | gray | Docker, CI/CD, deployment |

### Issue Template
Every issue follows this format:
```markdown
## Description
[What needs to be built]

## Acceptance Criteria (TDD)
- [ ] Test: [test description]
- [ ] Test: [test description]
- [ ] Implementation passes all tests
- [ ] No TypeScript/Python errors
- [ ] Linting passes

## Technical Notes
[Implementation hints, patterns to use, files to touch]

## Sprint
S[X] — [Sprint Name]
```

### Claude Code Task Automation
After completing a task, Claude Code should run these commands:

**Mark issue as done:**
```bash
gh issue close <ISSUE_NUMBER> --comment "✅ Completed. Summary of what was done:
- [list changes]
- Tests: [X] passing
- Files modified: [list]"
```

**Move to In Progress when starting:**
```bash
gh issue edit <ISSUE_NUMBER> --add-label "status:in-progress"
gh issue comment <ISSUE_NUMBER> --body "🚀 Starting work on this issue."
```

**Create a linked PR:**
```bash
gh pr create --title "feat: [description]" --body "Closes #<ISSUE_NUMBER>" --base dev
```

**When a PR with `Closes #N` is merged, GitHub auto-closes the issue.**

### Sprint Cadence
| Day | Activity |
|-----|----------|
| **Monday** | Review sprint board, pick tasks for the week, move to "Sprint Ready" |
| **Tue–Fri** | Development (TDD cycle: write test → implement → refactor) |
| **Friday** | Self-review, update CLAUDE.md if needed, move completed to "Done" |
| **Sunday** | Quick retro: what went well, what blocked, adjust next week |

### Automation Rules (GitHub Projects Settings)
Set these up in the Project settings → Workflows:
1. **Auto-add**: When an issue is added to the repo → add to project board
2. **Auto-move to Done**: When an issue is closed → move to "Done" column
3. **Auto-move to In Progress**: When a PR is opened that references an issue → move issue to "In Progress"

---

## 18. Development Methodology (GSD + Extreme Programming)

### Core Principle
**You decide WHAT. The AI decides HOW.** When inverted, results degrade.

### Tools
- **Claude Code + GSD**: All coding, testing, commits, GitHub issue updates
- **Claude Cowork**: Sprint planning, documentation, architecture review, presentations

### GSD (Get Shit Done) Framework
Installed globally: `npx get-shit-done-cc --claude --global`

GSD prevents **context rot** (quality degradation as context window fills) by spawning fresh sub-agents for each task. Each gets a clean 200K context window.

**Workflow per feature:**
```
/gsd:discuss-phase N   → Explain WHAT you need (you bring domain knowledge)
/gsd:plan-phase N      → GSD creates atomic XML sub-tasks
/gsd:execute-phase N   → Fresh agents write tests first, then code, commit atomically
/gsd:verify-work N     → Goal-backward: "What must be TRUE for this to work?"
```

**Quick fixes:** `/gsd:quick "description"` — same guarantees, no heavy planning.

### Agent Roles (Mindset Switching)
| Role | Tool | When | Prompt Focus |
|------|------|------|-------------|
| **Product Owner** | Cowork | Monday planning | Prioritize, break stories, write acceptance criteria, say NO to scope creep |
| **Developer** | Code + GSD | Tue-Thu building | TDD cycle, implement features, atomic commits |
| **QA / Tester** | Code | After each feature | Find missing edge cases, run full suite, check security (OWASP) |
| **Tech Lead** | Cowork | Friday review | Review commits, identify tech debt, update CLAUDE.md, plan refactoring |
| **DevOps** | Code | Infrastructure sprints | Docker, CI/CD, deployment, monitoring |

### TDD with AI is Multiplicative
The agent generates tests → tests become the safety net → safety net enables fast changes → fast changes generate more tests. Virtuous cycle.

**Target**: More test lines than code lines (1.5x ratio).

### Non-Negotiable Rules
1. Every commit passes CI. No exceptions.
2. No file grows past 300 lines. Extract immediately.
3. Tests come FIRST (Red → Green → Refactor).
4. Security checks every session, not just sprint S9.
5. CLAUDE.md updated every week.
6. Fresh GSD context for every task. Never work in degraded context.
7. Atomic commits: one task = one commit.

### Commit Distribution Target
| Category | % |
|----------|---|
| Features | 35-40% |
| Tests | 15-20% |
| Bug fixes | 10-15% |
| Refactoring | 10% |
| Infrastructure | 10% |
| Docs | 5-10% |
| Security | 5% |

If 80%+ of commits are features, you're cutting corners.
