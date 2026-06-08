-- Per-workspace billing: one Subscription per Organization. Additive + data-backfill.
-- Every existing organization is backfilled with a FREE/ACTIVE subscription. The
-- backfill is idempotent (LEFT JOIN ... WHERE NULL) so a re-run is a no-op, and on an
-- empty database it inserts nothing.

-- 1. Enums -------------------------------------------------------------------
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID');

-- 2. Table -------------------------------------------------------------------
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "seat_price_id" TEXT,
    "metered_price_id" TEXT,
    "metered_sub_item_id" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes -----------------------------------------------------------------
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- 4. Foreign key -------------------------------------------------------------
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Backfill: every existing organization gets a FREE/ACTIVE subscription ----
INSERT INTO "subscriptions" ("id", "organization_id", "plan", "status", "seats", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", 'FREE', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" o
LEFT JOIN "subscriptions" s ON s."organization_id" = o."id"
WHERE s."id" IS NULL;
