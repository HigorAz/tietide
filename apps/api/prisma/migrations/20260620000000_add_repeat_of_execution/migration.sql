-- Repeat run (Workato "Repeat job"): link a re-run back to the execution it repeats.
ALTER TABLE "workflow_executions" ADD COLUMN "repeat_of_execution_id" TEXT;

CREATE INDEX "workflow_executions_repeat_of_execution_id_idx"
  ON "workflow_executions"("repeat_of_execution_id");

-- SetNull so deleting the original execution nulls its repeats' link rather than
-- cascade-deleting them.
ALTER TABLE "workflow_executions"
  ADD CONSTRAINT "workflow_executions_repeat_of_execution_id_fkey"
  FOREIGN KEY ("repeat_of_execution_id") REFERENCES "workflow_executions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
