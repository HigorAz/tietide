# GitHub Projects Setup Guide — TieTide

## Step 1: Setup GitHub CLI (one time)

```bash
# Install gh CLI
# macOS: brew install gh
# Windows: winget install --id GitHub.cli
# Linux: see https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
# Choose: GitHub.com → HTTPS → Login with browser

# Verify
gh auth status
```

## Step 2: Create the GitHub Repository

```bash
# Create repo (if not done yet)
gh repo create tietide --public --description "Open-source iPaaS platform for integration & automation" --clone
cd tietide

# Or if repo already exists, just clone it
# gh repo clone YOUR_USERNAME/tietide
```

## Step 3: Create the Project Board

```bash
# Create the project (GitHub Projects V2)
gh project create --owner @me --title "TieTide MVP" --format "Board"

# Note the project number from the output (e.g., "1")
# You'll use it in the commands below
```

## Step 4: Create Labels

Run this script to create all labels:

```bash
# Sprint labels
gh label create "sprint:S0" --color "0052CC" --description "Sprint 0 - Kickoff & Scaffolding"
gh label create "sprint:S1" --color "0052CC" --description "Sprint 1 - Editor Base (Maré de Dados)"
gh label create "sprint:S2" --color "0052CC" --description "Sprint 2 - Auth & Secrets"
gh label create "sprint:S3" --color "0052CC" --description "Sprint 3 - Workflow CRUD"
gh label create "sprint:S4" --color "0052CC" --description "Sprint 4 - Queue & Executor"
gh label create "sprint:S5" --color "0052CC" --description "Sprint 5 - Webhooks & Cron"
gh label create "sprint:S6" --color "0052CC" --description "Sprint 6 - History & Observability"
gh label create "sprint:S7" --color "0052CC" --description "Sprint 7 - AI PoC (RAG)"
gh label create "sprint:S8" --color "0052CC" --description "Sprint 8 - Quality & Performance"
gh label create "sprint:S9" --color "0052CC" --description "Sprint 9 - Security & Resilience"
gh label create "sprint:S10" --color "0052CC" --description "Sprint 10 - UX & Documentation"
gh label create "sprint:S11" --color "0052CC" --description "Sprint 11 - Freeze & Demo"
gh label create "sprint:S12" --color "0052CC" --description "Sprint 12 - Final Delivery"

# Type labels
gh label create "type:feature" --color "0E8A16" --description "New functionality"
gh label create "type:infra" --color "666666" --description "Infrastructure / DevOps"
gh label create "type:test" --color "FBCA04" --description "Testing tasks"
gh label create "type:docs" --color "7057FF" --description "Documentation"
gh label create "type:bug" --color "D73A4A" --description "Bug fix"
gh label create "type:refactor" --color "E36209" --description "Code improvement"

# Priority labels
gh label create "priority:critical" --color "B60205" --description "Must finish this sprint"
gh label create "priority:high" --color "D93F0B" --description "Should finish this sprint"
gh label create "priority:medium" --color "FBCA04" --description "Nice to finish this sprint"
gh label create "priority:low" --color "C5DEF5" --description "Can move to next sprint"

# Area labels
gh label create "area:api" --color "BFD4F2" --description "NestJS API"
gh label create "area:worker" --color "C2E0C6" --description "NestJS Worker"
gh label create "area:spa" --color "F9D0C4" --description "React SPA"
gh label create "area:ai" --color "D4C5F9" --description "FastAPI AI Service"
gh label create "area:shared" --color "0ABFBC" --description "Shared packages"
gh label create "area:infra" --color "CCCCCC" --description "Docker, CI/CD, deployment"
```

## Step 5: Create All Sprint Issues

Copy and run each block below. Each `gh issue create` command creates one task.

---

### SPRINT S0 — Kickoff & Scaffolding

