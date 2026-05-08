# Changelog

All notable changes to `@tietide/sdk` are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] — 2026-05-08

### Added

- `BasePushTrigger` abstract class — extend `BaseTrigger` for provider-pushed
  events. Subclasses implement `onActivate`, `onDeactivate`, and
  `verifySignature`. Default `run()` passes `input.data` through unchanged so
  the next node sees the event payload as `triggerData`.
- `BasePollTrigger` abstract class — extend `BaseTrigger` for poll-based
  triggers. Subclasses set `defaultIntervalSeconds` and implement
  `poll(ctx) → { items, newCursor }`. Default `run()` is a passthrough.
- Lifecycle interfaces: `ActivationContext`, `ActivationResult`,
  `DeactivationContext`, `SignatureInput`, `PollContext`, `PollResult`.

All additions are purely additive — no existing types or class signatures were
modified. Consumers on 2.0.0 keep working unchanged.

## [2.0.0] — 2026-05-06

### Breaking changes

- `ExecutionContext` gains three required members: `isDryRun: boolean`,
  `getConnection<T>(connectionId)`, and `markConnectionForRefresh(connectionId)`.
  Existing executors written against 0.1.0's context will compile-fail until they
  consume the new shape (or accept the wider type).
- The `1.x` band is intentionally skipped; no public consumers existed at `0.1.0`.

### Added

- `DecryptedConnection<TConfig>` interface (`{ id, type, provider, config, refreshToken? }`)
  exposed on `ExecutionContext.getConnection`.
- `OutputSchema` structural duck-type (`{ parse(value: unknown): unknown }`) — keeps
  the SDK zero-runtime-deps; consumers pass real Zod schemas.
- `INodeExecutor.outputSchema?` (data-pill picker) and `INodeExecutor.requiredConnectionType?`
  (connection picker) — both metadata-only, no runtime semantics.
- `NodeInput.connectionId?` — top-level field read by `BaseConnectorAction`.
- `BaseConnectorAction<TConfig>` abstract class — fetches the decrypted connection,
  invokes subclass `run(input, connection, context)`, detects 401/403 auth errors,
  and on auth failure with a refresh token marks the connection for refresh and
  surfaces a `ConnectionAuthError`.
- `ConnectionAuthError` (with `connectionId`, `provider`, `cause`) and
  `ConnectorMisconfiguredError` (with `nodeType`).

### Migration

Consumers implementing `ExecutionContext` (test doubles, custom runtimes) must
add the three new members. The worker's `WorkflowRunner.buildContext` does this
internally, so production code paths require no change beyond updating mock
contexts in test setup.

## [0.1.0]

Initial S0 scaffold.
