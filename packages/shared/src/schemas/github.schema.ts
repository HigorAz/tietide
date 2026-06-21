import { z } from 'zod';
import { templatable, coerceNumeric } from './templatable.js';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Issue/PR number accepts a literal OR a `{{pill}}` template (the editor's fx
// toggle) — a sole pill resolves to the real number at runtime; a resolved
// numeric string is coerced. Executors normalise with Number() at use.
const githubIssueNumber = templatable(z.number().int().min(1).max(2_147_483_647), coerceNumeric);

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
  issueNumber: githubIssueNumber,
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

export const GITHUB_ISSUE_STATES = ['open', 'closed', 'all'] as const;
export type GitHubIssueState = (typeof GITHUB_ISSUE_STATES)[number];
export const GITHUB_MERGE_METHODS = ['merge', 'squash', 'rebase'] as const;
export type GitHubMergeMethod = (typeof GITHUB_MERGE_METHODS)[number];

export const githubGetIssueConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  issueNumber: githubIssueNumber,
});
export type GitHubGetIssueConfig = z.infer<typeof githubGetIssueConfigSchema>;

export const githubListIssuesConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  // Templatable enum (editor fx toggle): literal state OR a `{{pill}}` that
  // resolves to a valid GITHUB_ISSUE_STATES value at runtime.
  state: templatable(z.enum(GITHUB_ISSUE_STATES)).optional(),
  labels: z.array(githubLabel).max(50).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
});
export type GitHubListIssuesConfig = z.infer<typeof githubListIssuesConfigSchema>;

export const githubCloseIssueConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  issueNumber: githubIssueNumber,
  mockOnDryRun,
});
export type GitHubCloseIssueConfig = z.infer<typeof githubCloseIssueConfigSchema>;

export const githubGetRepoConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
});
export type GitHubGetRepoConfig = z.infer<typeof githubGetRepoConfigSchema>;

export const githubListPrsConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  // Templatable enum (editor fx toggle): literal state OR a `{{pill}}`.
  state: templatable(z.enum(GITHUB_ISSUE_STATES)).optional(),
  perPage: z.number().int().min(1).max(100).optional(),
});
export type GitHubListPrsConfig = z.infer<typeof githubListPrsConfigSchema>;

export const githubMergePrConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
  pullNumber: githubIssueNumber,
  // Templatable enum (editor fx toggle): literal merge method OR a `{{pill}}`.
  mergeMethod: templatable(z.enum(GITHUB_MERGE_METHODS)).optional(),
  commitTitle: z.string().min(1).max(256).optional(),
  mockOnDryRun,
});
export type GitHubMergePrConfig = z.infer<typeof githubMergePrConfigSchema>;

// Push (webhook) triggers — the repo whose hook we install in onActivate.
export const githubIssueOpenedConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
});
export type GitHubIssueOpenedConfig = z.infer<typeof githubIssueOpenedConfigSchema>;

export const githubPrOpenedConfigSchema = z.object({
  connectionId,
  owner: githubOwner,
  repo: githubRepo,
});
export type GitHubPrOpenedConfig = z.infer<typeof githubPrOpenedConfigSchema>;
