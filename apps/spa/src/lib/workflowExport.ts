import {
  WORKFLOW_EXPORT_VERSION,
  WorkflowExportFormatError,
  workflowExportSchema,
  type WorkflowDefinition,
  type WorkflowExport,
} from '@tietide/shared';

const FILENAME_FALLBACK = 'workflow';
const FILENAME_FORBIDDEN = /[\\/:*?"<>|\x00-\x1f]/g;

export function buildExportPayload(
  name: string,
  definition: WorkflowDefinition,
  exportedAt: Date = new Date(),
): WorkflowExport {
  return {
    tietideExportVersion: WORKFLOW_EXPORT_VERSION,
    name,
    definition,
    exportedAt: exportedAt.toISOString(),
  };
}

export function serializeExport(payload: WorkflowExport): string {
  return JSON.stringify(payload);
}

export function parseExport(json: string): WorkflowExport {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new WorkflowExportFormatError('File is not valid JSON');
  }
  const result = workflowExportSchema.safeParse(raw);
  if (!result.success) {
    throw new WorkflowExportFormatError('File does not match the TieTide workflow export format');
  }
  return result.data;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(FILENAME_FORBIDDEN, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : FILENAME_FALLBACK;
}

export function exportFilename(name: string): string {
  return `${sanitizeFilename(name)}.tietide.json`;
}
