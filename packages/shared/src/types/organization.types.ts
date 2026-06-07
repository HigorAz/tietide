/**
 * Organization (workspace) multi-tenancy types. Additive — does not modify the
 * frozen `User`/`PublicUser` surface. The top role is SUPERADMIN: an all-powerful
 * tier that multiple members may hold (it is NOT a single owner pointer). Permission
 * derives from a member's role only.
 */

export const OrgRole = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;

export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

/**
 * Numeric rank for "act only on members at or below your own rank" checks and for
 * role-gating in the SPA. Higher number = more authority.
 */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  SUPERADMIN: 3,
  ADMIN: 2,
  MEMBER: 1,
  VIEWER: 0,
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

/** An organization plus the calling user's role within it (org-switcher payload). */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: Date;
}

/** Member row enriched with the user's identity for the members table. */
export interface OrgMemberView {
  userId: string;
  email: string;
  name: string;
  role: OrgRole;
  createdAt: Date;
}

/** A pending invite as exposed to managers — never includes the token hash. */
export interface OrganizationInviteView {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: Date;
  createdAt: Date;
}
