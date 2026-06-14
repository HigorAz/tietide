import { assertHealthUrlAllowed, SsrfBlockedError } from './ssrf-guard';

describe('assertHealthUrlAllowed — SSRF_ALLOWED_HOSTS allowlist', () => {
  const prev = process.env.SSRF_ALLOWED_HOSTS;
  afterEach(() => {
    if (prev === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
    else process.env.SSRF_ALLOWED_HOSTS = prev;
  });

  it('blocks localhost by default (strict)', async () => {
    delete process.env.SSRF_ALLOWED_HOSTS;
    await expect(assertHealthUrlAllowed('http://localhost:11434/api/tags')).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('allows an allowlisted localhost (self-hosted Ollama)', async () => {
    process.env.SSRF_ALLOWED_HOSTS = 'localhost,127.0.0.1';
    const url = await assertHealthUrlAllowed('http://localhost:11434/api/tags');
    expect(url.hostname).toBe('localhost');
  });

  it('allows an allowlisted literal loopback IP', async () => {
    process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
    const url = await assertHealthUrlAllowed('http://127.0.0.1:11434/api/tags');
    expect(url.hostname).toBe('127.0.0.1');
  });

  it('still blocks a non-allowlisted private literal IP', async () => {
    process.env.SSRF_ALLOWED_HOSTS = 'localhost';
    await expect(assertHealthUrlAllowed('http://10.0.0.5:11434/')).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });
});
