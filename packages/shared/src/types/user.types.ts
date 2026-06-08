export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// The shape returned by GET /v1/auth/me — safe profile fields the Settings page
// surfaces (member-since via createdAt, verification state via emailVerified).
export type PublicUser = Omit<User, 'updatedAt'>;
