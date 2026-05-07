-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN "is_dry_run" BOOLEAN NOT NULL DEFAULT false;