```bash
gh issue create --title "[S0] Initialize pnpm monorepo with Turborepo" \
  --body "## Description
Initialize the root monorepo structure with pnpm workspaces and Turborepo.

## Acceptance Criteria (TDD)
- [ ] \`pnpm-workspace.yaml\` created with \`apps/*\` and \`packages/*\`
- [ ] \`turbo.json\` configured with build/test/lint/typecheck/dev pipelines
- [ ] Root \`package.json\` with all scripts (dev, build, test, lint, typecheck, format)
- [ ] \`.gitignore\`, \`.prettierrc\`, \`commitlint.config.js\` configured
- [ ] ESLint flat config for TypeScript
- [ ] Husky + lint-staged for pre-commit hooks
- [ ] \`.env.example\` with all environment variables
- [ ] \`pnpm install\` succeeds with no errors

## Technical Notes
See CLAUDE.md sections 3 and 4 for env vars and directory structure.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:infra,priority:critical,area:infra"

gh issue create --title "[S0] Create shared packages (shared + sdk + eslint-config)" \
  --body "## Description
Create the \`packages/shared\`, \`packages/sdk\`, and \`packages/eslint-config\` workspaces with all TypeScript types, interfaces, and constants.

## Acceptance Criteria (TDD)
- [ ] \`@tietide/shared\` exports: WorkflowDefinition, WorkflowNode, WorkflowEdge, ExecutionStatus, NodeType, User types
- [ ] \`@tietide/sdk\` exports: INodeExecutor, NodeInput, NodeOutput, ExecutionContext, BaseTrigger, BaseAction
- [ ] \`@tietide/eslint-config\` provides shared linting rules
- [ ] All packages build with \`pnpm turbo build\`
- [ ] TypeScript strict mode enabled

## Technical Notes
See CLAUDE.md sections 14 and 15 for the SDK interface contract and workflow JSON structure.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:feature,priority:critical,area:shared"

gh issue create --title "[S0] Scaffold NestJS API with Prisma and health check" \
  --body "## Description
Create the NestJS API application with Prisma ORM, full database schema, module structure, and a working health check endpoint.

## Acceptance Criteria (TDD)
- [ ] Test: GET /health returns 200 with \`{ status: 'ok', database: 'connected', queue: 'connected' }\`
- [ ] Prisma schema with all models: User, Workflow, WorkflowExecution, ExecutionStep, Secret, Webhook, AuditLog
- [ ] Empty module structure: auth, workflows, executions, webhooks, secrets, health, prisma
- [ ] Swagger/OpenAPI configured at /api/docs
- [ ] TypeScript strict mode, path aliases configured
- [ ] \`@tietide/shared\` and \`@tietide/sdk\` as workspace dependencies

## Technical Notes
See CLAUDE.md section 5 for the full Prisma schema.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:feature,priority:critical,area:api"

gh issue create --title "[S0] Scaffold NestJS Worker with BullMQ processor" \
  --body "## Description
Create the NestJS Worker application with BullMQ consumer, engine module, and node registry.

## Acceptance Criteria (TDD)
- [ ] Test: WorkflowProcessor receives a job and calls EngineService
- [ ] BullMQ configured to connect to Valkey
- [ ] Module structure: engine, processors, nodes (with triggers/ and actions/ folders)
- [ ] NodeRegistry service with register/resolve methods
- [ ] Basic processor that logs received jobs

## Technical Notes
See CLAUDE.md section 6 for Worker services and BullMQ configuration.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:feature,priority:critical,area:worker"

gh issue create --title "[S0] Scaffold React SPA with Tailwind, design system, and routing" \
  --body "## Description
Create the React SPA with Vite, Tailwind CSS, shadcn/ui, Zustand stores, React Router, and the TieTide dark theme.

## Acceptance Criteria (TDD)
- [ ] Vite + React + TypeScript project working
- [ ] Tailwind CSS with all CSS variables from design system (CLAUDE.md section 10)
- [ ] React Router with routes: /login, /register, /dashboard, /workflows/:id
- [ ] Empty Zustand stores: authStore, workflowStore, editorStore
- [ ] React Flow installed (not yet used)
- [ ] Basic App.tsx with router and placeholder dark-themed layout

## Technical Notes
See CLAUDE.md section 10 for all CSS variables and colors.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:feature,priority:critical,area:spa"

gh issue create --title "[S0] Scaffold FastAPI AI service with health check" \
  --body "## Description
Create the Python FastAPI service with placeholder routes, Ollama client wrapper, and ChromaDB connection setup.

## Acceptance Criteria (TDD)
- [ ] Test: GET /health returns 200
- [ ] FastAPI app with CORS and lifespan
- [ ] pydantic-settings config for Ollama, ChromaDB env vars
- [ ] Placeholder routes: /health, /generate-docs, /ingest
- [ ] Ollama client wrapper (httpx async)
- [ ] ChromaDB connection placeholder
- [ ] node_taxonomy.json with all 6 MVP node type descriptions
- [ ] Dockerfile with Python 3.12

## Technical Notes
See CLAUDE.md section 6 (AI Service) for service structure and RAG pipeline.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:feature,priority:high,area:ai"

gh issue create --title "[S0] Docker Compose with all infrastructure services" \
  --body "## Description
Create docker-compose.yml that brings up all infrastructure (PostgreSQL, Valkey, Ollama, ChromaDB) and all app services.

## Acceptance Criteria (TDD)
- [ ] PostgreSQL 16 with health check and persistent volume
- [ ] Valkey 8 with health check
- [ ] Ollama with health check and persistent volume
- [ ] Ollama-init service that auto-pulls llama3.1:8b on first run
- [ ] ChromaDB with health check and persistent volume
- [ ] API, Worker, SPA, AI service containers with hot reload
- [ ] All services start with \`docker compose up\`
- [ ] \`.dockerignore\` configured

## Technical Notes
See CLAUDE.md section 7 (Hurdles 1, 13, 16) for Docker networking gotchas.

## Sprint
S0 — Kickoff & Scaffolding" \
  --label "sprint:S0,type:infra,priority:critical,area:infra"
```

