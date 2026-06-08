import { describe, it, expect } from 'vitest';
import { ORG_ROLE_RANK, type OrgRole } from '@tietide/shared';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, roleLabel } from './roleLabels';

const ALL_ROLES = Object.keys(ORG_ROLE_RANK) as OrgRole[];

describe('roleLabels', () => {
  it('provides a human label and description for every role', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });

  it('never exposes the raw ALL-CAPS enum value as a label', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).not.toBe(role);
    }
  });

  it('roleLabel returns the friendly label', () => {
    expect(roleLabel('SUPERADMIN')).toBe('Super admin');
    expect(roleLabel('VIEWER')).toBe('Viewer');
  });
});
