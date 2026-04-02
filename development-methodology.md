# TieTide Development Methodology
## GSD + Extreme Programming with AI Agents

> "The AI is your mirror. It reveals faster who you are. If you're incompetent, it produces bad things faster. If you're competent, it produces good things faster." — Akita

---

## 1. The Philosophy: You Decide WHAT, AI Decides HOW

This is the single most important rule. Everything else builds on it.

- **You (Higor)**: Architecture decisions, what to build, when to stop engineering, when the agent is wrong, domain knowledge, quality bar, prioritization
- **AI Agent**: Writing code, generating tests, scaffolding, refactoring mechanics, researching APIs, writing boilerplate

When you invert this — letting AI decide WHAT to build while you just type — the result gets worse. Always.

### The Akita Lessons Applied to TieTide

| Akita's Lesson | How We Apply It |
|----------------|----------------|
| Only 37% of commits are features | Budget sprints: 40% features, 20% tests, 15% fixes, 15% infra, 10% docs |
| TDD is MORE important with AI | Every GSD phase starts with tests. AI modifies code with confidence because 1000+ tests exist as safety net |
| Refactoring is continuous | Never let a file grow past ~300 lines. Extract immediately. Don't accumulate tech debt |
| Small releases are key | Every commit passes CI. Every commit is production-ready. Revert is always one commit away |
| The agent never says "no" | YOU are the brake. YOU are the code review. YOU are the adult in the room |
| CLAUDE.md is the spec that evolves | Update it every session. It's the onboarding doc that the agent reads in 2 seconds |

---

## 2. The Stack: Two Tools, Two Purposes

### Claude Code (Terminal / IDE) — The Developer
Your primary coding tool. Runs in VS Code terminal or standalone terminal.
- Reads your entire codebase
- Writes code, runs tests, executes commands
- Has access to `gh` CLI for GitHub operations
- GSD framework installed on top for context management

### Claude Cowork (Desktop App) — The Project Manager
Your non-coding work tool. Runs in Claude Desktop app.
- Project management: review sprint board, plan tasks, write specs
- Documentation: update RFC, write deployment guides, create ADRs
- Analysis: review test coverage reports, analyze performance results
- Preparation: write demo scripts, prepare presentations
- Uses Projects feature to maintain context across sessions

### When to Use What

| Task | Tool |
|------|------|
| Writing code, tests, running builds | Claude Code + GSD |
| Planning a sprint, writing specs | Claude Cowork |
| Reviewing architecture decisions | Claude Cowork |
| Implementing a feature (TDD) | Claude Code + GSD |
| Updating CLAUDE.md | Claude Code |
| Writing documentation, guides | Claude Cowork |
| Creating presentations, posters | Claude Cowork |
| Debugging a failing test | Claude Code |
| Reviewing what was built today | Claude Cowork |
| Updating GitHub issues | Claude Code (gh CLI) |

---

## 3. GSD Framework: Solving Context Rot

### What is Context Rot?
As Claude works in a long session, the context window fills up. Quality degrades:
- 0-30% context: Peak quality. Thorough, comprehensive
- 50%+: Starts rushing. Cuts corners
- 70%+: Hallucinations. Forgotten requirements

### How GSD Fixes It
GSD spawns **fresh Claude instances** (sub-agents) for each task. Each gets a clean 200K context window. Task 50 has the same quality as Task 1.

### Installation
```bash
# Install GSD for Claude Code (global — works across all projects)
npx get-shit-done-cc --claude --global
```

### GSD Workflow for TieTide

#### Starting a New Sprint
```bash
# In Claude Code:
/gsd:new-project
# GSD interviews you, researches, creates a spec
# Point it to your GitHub issues for the sprint
```

#### The 6-Step Phase Loop
For each major feature/phase in a sprint:

```bash
# 1. DISCUSS — Talk through the approach
/gsd:discuss-phase 1
# You explain WHAT you want. GSD asks questions.
# This is where YOU bring domain knowledge.

# 2. PLAN — Generate atomic execution plans
/gsd:plan-phase 1
# GSD creates XML sub-tasks, each small enough
# to fit in ~50% of a fresh context window.
# Plans are in .planning/ directory.

# 3. EXECUTE — Sub-agents do the work
/gsd:execute-phase 1
# Fresh agents write code, run tests, commit atomically.
# Each task = one commit. Clean git history.

# 4. VERIFY — Goal-backward verification
/gsd:verify-work 1
# GSD asks: "What must be TRUE for this to work?"
# Tests observable behaviors, not implementation details.

# 5. FIX — If verification finds issues
/gsd:execute-phase 1
# Re-run with fixes. Debug agents diagnose failures.

# 6. COMPLETE — Archive and tag
/gsd:complete-milestone
```