---

### SPRINT S1 — Editor Base (Maré de Dados)

```bash
gh issue create --title "[S1] Implement CustomNode component with hybrid circle + card design" \
  --body "## Description
Create the React Flow custom node component following the TieTide design: circle with icon + status ring + text card below.

## Acceptance Criteria (TDD)
- [ ] Test: CustomNode renders with title, description, icon, and status ring
- [ ] Test: Status ring color changes based on status (idle, running, success, failed)
- [ ] Circle with gradient (2.5D effect) and status ring animation
- [ ] Text block below with node name and description
- [ ] React Flow Handle components for connections (top=target, bottom=source)
- [ ] Node responds to selection (teal highlight ring)
- [ ] Memoized with React.memo to prevent re-render issues

## Technical Notes
Colors from design system: --accent-teal, --status-* variables. Use styled-components or Tailwind for dynamic styles.

## Sprint
S1 — Editor Base" \
  --label "sprint:S1,type:feature,priority:critical,area:spa"

gh issue create --title "[S1] Implement LivingInkEdge animated connection" \
  --body "## Description
Create the custom React Flow edge that renders the 'living ink' animated connection between nodes.

## Acceptance Criteria (TDD)
- [ ] Test: LivingInkEdge renders SVG path between two points
- [ ] Bezier curve path using React Flow's getBezierPath
- [ ] Teal gradient stroke (#00D4B3)
- [ ] Animated dash effect (stroke-dasharray + CSS animation)
- [ ] Subtle glow effect on the connection

## Technical Notes
Use SVG \`stroke-dasharray\` and \`stroke-dashoffset\` animation. See CLAUDE.md design system for colors.

## Sprint
S1 — Editor Base" \
  --label "sprint:S1,type:feature,priority:critical,area:spa"

gh issue create --title "[S1] Build NodeLibrary sidebar with drag-to-add" \
  --body "## Description
Create the left sidebar that lists all available node types organized by category, with drag-to-canvas functionality.

## Acceptance Criteria (TDD)
- [ ] Test: NodeLibrary renders all 6 node types in correct categories
- [ ] Categories: Triggers (Manual, Cron, Webhook), Actions (HTTP, Code, Conditional)
- [ ] Search/filter functionality
- [ ] Drag from sidebar to canvas creates a new node
- [ ] Each node type has icon, name, and short description

## Sprint
S1 — Editor Base" \
  --label "sprint:S1,type:feature,priority:critical,area:spa"

gh issue create --title "[S1] Build NodeConfigPanel (right sidebar)" \
  --body "## Description
Create the right configuration panel that appears when a node is selected on the canvas.

## Acceptance Criteria (TDD)
- [ ] Test: Panel shows correct config fields for each node type
- [ ] Dynamic form based on node type (HTTP: method/url/headers, Cron: expression, IF: condition)
- [ ] Changes in panel update the node data in Zustand store
- [ ] Panel closes when clicking on empty canvas
- [ ] Test/preview button placeholder for each node

## Sprint
S1 — Editor Base" \
  --label "sprint:S1,type:feature,priority:high,area:spa"

gh issue create --title "[S1] Build Canvas component with React Flow integration" \
  --body "## Description
Create the main Canvas component that wraps React Flow with the TieTide dark theme, custom nodes, custom edges, and editor toolbar.

## Acceptance Criteria (TDD)
- [ ] Test: Canvas renders with dark background (#0A2540)
- [ ] Custom node types registered (CustomNode)
- [ ] Custom edge types registered (LivingInkEdge)
- [ ] Zoom, pan, and minimap working
- [ ] Editor toolbar: Save, Undo, Redo, Run (placeholders)
- [ ] Workflow state managed by editorStore (Zustand)
- [ ] Save button serializes nodes+edges to WorkflowDefinition JSON

## Sprint
S1 — Editor Base" \
  --label "sprint:S1,type:feature,priority:critical,area:spa"
```

---

### SPRINT S2 — Authentication & Secrets

