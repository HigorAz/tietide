import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// GitHub repo owners and names: 1–39 chars for users/orgs (alphanumeric + dash);
// repo names: alphanumeric + dot/dash/underscore, up to 100 chars.
const githubOwner = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/, {
    message: 'owner must be a valid GitHub login',
  });

const githubRepo = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, { message: 'repo must be a valid GitHub repository name' });

// Branches accept slashes, dots, underscores, dashes — refs/heads/* truncated.
const githubBranch = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9/._-]+$/, { message: 'branch must be a valid Git ref name' });

const githubLabel = z.string().min(1).max(100);

export const githubCreateIssueConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  title: z.string().min(1).max(256),
  body: z.string().max(65_536).optional(),
  labels: z.array(githubLabel).max(50).optional(),
  assignees: z.array(githubOwner).max(10).optional(),
  mockOnDryRun,
});
export type GitHubCreateIssueConfig = z.infer<typeof githubCreateIssueConfigSchema>;

export const githubCommentIssueConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  issueNumber: z.number().int().min(1).max(2_147_483_647),
  body: z.string().min(1).max(65_536),
  mockOnDryRun,
});
export type GitHubCommentIssueConfig = z.infer<typeof githubCommentIssueConfigSchema>;

export const githubCreatePrConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  head: githubBranch,
  base: githubBranch,
  title: z.string().min(1).max(256),
  body: z.string().max(65_536).optional(),
  draft: z.boolean().optional(),
  mockOnDryRun,
});
export type GitHubCreatePrConfig = z.infer<typeof githubCreatePrConfigSchema>;
