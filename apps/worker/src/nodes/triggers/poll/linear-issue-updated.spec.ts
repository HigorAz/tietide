import type { DecryptedConnection, PollContext } from '@tietide/sdk';
import type { LinearApiKeyConfig } from '@tietide/shared';
import { LinearIssueUpdatedTrigger } from './linear-issue-updated';
import {
  type LinearClientFactory,
  type LinearGraphQLResponse,
} from '../../connectors/linear/linear-client.factory';

jest.setTimeout(15000);

const TEAM_ID = '22222222-2222-4222-8222-222222222222';

const makeClient = (
  query: jest.Mock = jest.fn(),
): jest.Mocked<Pick<LinearClientFactory, 'query' | 'endpointUrl' | 'buildAuthHeader'>> => ({
  query,
  endpointUrl: jest.fn(),
  buildAuthHeader: jest.fn(),
});

const connection = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'API_KEY',
  provider: 'linear',
  config: { apiKey: 'lin_api_AAA111' },
  refreshToken: undefined,
} as DecryptedConnection<LinearApiKeyConfig>;

const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}): PollContext => ({
  workflowId: 'wf-1',
  nodeId: 'node-1',
  connection,
  config: { connectionId: connection.id, ...config },
  cursor,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
});

describe('LinearIssueUpdatedTrigger', () => {
  let query: jest.Mock;
  let trigger: LinearIssueUpdatedTrigger;

  beforeEach(() => {
    query = jest.fn();
    trigger = new LinearIssueUpdatedTrigger(makeClient(query) as unknown as LinearClientFactory);
  });

  it('declares type, required connection type, and a default interval', () => {
    expect(trigger.type).toBe('linear-issue-updated');
    expect(trigger.requiredConnectionType).toBe('linear');
    expect(trigger.defaultIntervalSeconds).toBeGreaterThan(0);
  });

  it('emits nothing on the first tick (null cursor) and seeds a cursor without querying', async () => {
    const result = await trigger.poll(makeCtx(null));
    expect(result.items).toEqual([]);
    expect(typeof result.newCursor).toBe('string');
    expect(query).not.toHaveBeenCalled();
  });

  it('filters issues updated after the cursor and advances the cursor', async () => {
    query.mockResolvedValue({
      status: 200,
      data: {
        issues: {
          nodes: [
            { id: 'i2', identifier: 'ENG-2', updatedAt: '2026-05-08T12:00:00.000Z' },
            { id: 'i1', identifier: 'ENG-1', updatedAt: '2026-05-06T00:00:00.000Z' },
          ],
        },
      },
      errors: null,
    } as LinearGraphQLResponse);

    const result = await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z'));

    const [, , variables] = query.mock.calls[0];
    expect((variables as { filter: Record<string, unknown> }).filter.updatedAt).toEqual({
      gt: '2026-05-05T00:00:00.000Z',
    });
    expect(result.items).toHaveLength(2);
    expect(result.newCursor).toBe('2026-05-08T12:00:00.000Z');
  });

  it('adds a team filter when teamId is configured', async () => {
    query.mockResolvedValue({
      status: 200,
      data: { issues: { nodes: [] } },
      errors: null,
    } as LinearGraphQLResponse);
    await trigger.poll(makeCtx('2026-05-05T00:00:00.000Z', { teamId: TEAM_ID }));
    const [, , variables] = query.mock.calls[0];
    expect((variables as { filter: Record<string, unknown> }).filter.team).toEqual({
      id: { eq: TEAM_ID },
    });
  });
});
