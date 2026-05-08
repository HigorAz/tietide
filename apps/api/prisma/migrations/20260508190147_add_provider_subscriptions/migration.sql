-- CreateTable
CREATE TABLE "provider_subscriptions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_sub_id" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "secret_nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trigger_cursors" (
    "workflow_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "last_polled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trigger_cursors_pkey" PRIMARY KEY ("workflow_id","node_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_subscriptions_workflow_id_node_id_key" ON "provider_subscriptions"("workflow_id", "node_id");

-- CreateIndex
CREATE INDEX "provider_subscriptions_workflow_id_idx" ON "provider_subscriptions"("workflow_id");

-- CreateIndex
CREATE INDEX "provider_subscriptions_expires_at_idx" ON "provider_subscriptions"("expires_at");

-- AddForeignKey
ALTER TABLE "provider_subscriptions" ADD CONSTRAINT "provider_subscriptions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trigger_cursors" ADD CONSTRAINT "trigger_cursors_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