```bash
gh issue create --title "[S2] Implement user registration endpoint (TDD)" \
  --body "## Description
Build the POST /auth/register endpoint with email/password validation and bcrypt hashing.

## Acceptance Criteria (TDD)
- [ ] Test: Valid registration returns 201 with user (no password in response)
- [ ] Test: Duplicate email returns 409 Conflict
- [ ] Test: Invalid email format returns 400
- [ ] Test: Password shorter than 8 chars returns 400
- [ ] Password hashed with bcrypt before storing
- [ ] RegisterDto with class-validator decorators

## Sprint
S2 — Auth & Secrets" \
  --label "sprint:S2,type:feature,priority:critical,area:api"

gh issue create --title "[S2] Implement user login + JWT generation (TDD)" \
  --body "## Description
Build the POST /auth/login endpoint that validates credentials and returns a JWT token.

## Acceptance Criteria (TDD)
- [ ] Test: Valid login returns 200 with JWT token
- [ ] Test: Wrong password returns 401
- [ ] Test: Non-existent email returns 401
- [ ] JWT contains: userId, email, role
- [ ] JWT expires based on JWT_EXPIRES_IN env var
- [ ] LoginDto with class-validator decorators

## Sprint
S2 — Auth & Secrets" \
  --label "sprint:S2,type:feature,priority:critical,area:api"

gh issue create --title "[S2] Implement JWT auth guard and current user decorator" \
  --body "## Description
Build the JwtAuthGuard, JwtStrategy, and @CurrentUser decorator for protecting routes.

## Acceptance Criteria (TDD)
- [ ] Test: Protected route returns 401 without token
- [ ] Test: Protected route returns 401 with expired token
- [ ] Test: Protected route returns 200 with valid token
- [ ] Test: @CurrentUser decorator extracts user from request
- [ ] GET /auth/me returns current user profile

## Sprint
S2 — Auth & Secrets" \
  --label "sprint:S2,type:feature,priority:critical,area:api"

gh issue create --title "[S2] Implement encrypted secrets CRUD (TDD)" \
  --body "## Description
Build the secrets management system with libsodium encryption at rest.

## Acceptance Criteria (TDD)
- [ ] Test: CryptoService encrypts and decrypts correctly
- [ ] Test: Create secret stores encrypted value + nonce
- [ ] Test: List secrets returns names only (values masked)
- [ ] Test: Update secret re-encrypts with new nonce
- [ ] Test: Delete secret removes from DB
- [ ] libsodium XChaCha20-Poly1305 encryption
- [ ] Master key loaded from ENCRYPTION_MASTER_KEY env var

## Sprint
S2 — Auth & Secrets" \
  --label "sprint:S2,type:feature,priority:high,area:api"

gh issue create --title "[S2] Build Login and Register pages in SPA" \
  --body "## Description
Create the frontend auth pages with forms, validation, and API integration.

## Acceptance Criteria (TDD)
- [ ] Test: Login form submits and stores JWT in authStore
- [ ] Test: Register form submits and redirects to login
- [ ] Test: Invalid credentials show error message
- [ ] Login page with email/password form
- [ ] Register page with name/email/password form
- [ ] Auth store persists token in localStorage
- [ ] Redirect to /dashboard after successful login
- [ ] Redirect to /login when accessing protected routes without token
- [ ] API client configured with JWT interceptor

## Sprint
S2 — Auth & Secrets" \
  --label "sprint:S2,type:feature,priority:high,area:spa"
```

---

### SPRINT S3 — Workflow CRUD

```bash
gh issue create --title "[S3] Implement Workflow CRUD endpoints (TDD)" \
  --body "## Description
Build the complete REST API for workflow management.

## Acceptance Criteria (TDD)
- [ ] Test: POST /workflows creates workflow with valid definition
- [ ] Test: GET /workflows lists only current user's workflows
- [ ] Test: GET /workflows/:id returns workflow details
- [ ] Test: PATCH /workflows/:id updates name/definition/isActive
- [ ] Test: DELETE /workflows/:id removes workflow
- [ ] Test: Cannot access another user's workflow (403)
- [ ] Test: Invalid workflow definition returns 400
- [ ] Workflow definition stored as JSONB in PostgreSQL
- [ ] Version auto-increments on update
- [ ] Swagger decorators on all endpoints

## Sprint
S3 — Workflow CRUD" \
  --label "sprint:S3,type:feature,priority:critical,area:api"

gh issue create --title "[S3] Build Dashboard page with workflow list" \
  --body "## Description
Create the main dashboard that lists all user workflows with create/edit/delete actions.

## Acceptance Criteria (TDD)
- [ ] Test: Dashboard fetches and displays workflows
- [ ] Test: Create button opens new workflow modal
- [ ] Test: Delete button removes workflow with confirmation
- [ ] Workflow cards with: name, status (active/inactive), last modified, execution count
- [ ] Toggle active/inactive from the card
- [ ] Click card navigates to /workflows/:id (editor)
- [ ] Empty state when no workflows

## Sprint
S3 — Workflow CRUD" \
  --label "sprint:S3,type:feature,priority:critical,area:spa"

gh issue create --title "[S3] Connect Editor Canvas to API (save/load workflows)" \
  --body "## Description
Wire the visual editor to the backend: load workflow definition on page open, save on button click.

## Acceptance Criteria (TDD)
- [ ] Test: Opening /workflows/:id loads workflow definition into editor
- [ ] Test: Save button PATCHes workflow with current nodes+edges
- [ ] Test: Unsaved changes show warning on navigation
- [ ] editorStore syncs with workflowStore
- [ ] Dirty state tracking (isDirty flag)
- [ ] Loading and error states in UI

## Sprint
S3 — Workflow CRUD" \
  --label "sprint:S3,type:feature,priority:critical,area:spa"
```

