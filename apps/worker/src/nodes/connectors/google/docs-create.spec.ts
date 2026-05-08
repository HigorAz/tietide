import { ConnectionAuthError } from '@tietide/sdk';
import { DocsCreateAction } from './docs-create';
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

describe('DocsCreateAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let copy: jest.Mock;
  let batchUpdate: jest.Mock;
  let action: DocsCreateAction;

  const baseParams = {
    templateId: 'tmpl-1',
    replacements: { name: 'Alice', amount: '$100' },
  };

  beforeEach(() => {
    auth = makeAuthService();
    copy = jest.fn();
    batchUpdate = jest.fn().mockResolvedValue({ status: 200, data: {} });
    action = new DocsCreateAction(
      auth as unknown as GoogleAuthService,
      makeClients({
        drive: { files: { copy } },
        docs: { documents: { batchUpdate } },
      }),
    );
  });

  it('copies the template then applies replacements on happy path', async () => {
    copy.mockResolvedValue({
      status: 200,
      data: { id: 'doc-1', name: 'Generated', webViewLink: 'https://x' },
    });
    const result = await action.execute(makeInput(baseParams), makeContext());
    expect(copy).toHaveBeenCalledWith({
      fileId: 'tmpl-1',
      requestBody: { name: 'Generated from tmpl-1' },
      fields: 'id, name, webViewLink',
    });
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    const arg = batchUpdate.mock.calls[0][0];
    expect(arg.documentId).toBe('doc-1');
    expect(arg.requestBody.requests).toHaveLength(2);
    expect(arg.requestBody.requests[0].replaceAllText.containsText.text).toBe('{{name}}');
    expect(result.data.documentId).toBe('doc-1');
    expect(result.data.replacementsApplied).toBe(2);
  });

  it('throws when copy returns no id', async () => {
    copy.mockResolvedValue({ status: 200, data: {} });
    await expect(action.execute(makeInput(baseParams), makeContext())).rejects.toThrow(
      /document id/i,
    );
  });

  it('throws ConnectionAuthError on 401 from copy and marks for refresh', async () => {
    copy.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 404 without marking for refresh (template not found)', async () => {
    copy.mockRejectedValue(userError(404, 'Template not found'));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Template not found');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
    expect(copy).not.toHaveBeenCalled();
    expect(batchUpdate).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
