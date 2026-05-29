# Changelog

All notable changes to `@tietide/sdk` are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] — 2026-05-28

### Added

- `BaseConnectorAction` is now **safe-by-default during dry-runs**. A new
  optional protected `sideEffect` flag (default `true`) gates a central
  guard in `execute()`: when `context.isDryRun` is true and the action is
  side-effecting, `execute()` short-circuits to `buildDryRunOutput(input)`
  **before** resolving the connection or calling `run()`, so no real side
  effect (message send, charge, write, delete) ever occurs during a test
  run. Read-only actions (get/list/find/search/read) set
  `sideEffect = false` to keep executing during a dry-run and feed
  realistic data to downstream nodes.
- `BaseConnectorAction.buildDryRunOutput(input)` — overridable hook
  returning the dry-run placeholder output (default
  `{ data: { mocked, dryRun, skipped }, metadata: {...} }`).

Purely additive — both members are protected with defaults, so existing
subclasses keep compiling and behave identically except that
side-effecting actions are now correctly skipped on dry-runs (previously
they only skipped when the caller opted into the per-node `mockOnDryRun`
flag, which defaulted off — a safety bug).

## [2.4.0] — 2026-05-24

### Added

- `ExecutionContext.refreshConnection?<TConfig>(connectionId)` — optional
  method letting the host perform an in-flight OAuth refresh against the
  provider's token endpoint and return the new decrypted connection.
- `BaseConnectorAction.execute()` now calls `context.refreshConnection`
  (when available) on a first auth-error and retries the action once
  before falling back to `markConnectionForRefresh`. This means an
  expired access token recovers transparently without surfacing a
  `ConnectionAuthError` to the user, provided the host implements the
  optional method.

Purely additive — the new method is optional. Existing 2.3.0 contexts
keep compiling. Behavior on hosts that don't implement
`refreshConnection` is unchanged (still throws `ConnectionAuthError` on
auth errors).

## [2.3.0] — 2026-05-08

### Added

- `BasePushTrigger.handleValidation?(input)` — optional method for providers
  whose subscription create flow demands an out-of-band URL ownership echo
  (e.g. Microsoft Graph posts `?validationToken=<token>` to the notification
  URL during `POST /v1.0/subscriptions` and expects a 200 text/plain echo
  within ~10 s, before any provider-subscription DB row exists). Returning a
  `ValidationResponse` tells the webhook controller to short-circuit and
  reply with the echoed body; returning null means "not a challenge —
  proceed with the normal signed-event flow."
- `ValidationInput` / `ValidationResponse` interfaces.

Purely additive — existing 2.2.0 implementations continue to compile and run
unchanged because the new method is optional.

## [2.2.0] — 2026-05-08

### Changed (covariant)

- `BasePushTrigger.verifySignature` return type widened from `boolean` to
  `boolean | Promise<boolean>`. Existing sync impls (Stripe, Drive HMAC-style
  verifiers) still satisfy the new signature unchanged. Required so triggers
  that need an async verification path — e.g. Gmail Pub/Sub OIDC ID token
  verification against Google's JWKS — can return a Promise. Callers must
  `await Promise.resolve(trigger.verifySignature(...))`.

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
