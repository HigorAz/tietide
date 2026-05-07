-- CreateEnum
CREATE TYPE "EnvVarScope" AS ENUM ('GLOBAL', 'USER');

-- CreateTable
CREATE TABLE "environment_variables" (
    "id" TEXT NOT NULL,
    "scope" "EnvVarScope" NOT NULL,
    "user_id" TEXT,
    "key" TEXT NOT NULL,
    "value_enc" TEXT NOT NULL,
    "value_nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environment_variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "environment_variables_scope_idx" ON "environment_variables"("scope");

-- CreateIndex
-- Postgres treats NULL as distinct in standard unique indexes, so we replace the
-- composite @@unique([scope, userId, key]) with two scope-specific partial unique
-- indexes that correctly enforce: one row per key per scope, with USER scope also
-- partitioned by user_id.
CREATE UNIQUE INDEX "environment_variables_global_key_unique"
    ON "environment_variables"("key")
    WHERE "scope" = 'GLOBAL';

CREATE UNIQUE INDEX "environment_variables_user_key_unique"
    ON "environment_variables"("user_id", "key")
    WHERE "scope" = 'USER';

-- AddForeignKey
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
