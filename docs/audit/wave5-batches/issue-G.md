> Part of the **2026-06-11 adversarial audit (Wave 5)**. Full tracker: `docs/audit/AUDIT-2026-06-11.md`. Findings here survived independent adversarial verification.

**3 findings** in this batch. Fix each via TDD (failing regression test first → minimal fix → atomic commit, one finding = one commit). Branch: `feature/audit-wave5-remediation` (or a fresh branch off it).

> ⚠️ Repo gotchas: the husky pre-commit hook is broken (`Exec format error`) — run `npx lint-staged` then `git commit --no-verify`. Never run tests/migrations against `localhost:5432` (production Postgres). Build `@tietide/shared`+`@tietide/sdk`+`@tietide/crypto` before `tsc --noEmit`. No `Co-Authored-By: Claude` trailer.

---

### W5.30 — LOW / security

**Provider-webhook responses leak subscription existence (401 vs 404 oracle)**

- **Location:** `apps/api/src/provider-webhooks/provider-webhooks.service.ts:93-128`
- **Problem:** trigger() returns 404 'Provider webhook not found' for missing/inactive/provider-mismatched subscriptions or unresolvable trigger type, but 401 'Invalid signature' once a valid active subscription is found and only the signature fails. The differing status codes let an unauthenticated caller distinguish a real subscription ID from a non-existent one. Impact is minimal because subscriptionId is a UUIDv5 derived from (workflowId, nodeId) — workflowId is a random 122-bit UUID, so the ID space is not enumerable; the oracle only confirms liveness for IDs the attacker already knows. It is a deviation from the CLAUDE.md uniform-generic-response webhook contract worth normalizing (verifiers leaned IMPROVEMENT). Fix: return a single uniform status+message (e.g. always 404) for both not-found and bad-signature cases on this public endpoint; keep the distinction in internal logs only.
- **Suggested fix:** Return one uniform status/message for both the not-found and bad-signature cases; distinguish them only in internal logging.

- [ ] Fixed (commit: \_\_\_\_)

### W5.31 — LOW / security

**Twilio webhook verification has no replay protection (no timestamp/nonce binding)**

- **Location:** `apps/api/src/provider-triggers/triggers/twilio/twilio-sms-received.trigger.ts:57-82`
- **Problem:** Twilio's X-Twilio-Signature scheme (HMAC-SHA1 over URL + sorted form params, keyed on the secret auth token) contains no timestamp, so verifySignature cannot enforce a freshness window — a captured validly-signed request stays forever-valid and is replayable by anyone who observed it. Forgery is impossible without the auth token; the only mitigation is the idempotency key (MessageSid/SmsSid, with a body-hash fallback), which dedupes exact replays per workflow but only while the prior WorkflowExecution row persists. Inherent to Twilio's design; real Twilio inbound SMS always carries MessageSid so the fallback is rarely hit. Verifiers split CONFIRMED-LOW / REFUTED-IMPROVEMENT. Fix: document the reliance on idempotency for Twilio replay defense, ensure the execution-row retention window comfortably exceeds any plausible replay attempt, and consider persisting seen MessageSids independently of execution-row lifecycle.
- **Suggested fix:** Document the idempotency-based replay defense and persist seen Twilio MessageSids independently of execution-row lifecycle so dedup survives row cleanup.

- [ ] Fixed (commit: \_\_\_\_)

### W5.32 — LOW / correctness

**Microsoft change-notification idempotency keyed on body hash collapses distinct events sharing constant clientState**

- **Location:** `apps/api/src/provider-webhooks/provider-webhooks.service.ts:288-338`
- **Problem:** extractProviderEventId returns null for microsoft/google/mailchimp/calendly, so the idempotency key falls back to sha256(rawBody). For MS Graph drive notifications (OnedriveFileAddedTrigger subscribes to the constant /me/drive/root with changeType 'updated'), the envelope carries only constant fields (clientState, subscriptionId, resource, changeType) with no per-change item ID, so two distinct drive changes can serialize byte-identically and the second is deduped. Outlook message notifications DO carry per-message resource/resourceData.id so they are unaffected, and the delta-walk trigger re-surfaces coalesced items on the next distinct notification, so the missed-event is not permanent — verifiers split CONFIRMED-LOW / REFUTED. Correctness gap: no per-notification anchor for microsoft. Fix: add a natural-key extractor for microsoft (hash of value[].resourceData.id + subscriptionExpirationDateTime / changeType) and for google (x-goog-message-number header) so distinct events get distinct idempotency keys instead of full-body hashing.
- **Suggested fix:** Add provider-specific event-id extractors for microsoft (resourceData.id + changeType) and google (x-goog-message-number) rather than relying on full-body hashing.

- [ ] Fixed (commit: \_\_\_\_)