---

### SPRINT S4 — Queue & Executor

```bash
gh issue create --title "[S4] Build WorkflowRunner with topological sort (TDD)" \
  --body "## Description
Implement the core execution engine that traverses the workflow graph and executes nodes in order.

## Acceptance Criteria (TDD)
- [ ] Test: Topological sort returns correct execution order for linear workflow
- [ ] Test: Topological sort handles branching (IF node with true/false paths)
- [ ] Test: Circular dependency detected and rejected
- [ ] Test: WorkflowRunner executes nodes in topological order
- [ ] Test: Each node receives output from previous node as input
- [ ] Test: Execution stops on node failure, marks remaining as CANCELLED
- [ ] Per-node step records created with input/output/timing

## Technical Notes
See CLAUDE.md Hurdle 5 for topological sort pattern and Pattern 14 for template method.

## Sprint
S4 — Queue & Executor" \
  --label "sprint:S4,type:feature,priority:critical,area:worker"

gh issue create --title "[S4] Implement ManualTrigger node (TDD)" \
  --body "## Description
Build the Manual Trigger node that starts a workflow with optional user-provided data.

## Acceptance Criteria (TDD)
- [ ] Test: ManualTrigger returns trigger data as output
- [ ] Test: ManualTrigger with empty input returns empty data
- [ ] Implements INodeExecutor interface
- [ ] Registered in NodeRegistry

## Sprint
S4 — Queue & Executor" \
  --label "sprint:S4,type:feature,priority:critical,area:worker"

gh issue create --title "[S4] Implement HTTP Request action node (TDD)" \
  --body "## Description
Build the HTTP Request node that executes configurable HTTP calls.

## Acceptance Criteria (TDD)
- [ ] Test: GET request returns response data
- [ ] Test: POST request sends body and returns response
- [ ] Test: Timeout after configured duration (default 30s)
- [ ] Test: Non-2xx status marks node as failed
- [ ] Test: Network error handled gracefully
- [ ] Configurable: method, url, headers, body, timeout
- [ ] Output: statusCode, headers, body, duration

## Sprint
S4 — Queue & Executor" \
  --label "sprint:S4,type:feature,priority:critical,area:worker"

gh issue create --title "[S4] Implement Conditional IF action node (TDD)" \
  --body "## Description
Build the IF node that evaluates conditions and routes to true/false branches.

## Acceptance Criteria (TDD)
- [ ] Test: Simple equality condition (value === 200) routes to true branch
- [ ] Test: Failed condition routes to false branch
- [ ] Test: Can reference previous node output with template syntax
- [ ] Test: Invalid condition expression handled gracefully
- [ ] Output: { branch: 'true' | 'false', evaluatedCondition: string }

## Sprint
S4 — Queue & Executor" \
  --label "sprint:S4,type:feature,priority:critical,area:worker"

gh issue create --title "[S4] Connect API trigger to Worker via BullMQ (TDD)" \
  --body "## Description
Wire the manual execution endpoint to enqueue a job that the Worker processes.

## Acceptance Criteria (TDD)
- [ ] Test: POST /workflows/:id/execute creates execution record (PENDING)
- [ ] Test: Job is enqueued to BullMQ with executionId and workflowId
- [ ] Test: Worker picks up job, runs workflow, updates execution to SUCCESS/FAILED
- [ ] Test: Execution steps are persisted with input/output per node
- [ ] Test: Simple 3-node workflow executes end-to-end in under 5 seconds
- [ ] Idempotency key prevents duplicate executions

## Sprint
S4 — Queue & Executor" \
  --label "sprint:S4,type:feature,priority:critical,area:api,area:worker"
```

---

### SPRINT S5 — Webhooks & Cron

```bash
gh issue create --title "[S5] Implement Webhook trigger with HMAC validation (TDD)" \
  --body "## Description
Build the webhook system: unique URL generation, HMAC signature validation, and workflow triggering.

## Acceptance Criteria (TDD)
- [ ] Test: POST /webhooks/:path with valid HMAC triggers workflow
- [ ] Test: POST /webhooks/:path with invalid HMAC returns 401
- [ ] Test: POST /webhooks/:path with expired timestamp returns 401 (replay protection)
- [ ] Test: Webhook payload becomes trigger data for the workflow
- [ ] Test: Inactive webhook returns 404
- [ ] HMAC-SHA256 validation with timing-safe comparison
- [ ] Timestamp/nonce replay protection

## Sprint
S5 — Webhooks & Cron" \
  --label "sprint:S5,type:feature,priority:critical,area:api"

gh issue create --title "[S5] Implement Cron trigger with BullMQ repeatables (TDD)" \
  --body "## Description
Build the scheduled trigger using BullMQ repeatable jobs.

## Acceptance Criteria (TDD)
- [ ] Test: Activating workflow with cron trigger creates repeatable job
- [ ] Test: Deactivating workflow removes repeatable job
- [ ] Test: Cron expression is validated before saving
- [ ] Test: No duplicate repeatables on worker restart
- [ ] Test: Cron job triggers workflow execution at scheduled time
- [ ] Lock mechanism prevents duplicate executions

## Sprint
S5 — Webhooks & Cron" \
  --label "sprint:S5,type:feature,priority:critical,area:worker"
```

