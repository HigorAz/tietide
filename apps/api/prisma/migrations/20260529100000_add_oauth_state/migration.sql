-- CreateTable
-- Server-side state for the OAuth Authorization Code + PKCE flow. Holds the
-- PKCE code_verifier and enforces single-use of the state nonce (jti) to block
-- authorization-code/state replay.
CREATE TABLE "oauth_states" (
    "jti" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "code_verifier" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states"("expires_at");
