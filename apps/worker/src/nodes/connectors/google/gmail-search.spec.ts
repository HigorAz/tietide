import { ConnectionAuthError } from '@tietide/sdk';
import { GmailSearchAction } from './gmail-search';
import type { GoogleAuthService } from './google-auth';
import {
  authError,
  makeAuthService,
  makeClients,
  makeContext,
  makeInput,
  userError,
  VALID_CONNECTION_ID,
} from './__test__/fixtures';

jest.setTimeout(15000);

describe('GmailSearchAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let list: jest.Mock;
  let action: GmailSearchAction;

  beforeEach(() => {
    auth = makeAuthService();
    list = jest.fn();
    const clients = makeClients({ gmail: { users: { messages: { list } } } });
    action = new GmailSearchAction(auth as unknown as GoogleAuthService, clients);
  });

  it('returns mapped messages on happy path', async () => {
    list.mockResolvedValue({
      status: 200,
      data: {
        messages: [{ id: 'm1' }, { id: 'm2' }],
        nextPageToken: 'tok',
        resultSizeEstimate: 2,
      },
    });
    const result = await action.execute(
      makeInput({ query: 'is:unread', maxResults: 10 }),
      makeContext(),
    );
    expect(list).toHaveBeenCalledWith({ userId: 'me', q: 'is:unread', maxResults: 10 });
    expect(result.data).toEqual({
      messages: [{ id: 'm1' }, { id: 'm2' }],
      nextPageToken: 'tok',
      resultSizeEstimate: 2,
    });
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    list.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput({ query: 'is:unread' }), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 4xx without marking for refresh', async () => {
    list.mockRejectedValue(userError(400, 'Invalid query'));
    const ctx = makeContext();
    await expect(action.execute(makeInput({ query: 'bad' }), ctx)).rejects.toThrow('Invalid query');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ query: 'is:unread', mockOnDryRun: true }), ctx);
    expect(list).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects schema violations (empty query)', async () => {
    await expect(action.execute(makeInput({ query: '' }), makeContext())).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});