---

### SPRINT S6 — History & Observability

```bash
gh issue create --title "[S6] Implement execution history API endpoints (TDD)" \
  --body "## Description
Build the API endpoints for viewing execution history and details.

## Acceptance Criteria (TDD)
- [ ] Test: GET /workflows/:id/executions returns paginated list
- [ ] Test: Filter by status (success, failed, running)
- [ ] Test: Filter by date range
- [ ] Test: GET /executions/:id returns full execution detail
- [ ] Test: GET /executions/:id/steps returns per-node step data
- [ ] Payloads are sanitized (no secrets in logs)

## Sprint
S6 — History & Observability" \
  --label "sprint:S6,type:feature,priority:critical,area:api"

gh issue create --title "[S6] Build Execution History and Detail pages in SPA" \
  --body "## Description
Create the frontend pages for viewing and inspecting workflow executions.

## Acceptance Criteria (TDD)
- [ ] Test: History page shows execution list with status badges
- [ ] Test: Clicking execution opens detail view
- [ ] Test: Detail view shows per-node timeline with input/output/timing
- [ ] Execution history table: status, trigger type, started at, duration
- [ ] Filters: status, date range
- [ ] Detail view: visual timeline of node execution with expandable JSON payloads
- [ ] Failed nodes highlighted in red with error message

## Sprint
S6 — History & Observability" \
  --label "sprint:S6,type:feature,priority:critical,area:spa"

gh issue create --title "[S6] Add structured logging with Pino (API + Worker)" \
  --body "## Description
Replace console.log with structured JSON logging using Pino.

## Acceptance Criteria (TDD)
- [ ] All API requests logged with method, path, status, duration
- [ ] All workflow executions logged with executionId, workflowId, status
- [ ] Log level configurable via LOG_LEVEL env var
- [ ] No secrets or sensitive data in logs
- [ ] Correlation ID propagated across API → Worker

## Sprint
S6 — History & Observability" \
  --label "sprint:S6,type:feature,priority:high,area:api,area:worker"
```

---

### SPRINT S7 — AI PoC (RAG)

```bash
gh issue create --title "[S7] Implement RAG ingestion pipeline (TDD)" \
  --body "## Description
Build the document ingestion pipeline that embeds node taxonomy and example workflows into ChromaDB.

## Acceptance Criteria (TDD)
- [ ] Test: POST /ingest loads node_taxonomy.json into ChromaDB
- [ ] Test: POST /ingest loads example workflows into ChromaDB
- [ ] Test: Embeddings generated with sentence-transformers
- [ ] Test: ChromaDB collection created/reset correctly
- [ ] 3-5 annotated example workflows with expected documentation
- [ ] Embedding model: all-MiniLM-L6-v2

## Sprint
S7 — AI PoC (RAG)" \
  --label "sprint:S7,type:feature,priority:critical,area:ai"

gh issue create --title "[S7] Implement documentation generation with Ollama + RAG (TDD)" \
  --body "## Description
Build the full pipeline: receive workflow JSON → query RAG → build prompt → call Ollama → return documentation.

## Acceptance Criteria (TDD)
- [ ] Test: POST /generate-docs returns structured documentation
- [ ] Test: Documentation includes: objective, triggers, actions, data flow, decisions
- [ ] Test: RAG context improves documentation quality vs no-context
- [ ] Test: Timeout handling for slow model responses
- [ ] Prompt template with: system context + RAG results + workflow JSON
- [ ] Temperature: 0.3 for consistent output
- [ ] Max tokens: 1024

## Sprint
S7 — AI PoC (RAG)" \
  --label "sprint:S7,type:feature,priority:critical,area:ai"

gh issue create --title "[S7] Integrate AI documentation in NestJS API and SPA" \
  --body "## Description
Wire the AI service into the platform: API proxy endpoint + frontend UI.

## Acceptance Criteria (TDD)
- [ ] Test: POST /api/workflows/:id/generate-docs calls AI service and returns result
- [ ] Test: Generated docs cached in DB (don't re-generate for unchanged workflow)
- [ ] Test: Loading state shown in SPA while generating
- [ ] 'Generate Documentation' button on workflow editor page
- [ ] Documentation display panel with markdown rendering
- [ ] Copy-to-clipboard functionality
- [ ] Fallback: if AI service is down, show error message

## Sprint
S7 — AI PoC (RAG)" \
  --label "sprint:S7,type:feature,priority:critical,area:api,area:spa"

gh issue create --title "[S7] Model warm-up and performance optimization" \
  --body "## Description
Ensure the AI service is responsive for demo day.

## Acceptance Criteria (TDD)
- [ ] Model warm-up request on FastAPI startup (lifespan event)
- [ ] Pre-generated documentation cached for demo workflows
- [ ] Response time under 30 seconds for a typical 5-node workflow
- [ ] Health check verifies model is loaded and responsive

## Sprint
S7 — AI PoC (RAG)" \
  --label "sprint:S7,type:feature,priority:high,area:ai"
```

