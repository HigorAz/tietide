-- Multi-tenancy: organizations (workspaces), members, invites.
-- Additive + data-backfill migration. Every existing user gets a personal workspace
-- as SUPERADMIN, and every owned row is reassigned to that workspace. On an empty
-- database the backfill steps are no-ops (INSERT ... SELECT FROM users yields nothing).

-- 1. Enum --------------------------------------------------------------------
CREATE TYPE "OrgRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'MEMBER', 'VIEWER');

-- 2. New tables --------------------------------------------------------------
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- 3. Add organization_id columns (nullable for now; backfilled below) ---------
ALTER TABLE "users" ADD COLUMN "default_organization_id" TEXT;
ALTER TABLE "workflows" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "secrets" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "connections" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "folders" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "tags" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "environment_variables" ADD COLUMN "organization_id" TEXT;

-- 4. Backfill ----------------------------------------------------------------
-- 4a. One personal workspace per user. Slug is derived from the (unique) user id
--     so it is guaranteed unique. created_by_id links the org back to its user.
INSERT INTO "organizations" ("id", "name", "slug", "created_by_id", "created_at", "updated_at")
SELECT gen_random_uuid(), u."name" || '''s Workspace', 'ws-' || replace(u."id", '-', ''), u."id", now(), now()
FROM "users" u;

-- 4b. Each user is SUPERADMIN of their personal workspace.
INSERT INTO "organization_members" ("id", "organization_id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), o."id", o."created_by_id", 'SUPERADMIN'::"OrgRole", now()
FROM "organizations" o
WHERE o."created_by_id" IS NOT NULL;

-- 4c. Point each user's default workspace at their personal org.
UPDATE "users" u
SET "default_organization_id" = o."id"
FROM "organizations" o
WHERE o."created_by_id" = u."id";

-- 4d. Reassign owned resources to the creator's personal workspace.
UPDATE "workflows" w   SET "organization_id" = u."default_organization_id" FROM "users" u WHERE w."user_id" = u."id";
UPDATE "secrets" s     SET "organization_id" = u."default_organization_id" FROM "users" u WHERE s."user_id" = u."id";
UPDATE "connections" c SET "organization_id" = u."default_organization_id" FROM "users" u WHERE c."user_id" = u."id";
UPDATE "folders" f     SET "organization_id" = u."default_organization_id" FROM "users" u WHERE f."user_id" = u."id";
UPDATE "tags" t        SET "organization_id" = u."default_organization_id" FROM "users" u WHERE t."user_id" = u."id";
UPDATE "audit_logs" a  SET "organization_id" = u."default_organization_id" FROM "users" u WHERE a."user_id" = u."id";
-- USER-scope env vars become workspace-shared; GLOBAL vars keep organization_id NULL.
UPDATE "environment_variables" e SET "organization_id" = u."default_organization_id" FROM "users" u WHERE e."scope" = 'USER' AND e."user_id" = u."id";

-- 5. Enforce NOT NULL on fully-owned resources (audit_logs + env vars stay nullable).
ALTER TABLE "workflows"   ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "secrets"     ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "connections" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "folders"     ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "tags"        ALTER COLUMN "organization_id" SET NOT NULL;

-- 6. Indexes -----------------------------------------------------------------
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");
CREATE UNIQUE INDEX "organization_invites_token_hash_key" ON "organization_invites"("token_hash");
CREATE INDEX "organization_invites_organization_id_idx" ON "organization_invites"("organization_id");
CREATE INDEX "organization_invites_email_idx" ON "organization_invites"("email");
CREATE INDEX "organization_invites_expires_at_idx" ON "organization_invites"("expires_at");
CREATE INDEX "workflows_organization_id_folder_id_idx" ON "workflows"("organization_id", "folder_id");
CREATE INDEX "folders_organization_id_parent_folder_id_idx" ON "folders"("organization_id", "parent_folder_id");
CREATE INDEX "connections_organization_id_provider_idx" ON "connections"("organization_id", "provider");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- 7. Move per-user unique namespaces to per-workspace --------------------------
DROP INDEX "tags_user_id_name_key";
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");
DROP INDEX "secrets_user_id_name_key";
CREATE UNIQUE INDEX "secrets_organization_id_name_key" ON "secrets"("organization_id", "name");
-- USER-scope env vars are unique per workspace (was per user).
DROP INDEX "environment_variables_user_key_unique";
CREATE UNIQUE INDEX "environment_variables_user_key_unique" ON "environment_variables"("organization_id", "key") WHERE "scope" = 'USER';

-- 8. Foreign keys ------------------------------------------------------------
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_default_organization_id_fkey" FOREIGN KEY ("default_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
