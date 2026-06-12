-- Retain the audit trail when a workspace is deleted (W5.20).
--
-- Previously AuditLog.organization was ON DELETE CASCADE, so deleting an
-- organization wiped every audit_logs row scoped to it — destroying the forensic
-- record (and the deletion event itself, which then hit an FK violation). The
-- organization_id column is already nullable, so we flip the FK to ON DELETE SET
-- NULL: the rows survive the workspace deletion with their org_id nulled out.

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organization_id_fkey";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
