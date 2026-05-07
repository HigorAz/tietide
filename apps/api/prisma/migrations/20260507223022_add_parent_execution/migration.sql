-- AlterTable
ALTER TABLE "workflow_executions" ADD COLUMN     "parent_execution_id" TEXT;

-- CreateIndex
CREATE INDEX "workflow_executions_parent_execution_id_idx" ON "workflow_executions"("parent_execution_id");

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_parent_execution_id_fkey" FOREIGN KEY ("parent_execution_id") REFERENCES "workflow_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
