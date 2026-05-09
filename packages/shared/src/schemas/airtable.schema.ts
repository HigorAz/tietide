import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Airtable Base IDs start with "app" + 14 alphanumerics; tables can be either
// "tbl…" IDs or display names. Records start with "rec".
const airtableBaseId = z
  .string()
  .min(3)
  .max(64)
  .regex(/^app[A-Za-z0-9]+$/, { message: 'baseId must look like appXXXXXXXX' });

const airtableTableIdOrName = z.string().min(1).max(255);

const airtableRecordId = z
  .string()
  .min(3)
  .max(32)
  .regex(/^rec[A-Za-z0-9]+$/, { message: 'recordId must look like recXXXXXXXX' });

// Airtable field values are user-supplied opaque payloads (text, numbers, links,
// attachments…). The Airtable API validates them server-side; we just bound shape.
const airtableFields = z
  .record(z.string().min(1).max(255), z.unknown())
  .refine((v) => Object.keys(v).length <= 200, { message: 'too many fields (>200)' });

export const airtableCreateRecordConfigSchema = z.object({
  connectionId,
  baseId: airtableBaseId,
  tableIdOrName: airtableTableIdOrName,
  fields: airtableFields,
  typecast: z.boolean().optional(),
  mockOnDryRun,
});
export type AirtableCreateRecordConfig = z.infer<typeof airtableCreateRecordConfigSchema>;

export const airtableUpdateRecordConfigSchema = z.object({
  connectionId,
  baseId: airtableBaseId,
  tableIdOrName: airtableTableIdOrName,
  recordId: airtableRecordId,
  fields: airtableFields,
  typecast: z.boolean().optional(),
  mockOnDryRun,
});
export type AirtableUpdateRecordConfig = z.infer<typeof airtableUpdateRecordConfigSchema>;

export const airtableListRecordsConfigSchema = z.object({
  connectionId,
  baseId: airtableBaseId,
  tableIdOrName: airtableTableIdOrName,
  // Airtable uses a small expression DSL. Cap length to keep request size sane.
  filterByFormula: z.string().max(16_384).optional(),
  maxRecords: z.number().int().min(1).max(100).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  view: z.string().max(255).optional(),
  fields: z.array(z.string().max(255)).max(50).optional(),
  offset: z.string().max(200).optional(),
});
export type AirtableListRecordsConfig = z.infer<typeof airtableListRecordsConfigSchema>;
