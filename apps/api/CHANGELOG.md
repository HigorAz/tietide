# Changelog — @tietide/api

Operator-visible changes to the `/v1` HTTP surface. Internal refactors are not
listed unless they alter request/response shapes, status codes, or
authentication semantics.

The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). API versioning
contract is documented in [CLAUDE.md §11](../../CLAUDE.md).

## [Unreleased]

### Added

- **Code node executor** — workflows may now persist and execute the `code`
  node type. Definitions containing `{ type: "code" }` are no longer rejected
  at save time. See [docs/claude/api-endpoints.md](../../docs/claude/api-endpoints.md)
  and the sandbox details in
  [apps/worker/src/nodes/actions/code.ts](../worker/src/nodes/actions/code.ts).

### Removed

- **`POST /v1/workflows/:id/generate-docs`** — the deprecated documentation alias
  has been removed; the route now returns `404`. Use
  `POST /v1/workflows/:id/documentation/regenerate` (explicit regeneration) and
  `GET /v1/workflows/:id/documentation` (cached read) instead. Removed ahead of
  the previously published `2026-07-04` sunset: the SPA already calls the
  replacements and there are no remaining clients of the alias. (#214)
