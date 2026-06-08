import type { OrgRole } from '@tietide/shared';

/**
 * Human-readable presentation for the workspace roles. The wire/enum values
 * stay ALL-CAPS (SUPERADMIN/ADMIN/MEMBER/VIEWER); these labels are the only
 * thing the UI should ever show. Keep this the single source of truth so the
 * members table, invite/role dialogs and workspace badges stay consistent.
 */
export const ROLE_LABELS: Record<OrgRole, string> = {
  SUPERADMIN: 'Super admin',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

/** One-line explanation of what each role can do, shown beside the label in pickers. */
export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  SUPERADMIN: 'Full control, including delete',
  ADMIN: 'Manage members and settings',
  MEMBER: 'Create and run workflows',
  VIEWER: 'Read-only access',
};

/** Friendly label for a role, falling back to the raw value for safety. */
export const roleLabel = (role: OrgRole): string => ROLE_LABELS[role] ?? role;