---

### SPRINT S8 — Quality & Performance

```bash
gh issue create --title "[S8] Achieve 70%+ test coverage on core modules" \
  --body "## Description
Add missing tests to reach 70%+ coverage on execution engine and API services.

## Acceptance Criteria (TDD)
- [ ] API services: 70%+ coverage
- [ ] Worker engine: 70%+ coverage
- [ ] All critical RFs (RF01-RF07) have at least one automated test
- [ ] Coverage report generated by CI pipeline

## Sprint
S8 — Quality & Performance" \
  --label "sprint:S8,type:test,priority:critical,area:api,area:worker"

gh issue create --title "[S8] Performance testing: API p95 < 200ms, workflow < 5s" \
  --body "## Description
Run load tests and optimize to meet NFR targets.

## Acceptance Criteria (TDD)
- [ ] API read endpoints: p95 latency < 200ms
- [ ] Simple 3-node workflow execution: p95 < 5 seconds
- [ ] Load test script (k6 or artillery) committed to repo
- [ ] Results documented

## Sprint
S8 — Quality & Performance" \
  --label "sprint:S8,type:test,priority:high,area:api,area:worker"

gh issue create --title "[S8] Setup CI/CD pipeline with GitHub Actions" \
  --body "## Description
Create the CI/CD pipeline that runs on every push/PR.

## Acceptance Criteria (TDD)
- [ ] Lint + typecheck on every PR
- [ ] Run all tests with coverage report
- [ ] Build Docker images
- [ ] Push images to GitHub Container Registry on merge to main
- [ ] Pipeline passes for current codebase

## Sprint
S8 — Quality & Performance" \
  --label "sprint:S8,type:infra,priority:critical,area:infra"
```

---

### SPRINT S9 — Security & Resilience

```bash
gh issue create --title "[S9] Add rate limiting, DLQ, and retry with backoff" \
  --body "## Description
Implement resilience patterns: rate limiting on API, DLQ for failed jobs, exponential backoff.

## Acceptance Criteria (TDD)
- [ ] Test: Rate limiter blocks after threshold
- [ ] Test: Failed job retried with exponential backoff
- [ ] Test: Job moved to DLQ after max retries
- [ ] NestJS throttler configured
- [ ] BullMQ backoff: exponential, 3 retries max
- [ ] DLQ queue for inspection of permanently failed jobs

## Sprint
S9 — Security & Resilience" \
  --label "sprint:S9,type:feature,priority:high,area:api,area:worker"

gh issue create --title "[S9] Security hardening: Helmet, CORS, audit logging" \
  --body "## Description
Apply security best practices across the application.

## Acceptance Criteria (TDD)
- [ ] Helmet security headers configured
- [ ] CORS restricted to SPA origin
- [ ] Audit log entries for: workflow CRUD, execution triggers, secret management
- [ ] No secrets in error responses or logs
- [ ] Input validation on all endpoints (already via DTOs, verify coverage)

## Sprint
S9 — Security & Resilience" \
  --label "sprint:S9,type:feature,priority:high,area:api"

gh issue create --title "[S9] PostgreSQL backup strategy and health monitoring" \
  --body "## Description
Setup automated database backups and basic health monitoring.

## Acceptance Criteria (TDD)
- [ ] Daily PostgreSQL backup script (pg_dump, encrypted)
- [ ] Backup restore tested and documented
- [ ] Health check endpoints verify DB + Valkey + Ollama connectivity
- [ ] Basic alerting documented (SMTP notification on service down)

## Sprint
S9 — Security & Resilience" \
  --label "sprint:S9,type:infra,priority:medium,area:infra"
```

---

### SPRINT S10 — UX & Documentation

