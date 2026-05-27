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

export const linearGetIssueConfigSchema = z.object({
  connectionId,
  issueId: linearId,
});
export type LinearGetIssueConfig = z.infer<typeof linearGetIssueConfigSchema>;

export const linearSearchIssuesConfigSchema = z.object({
  connectionId,
  // Free-text search matched against issue titles (containsIgnoreCase).
  term: z.string().min(1).max(255),
  teamId: linearId.optional(),
  first: z.number().int().min(1).max(50).optional(),
});
export type LinearSearchIssuesConfig = z.infer<typeof linearSearchIssuesConfigSchema>;

export const linearAddCommentConfigSchema = z.object({
  connectionId,
  issueId: linearId,
  body: z.string().min(1).max(64_000),
  mockOnDryRun,
});
export type LinearAddCommentConfig = z.infer<typeof linearAddCommentConfigSchema>;

// Poll trigger — fires for issues whose updatedAt is newer than the cursor.
export const linearIssueUpdatedConfigSchema = z.object({
  connectionId,
  teamId: linearId.optional(),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type LinearIssueUpdatedConfig = z.infer<typeof linearIssueUpdatedConfigSchema>;
