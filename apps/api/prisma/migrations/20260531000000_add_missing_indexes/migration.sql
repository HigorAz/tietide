-- W3.4: add indexes backing hot sweep queries that would otherwise table-scan.

-- Worker cron/poll schedulers enumerate all active workflows globally
-- (cron-trigger.service / poll-scheduler.service: WHERE is_active = true).
CREATE INDEX "workflows_is_active_idx" ON "workflows"("is_active");

-- OAuth refresh-scan sweeps connections due for refresh
-- (oauth-refresh-scan.processor: WHERE status = 'ACTIVE' AND expires_at < cutoff).
CREATE INDEX "connections_status_expires_at_idx" ON "connections"("status", "expires_at");