```bash
gh issue create --title "[S10] UX polish: editor interactions, loading states, error handling" \
  --body "## Description
Polish the frontend user experience across all pages.

## Acceptance Criteria (TDD)
- [ ] All async operations show loading states
- [ ] All errors show user-friendly messages (toast notifications)
- [ ] Editor: smooth drag/drop, clear visual feedback
- [ ] Forms: validation messages, disabled states
- [ ] Keyboard navigation support (basic WCAG AA)
- [ ] Responsive layout (works on 1280px+ screens)

## Sprint
S10 — UX & Documentation" \
  --label "sprint:S10,type:feature,priority:high,area:spa"

gh issue create --title "[S10] Write deployment guide, runbooks, and SDK docs" \
  --body "## Description
Create all operational documentation.

## Acceptance Criteria (TDD)
- [ ] Deployment guide: how to deploy on VPS with Docker Compose
- [ ] Runbook: how to handle common incidents (service down, DB restore, queue stuck)
- [ ] SDK connector contract: how to create a new node type
- [ ] README with: project overview, quick start, architecture diagram
- [ ] CLAUDE.md fully up-to-date

## Sprint
S10 — UX & Documentation" \
  --label "sprint:S10,type:docs,priority:high,area:infra"
```

---

### SPRINT S11 — Freeze & Demo

```bash
gh issue create --title "[S11] Create demo workflows and test scenarios" \
  --body "## Description
Build the demo workflows that will be shown on presentation day.

## Acceptance Criteria (TDD)
- [ ] Demo workflow 1: Webhook → HTTP Request → IF → notification (success path)
- [ ] Demo workflow 2: Cron trigger → HTTP → data processing (scheduled job)
- [ ] Demo workflow 3: Manual trigger → showcase AI documentation generation
- [ ] All demo workflows tested end-to-end
- [ ] Failure scenarios prepared (show retry/DLQ behavior)

## Sprint
S11 — Freeze & Demo" \
  --label "sprint:S11,type:feature,priority:critical,area:api,area:spa"

gh issue create --title "[S11] Deploy to production VPS with TLS" \
  --body "## Description
Deploy the full application to a public VPS.

## Acceptance Criteria (TDD)
- [ ] VPS provisioned and configured
- [ ] Docker Compose running all services
- [ ] TLS certificate (Let's Encrypt) configured
- [ ] Domain pointing to VPS
- [ ] All demo workflows working on production
- [ ] Health checks passing

## Sprint
S11 — Freeze & Demo" \
  --label "sprint:S11,type:infra,priority:critical,area:infra"

gh issue create --title "[S11] Record backup demo video" \
  --body "## Description
Record a video walkthrough of the demo in case of technical issues on presentation day.

## Acceptance Criteria (TDD)
- [ ] Video shows: login, create workflow, editor canvas, execute, history, AI docs
- [ ] 5-10 minutes length
- [ ] Narration explaining each step

## Sprint
S11 — Freeze & Demo" \
  --label "sprint:S11,type:docs,priority:high,area:infra"
```

---

### SPRINT S12 — Final Delivery

```bash
gh issue create --title "[S12] Final presentation materials (slides, poster, QR codes)" \
  --body "## Description
Prepare all materials for the final presentation.

## Acceptance Criteria (TDD)
- [ ] Presentation slides (10-15 slides)
- [ ] Poster for printing
- [ ] QR code to live application
- [ ] QR code to GitHub repository
- [ ] Checklist of all acceptance criteria verified

## Sprint
S12 — Final Delivery" \
  --label "sprint:S12,type:docs,priority:critical,area:infra"
```

---

## Step 6: Configure Project Board Automations

Go to your GitHub Project → Settings → Workflows and enable:

1. **Item added to project** → Set status to "Backlog"
2. **Item closed** → Set status to "Done"
3. **Pull request merged** → Set status to "Done"

## Step 7: Create Iteration Field (Sprints)

In your GitHub Project → Settings → Custom fields:

1. Add a new **Iteration** field called "Sprint"
2. Create iterations matching your sprint dates:
   - S0: Dec 1-14, 2025
   - S1: Dec 15-28, 2025
   - S2: Jan 6-19, 2026
   - S3: Jan 20 - Feb 2, 2026
   - S4: Feb 3-16, 2026
   - S5: Feb 17 - Mar 2, 2026
   - S6: Mar 3-16, 2026
   - S7: Mar 17-30, 2026
   - S8: Mar 31 - Apr 13, 2026
   - S9: Apr 14-27, 2026
   - S10: Apr 28 - May 11, 2026
   - S11: May 12-25, 2026
   - S12: May 26-30, 2026

## Step 8: How Claude Code Updates Tasks

Add this to the **end of every Claude Code prompt**:

```
After completing work, update GitHub issues:
1. Close completed issues: gh issue close <NUMBER> --comment "✅ Done. [summary of changes]"
2. If starting a new issue: gh issue comment <NUMBER> --body "🚀 Starting work."
3. If creating a PR: gh pr create --title "feat: [description]" --body "Closes #<NUMBER>"
```

Or add this to your CLAUDE.md (already done in section 17).
