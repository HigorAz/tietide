import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrgRole } from '@tietide/shared';
import { RoleSelect } from './RoleSelect';

const ROLES: OrgRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

describe('RoleSelect', () => {
  it('shows the friendly label for the current value, not the enum', () => {
    render(<RoleSelect value="MEMBER" assignableRoles={ROLES} onChange={vi.fn()} />);
    const trigger = screen.getByRole('combobox', { name: /role/i });
    expect(trigger).toHaveTextContent('Member');
    expect(trigger).not.toHaveTextContent('MEMBER');
  });

  it('opens a themed list of assignable roles with friendly labels', async () => {
    const user = userEvent.setup();
    render(<RoleSelect value="VIEWER" assignableRoles={ROLES} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: /role/i }));

    expect(screen.getByRole('option', { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /member/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /viewer/i })).toBeInTheDocument();
  });

  it('fires onChange with the selected role enum value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RoleSelect value="VIEWER" assignableRoles={ROLES} onChange={onChange} />);

    await user.click(screen.getByRole('combobox', { name: /role/i }));
    await user.click(screen.getByRole('option', { name: /admin/i }));

    expect(onChange).toHaveBeenCalledWith('ADMIN');
  });
});
