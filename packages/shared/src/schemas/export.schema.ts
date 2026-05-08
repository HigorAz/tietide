import { z } from 'zod';
import { workflowDefinitionSchema } from './workflow.schema.js';

export const WORKFLOW_EXPORT_VERSION = 1 as const;

export const workflowExportSchema = z.object({
  tietideExportVersion: z.literal(WORKFLOW_EXPORT_VERSION),
  name: z.string().min(1).max(255),
  definition: workflowDefinitionSchema,
  exportedAt: z.string().datetime(),
});

export type WorkflowExport = z.infer<typeof workflowExportSchema>;

export class WorkflowExportFormatError extends Error {
  constructor(message = 'File is not a valid TieTide workflow export') {
    super(message);
    this.name = 'WorkflowExportFormatError';
  }
}
