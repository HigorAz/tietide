-- CreateTable
CREATE TABLE "workflow_documentation" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "documentation" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_documentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_documentation_workflow_id_key" ON "workflow_documentation"("workflow_id");

-- AddForeignKey
ALTER TABLE "workflow_documentation" ADD CONSTRAINT "workflow_documentation_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
