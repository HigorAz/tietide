-- Soft-delete marker for self-deleted accounts. The user row is anonymized rather
-- than removed so authored workflows/secrets/audit logs (Restrict FKs) keep their
-- integrity; the auth path rejects any user whose deleted_at is set.
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);