#### Quick Tasks (Bug Fixes, Small Changes)
```bash
# Skip the full planning cycle
/gsd:quick "Fix the CORS error on webhook endpoint"
# Same fresh-agent guarantees, no heavy planning overhead
```

---

## 4. Agent Roles: Your AI Development Team

You're a solo developer, but you think like a team. Each "role" is a different mindset you activate with Claude — either in Code or Cowork — with a specific prompt/instruction set.

### Role 1: Product Owner (PO) — Claude Cowork

**When**: Sprint planning Monday, before starting any new feature
**Where**: Claude Cowork with a "TieTide Planning" Project

**What the PO does**:
- Reviews the sprint backlog in GitHub Projects
- Breaks down large issues into smaller acceptance criteria
- Prioritizes what to build this week
- Writes user stories with clear "done" criteria
- Decides what to CUT when time is short

**How to activate**:
In your Cowork Project, set these folder instructions:
```
You are acting as the Product Owner for TieTide, an iPaaS platform.
Your job is to:
1. Review the current sprint issues from GitHub
2. Break features into small, testable user stories
3. Prioritize ruthlessly — the MVP must ship by May 2026
4. Write acceptance criteria in TDD format (what tests must pass)
5. Say "no" to scope creep. If it's not in the MVP, it's future work.
6. Always consider: will this impress the professors at demo day?

Context: Read CLAUDE.md at the project root for full architecture and sprint plan.
The user is Higor, a solo developer building this as a college final project.
```

**Weekly ritual**:
Every Monday morning, open Cowork and say:
> "Review the GitHub issues for sprint S[X]. Help me plan what I'll build this week. I have 5 weekday evenings (~3h each) and ~8h on the weekend. Prioritize the critical issues first."

### Role 2: Developer (Dev) — Claude Code + GSD

**When**: Tuesday through Friday, during coding sessions
**Where**: Claude Code in terminal/IDE with GSD installed

**What the Dev does**:
- Implements features following TDD (Red → Green → Refactor)
- Writes clean, typed code following CLAUDE.md patterns
- Makes atomic commits that pass CI
- Closes GitHub issues after completion

**How to activate**:
Your CLAUDE.md already has all the patterns. GSD handles the context. Start each session:
```bash
# Check what's planned for today
/gsd:progress

# Start working on the next task
/gsd:discuss-phase N
# "I'm implementing issue #XX — [title]. Here's what I need..."
```

**Session discipline (from Akita)**:
- Never let the agent over-engineer. If it proposes 8 states, say "simplify, 4 states"
- Interrupt when it takes a wrong path. Don't wait for it to finish
- Give context it doesn't have: "Valkey uses Redis protocol but BullMQ needs this specific config"
- Every coding session ends with: all tests passing, CI green, issues updated

### Role 3: Tester / QA — Claude Code

**When**: After every feature implementation, before closing an issue
**Where**: Claude Code

**What the QA does**:
- Reviews test coverage for the implemented feature
- Identifies missing edge cases
- Runs the full test suite and verifies nothing is broken
- Checks for security issues (hardcoded secrets, SQL injection, missing validation)

**How to activate**:
After implementing a feature, switch mindset:
```
Now act as a QA engineer reviewing what we just built. 
Check:
1. Are there tests for EVERY acceptance criterion in the issue?
2. What edge cases are NOT tested? Write tests for them.
3. Run the full test suite — any regressions?
4. Any security concerns? (OWASP Top 10 checklist)
5. Is the error handling complete? What happens on failure?
Don't be nice. Find problems.
```

### Role 4: Tech Lead / Reviewer — Claude Cowork

**When**: Friday evening or Sunday, weekly review
**Where**: Claude Cowork

**What the Tech Lead does**:
- Reviews the week's commits and architecture decisions
- Identifies tech debt accumulating
- Ensures patterns from CLAUDE.md are being followed
- Updates CLAUDE.md with new hurdles/patterns discovered
- Plans refactoring if any file is getting too large

**How to activate**:
In Cowork, point to your project folder and say:
> "Review the commits from this week. Check: Are files getting too large (>300 lines)? Any patterns being violated? Any new hurdles we should document in CLAUDE.md? Any tech debt accumulating? Give me a honest assessment."

### Role 5: DevOps — Claude Code

**When**: Sprint S0 (initial), S8 (CI/CD), S11 (deploy)
**Where**: Claude Code

**What DevOps does**:
- Configures Docker Compose
- Sets up CI/CD pipelines
- Manages deployment
- Handles infrastructure issues

**How to activate**:
```
We're working on infrastructure today. Focus on:
- Docker configs must be production-ready
- CI pipeline must catch: lint errors, type errors, failing tests, security issues
- Everything must work with a single `docker compose up`
- No hardcoded values. Everything from env vars.
```

---

## 5. The Weekly Rhythm

