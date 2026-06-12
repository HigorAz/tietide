-- Index the audit_logs (action, resource) columns (W5.53). AuditLogService.listFilterValues
-- builds the filter dropdowns with SELECT DISTINCT over action / resource, which is NOT
-- org-scoped (no WHERE) — so a composite index on exactly those two columns serves the
-- sweep and lets it grow without a full table scan. Additive: no data change.
CREATE INDEX "audit_logs_action_resource_idx" ON "audit_logs"("action", "resource");
