import type { OrgRole } from '@tietide/shared';

/**
 * The active organization for a request, resolved by `OrgContextGuard` from the
 * `X-Org-Id` header (validated against membership) or the caller's default org.
 * Attached to `request.org` and read via the `@CurrentOrg()` decorator.
 */
export interface OrgContext {
  id: string;
  role: OrgRole;
}
