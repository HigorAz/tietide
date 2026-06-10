import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { ConfigFieldList, humanizeKey } from './ConfigFieldList';
import { useConnectionsStore, resetConnectionsStore } from '@/stores/connectionsStore';
import type { ConnectionView } from '@/api/connections';

const conn = (overrides: Partial<ConnectionView> = {}): ConnectionView => ({
  id: 'c1',
  type: ConnectionType.OAUTH2,
  provider: 'google',
  name: 'My Google',
  status: ConnectionStatus.ACTIVE,
  expiresAt: null,
  lastUsedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  ...overrides,
});

beforeEach(() => {
  resetConnectionsStore();
});

describe('humanizeKey', () => {
  it('should turn camelCase into sentence case', () => {
    expect(humanizeKey('maxResults')).toBe('Max results');
  });

  it('should turn snake_case into sentence case', () => {
    expect(humanizeKey('has_error_handler')).toBe('Has error handler');
  });
});

describe('ConfigFieldList', () => {
  it('should render humanized labels for each key', () => {
    render(<ConfigFieldList config={{ maxResults: 10, query: 'is:unread {{trigger.q}}' }} />);
    expect(screen.getByText('Max results')).toBeInTheDocument();
    expect(screen.getByText('Query')).toBeInTheDocument();
  });

  it('should render {{tokens}} as teal pill chips', () => {
    render(<ConfigFieldList config={{ query: 'is:unread {{trigger.q}}' }} />);
    const chip = screen.getByText('{{trigger.q}}');
    expect(chip.className).toContain('accent-teal');
  });

  it('should resolve connectionId to a connection name + status dot', () => {
    useConnectionsStore.setState({ connections: [conn()], status: 'ready' });
    render(<ConfigFieldList config={{ connectionId: 'c1' }} />);
    expect(screen.getByText('My Google')).toBeInTheDocument();
    expect(screen.getByTestId('config-connection-dot')).toBeInTheDocument();
  });

  it('should fall back to a truncated id for an unknown connectionId', () => {
    useConnectionsStore.setState({ connections: [], status: 'ready' });
    render(<ConfigFieldList config={{ connectionId: 'abcdefghijklmnop' }} />);
    expect(screen.getByText('abcdefghij…')).toBeInTheDocument();
    expect(screen.queryByTestId('config-connection-dot')).toBeNull();
  });

  it('should render booleans as true/false', () => {
    useConnectionsStore.setState({ status: 'ready' });
    render(<ConfigFieldList config={{ hasErrorHandler: false }} />);
    expect(screen.getByText('false')).toBeInTheDocument();
  });

  it('should render the muted line for empty config', () => {
    useConnectionsStore.setState({ status: 'ready' });
    render(<ConfigFieldList config={{}} />);
    expect(screen.getByText('No configuration')).toBeInTheDocument();
  });
});
