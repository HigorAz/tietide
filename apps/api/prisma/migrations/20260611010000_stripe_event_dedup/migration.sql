-- Stripe webhook idempotency + ordering guard (W5.17). Additive only.
-- A persisted event-id ledger lets us short-circuit retried deliveries, and a
-- per-subscription high-water mark lets us drop out-of-order events so a stale
-- subscription.updated can't re-elevate a workspace already cancelled by a newer
-- subscription.deleted.

-- 1. Idempotency ledger ------------------------------------------------------
CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);

-- 2. Unique index — a retried delivery hits this and is treated as processed.
CREATE UNIQUE INDEX "processed_stripe_events_event_id_key" ON "processed_stripe_events"("event_id");

-- 3. Ordering high-water mark on the subscription row ------------------------
ALTER TABLE "subscriptions" ADD COLUMN "last_stripe_event_at" TIMESTAMP(3);
