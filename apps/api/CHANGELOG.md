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

## [Deprecated]

- **`POST /v1/workflows/:id/generate-docs`** — sunset **2026-07-04**.
  - Replaced by `POST /v1/workflows/:id/documentation/regenerate` (explicit
    regeneration) and `GET /v1/workflows/:id/documentation` (cached read).
  - Both responses already carry HTTP `Deprecation: true` and
    `Sunset: Sat, 04 Jul 2026 00:00:00 GMT` headers; clients can detect and
    migrate without server changes.
  - Removal tracked in a follow-up GitHub issue (sunset milestone). The route
    will return `410 Gone` after the sunset date and be removed from the
    Swagger surface in the same release.
