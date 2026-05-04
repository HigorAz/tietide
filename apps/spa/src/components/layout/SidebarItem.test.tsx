import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Home } from 'lucide-react';

const mockNavigate = vi.fn();
const mockLocation = { pathname: '/dashboard' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

import { SidebarItem } from './SidebarItem';

describe('SidebarItem', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLocation.pathname = '/dashboard';
  });

  describe('rendering', () => {
    it('should render label and icon when expanded', () => {
      render(<SidebarItem to="/dashboard" label="Dashboard" icon={Home} collapsed={false} />);
      const button = screen.getByRole('button', { name: /dashboard/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Dashboard');
      expect(button).not.toHaveAttribute('title');
    });

    it('should hide label and add title attribute when collapsed', () => {
      render(<SidebarItem to="/dashboard" label="Dashboard" icon={Home} collapsed={true} />);
      const button = screen.getByRole('button', { name: /dashboard/i });
      expect(button).toHaveAttribute('title', 'Dashboard');
      expect(button).toHaveAttribute('aria-label', 'Dashboard');
      expect(button.textContent?.trim()).toBe('');
    });
  });

  describe('active state', () => {
    it('should mark data-active="true" on exact pathname match', () => {
      mockLocation.pathname = '/dashboard';
      render(<SidebarItem to="/dashboard" label="Dashboard" icon={Home} collapsed={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
    });

    it('should mark data-active="false" when pathname does not match', () => {
      mockLocation.pathname = '/library';
      render(<SidebarItem to="/dashboard" label="Dashboard" icon={Home} collapsed={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('data-active', 'false');
    });

    it('should treat nested paths as active via prefix match', () => {
      mockLocation.pathname = '/workflows/abc-123';
      render(<SidebarItem to="/workflows" label="Workflows" icon={Home} collapsed={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
    });

    it('should require exact match for the Home / route', () => {
      mockLocation.pathname = '/dashboard';
      render(<SidebarItem to="/" label="Home" icon={Home} collapsed={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('data-active', 'false');
    });

    it('should mark Home active only when pathname is exactly /', () => {
      mockLocation.pathname = '/';
      render(<SidebarItem to="/" label="Home" icon={Home} collapsed={false} />);
      expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
    });
  });

  describe('navigation', () => {
    it('should call useNavigate with the target path on click', async () => {
      const user = userEvent.setup();
      render(<SidebarItem to="/library" label="Library" icon={Home} collapsed={false} />);
      await user.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });
  });
});