### Monday — Planning Day (Cowork)
```
Morning (1h):
├── Open Claude Cowork → TieTide Planning project
├── PO mode: Review sprint board, prioritize week's tasks
├── Break features into daily work packages
├── Write/refine acceptance criteria for top 3 issues
└── Move selected issues to "Sprint Ready"
```

### Tuesday to Thursday — Build Days (Claude Code + GSD)
```
Evening session (~3h each):
├── Open Claude Code in project
├── /gsd:progress — see where you are
├── Pick the next issue from "Sprint Ready"
├── gh issue edit #XX --add-label "status:in-progress"
│
├── TDD CYCLE (per feature):
│   ├── /gsd:discuss-phase N — explain WHAT you need
│   ├── /gsd:plan-phase N — let GSD create atomic tasks
│   ├── /gsd:execute-phase N — agents write tests first, then code
│   ├── QA mode: review tests, check edge cases, run full suite
│   ├── /gsd:verify-work N — goal-backward verification
│   └── If passes: gh issue close #XX --comment "✅ Done. [summary]"
│
└── End of session:
    ├── All tests passing
    ├── All commits atomic and CI-ready
    └── GitHub issues updated
```

### Friday — Review + Hardening (Claude Code + Cowork)
```
Evening (3h):
├── Claude Code: Run full test suite, check coverage
├── Claude Code: Fix any flaky tests or regressions
├── Claude Code: Quick refactoring pass (any file > 300 lines?)
│
├── Switch to Cowork → Tech Lead mode:
│   ├── Review week's commits
│   ├── Identify tech debt
│   ├── Update CLAUDE.md with new patterns/hurdles
│   └── Write ADR for any architecture decisions made this week
│
└── Update GitHub Project board status
```

### Weekend — Deep Work (Claude Code + GSD)
```
Saturday/Sunday (~8h total):
├── Larger features that need uninterrupted time
├── Full GSD cycles for complex features
├── Integration testing (end-to-end flows)
└── Buffer time for anything that slipped during the week
```

---

## 6. The Commit Pattern (from Akita)

Your commits should follow this distribution:

| Category | Target % | Example |
|----------|---------|---------|
| Features (feat:) | ~35-40% | `feat: implement workflow CRUD endpoints` |
| Tests (test:) | ~15-20% | `test: add edge cases for HTTP node timeout` |
| Bug fixes (fix:) | ~10-15% | `fix: resolve race condition in BullMQ consumer` |
| Refactoring (refactor:) | ~10% | `refactor: extract CryptoService from SecretsService` |
| Infrastructure (chore:) | ~10% | `chore: add Ollama health check to docker-compose` |
| Documentation (docs:) | ~5-10% | `docs: update CLAUDE.md with webhook hurdle` |
| Security (security:) | ~5% | `fix(security): add HMAC timing-safe comparison` |

**If 80%+ of your commits are features, you're cutting corners.** Tests, refactoring, and security should be woven into every session, not batched at the end.

---

## 7. Key Rules (Non-Negotiable)

### From Akita:
1. **Every commit passes CI.** No exceptions. No "will fix in next commit."
2. **More test lines than code lines.** Target 1.5x ratio.
3. **Refactor immediately.** Don't let files grow past 300 lines. Extract now, not later.
4. **The agent empilha code. You poda.** If you don't prune regularly, you get a 5000-line monolith.
5. **Security is a habit, not a phase.** Check for issues every session, not just in sprint S9.

### From GSD:
6. **Fresh context for every task.** Never work in a degraded context window. Use GSD sub-agents.
7. **Atomic commits.** One task = one commit. Clean revert if needed.
8. **Plans are prompts.** The PLAN.md IS the instruction, not a document that becomes one.
9. **Goal-backward verification.** Ask "what must be TRUE?" not "what did we do?"

### From Your Project:
10. **CLAUDE.md is sacred.** Update it every week. It's the team onboarding doc for your AI pair.
11. **GitHub issues are the source of truth.** No work without an issue. No done without closing.
12. **TDD is the default.** Red → Green → Refactor. Always. The test comes first.

---

## 8. Getting Started Checklist

```
Before your first coding session:

□ Install Claude Code CLI
□ Install Claude Desktop app (for Cowork)
□ Install GSD: npx get-shit-done-cc --claude --global
□ Create GitHub repo with CLAUDE.md at root
□ Run the GitHub Projects setup script (create labels + issues)
□ Create a "TieTide Planning" project in Claude Cowork
□ Set folder instructions for Cowork (PO prompt from section 4)
□ Have Docker Desktop running
□ Have pnpm + Node.js 20+ installed
□ Have Python 3.12+ installed

First session:
□ Open Claude Code in project root
□ Verify: /gsd:help shows available commands
□ Run: /gsd:new-project (point it to your CLAUDE.md and sprint issues)
□ Start Sprint S0 with the first prompt from first-prompt-for-claude-code.md
```
