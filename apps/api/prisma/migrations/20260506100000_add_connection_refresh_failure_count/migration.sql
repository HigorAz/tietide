-- AlterTable
ALTER TABLE "connections" ADD COLUMN "refresh_failure_count" INTEGER NOT NULL DEFAULT 0;
