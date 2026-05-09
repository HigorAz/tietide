import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Linear identifiers are UUIDs.
const linearId = z.string().uuid();

export const linearCreateIssueConfigSchema = z.object({
  connectionId,
  teamId: linearId,
  title: z.string().min(1).max(255),
  description: z.string().max(64_000).optional(),
  assigneeId: linearId.optional(),
  stateId: linearId.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  labelIds: z.array(linearId).max(50).optional(),
  mockOnDryRun,
});
export type LinearCreateIssueConfig = z.infer<typeof linearCreateIssueConfigSchema>;

export const linearUpdateIssueStatusConfigSchema = z.object({
  connectionId,
  issueId: linearId,
  stateId: linearId,
  mockOnDryRun,
});
export type LinearUpdateIssueStatusConfig = z.infer<typeof linearUpdateIssueStatusConfigSchema>;
