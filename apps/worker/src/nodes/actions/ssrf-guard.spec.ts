import {
  assertUrlAllowed,
  assertUrlAllowedWithAddresses,
  isBlockedAddress,
  SsrfBlockedError,
  type LookupFn,
} from './ssrf-guard';

describe('ssrf-guard', () => {
  describe('isBlockedAddress', () => {
    it.each([
      '127.0.0.1',
      '127.10.20.30',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      '::ffff:10.0.0.1', // IPv4-mapped private
      '::ffff:7f00:1', // IPv4-mapped loopback in HEX form (127.0.0.1)
      '::ffff:a00:1', // IPv4-mapped private in HEX form (10.0.0.1)
      '::ffff:a9fe:a9fe', // IPv4-mapped cloud metadata in HEX form (169.254.169.254)
      '64:ff9b::7f00:1', // NAT64 wrapping loopback (127.0.0.1)
      '64:ff9b::a9fe:a9fe', // NAT64 wrapping cloud metadata (169.254.169.254)
      'fd00:ec2::254', // AWS IPv6 metadata (fc00::/7)
      'fe80::1', // link-local
    ])('blocks %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each([
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '172.32.0.1',
      '2606:4700:4700::1111',
      '::ffff:808:808', // IPv4-mapped public in HEX form (8.8.8.8)
      '64:ff9b::808:808', // NAT64 wrapping public (8.8.8.8)
    ])('allows public %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    });
  });

  describe('assertUrlAllowed', () => {
    const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

    it('rejects non-http(s) schemes', async () => {
      await expect(assertUrlAllowed('file:///etc/passwd', publicLookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
      await expect(assertUrlAllowed('gopher://x/', publicLookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });

    it('rejects a literal private IP without a DNS lookup', async () => {
      const lookup = jest.fn();
      await expect(
        assertUrlAllowed('http://169.254.169.254/', lookup as unknown as LookupFn),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects localhost by name', async () => {
      await expect(assertUrlAllowed('http://localhost:3000/', publicLookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });

    it('rejects a hostname that resolves to a private address', async () => {
      const lookup: LookupFn = async () => [{ address: '10.0.0.9', family: 4 }];
      await expect(assertUrlAllowed('https://evil.example.com/', lookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });

    it('allows a hostname that resolves only to public addresses', async () => {
      const url = await assertUrlAllowed('https://api.example.com/path', publicLookup);
      expect(url.hostname).toBe('api.example.com');
    });

    it('rejects a literal IPv4-mapped loopback URL the WHATWG parser normalizes to hex (no DNS lookup)', async () => {
      // new URL('http://[::ffff:127.0.0.1]/') normalizes the host to the hex
      // form [::ffff:7f00:1], which flows through the literal-IP branch (no DNS).
      // This is the W5.3 bypass class: regression-guard it end-to-end.
      const lookup = jest.fn();
      await expect(
        assertUrlAllowed('http://[::ffff:127.0.0.1]/', lookup as unknown as LookupFn),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects a literal IPv4-mapped cloud-metadata URL in hex-normalized form', async () => {
      const lookup = jest.fn();
      await expect(
        assertUrlAllowed('http://[::ffff:169.254.169.254]/', lookup as unknown as LookupFn),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects a hostname that resolves to a hex IPv4-mapped loopback', async () => {
      // WHATWG URL normalizes [::ffff:127.0.0.1] to the hex form ::ffff:7f00:1.
      const lookup: LookupFn = async () => [{ address: '::ffff:7f00:1', family: 6 }];
      await expect(assertUrlAllowed('https://rebind.example.com/', lookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });

    it('rejects a hostname that resolves to a NAT64-wrapped metadata address', async () => {
      const lookup: LookupFn = async () => [{ address: '64:ff9b::a9fe:a9fe', family: 6 }];
      await expect(assertUrlAllowed('https://rebind.example.com/', lookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });

    it('rejects when the host does not resolve', async () => {
      const lookup: LookupFn = async () => [];
      await expect(assertUrlAllowed('https://nope.invalid/', lookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });
  });

  describe('assertUrlAllowedWithAddresses', () => {
    it('surfaces the validated resolved addresses so the caller can pin the socket (W5.6)', async () => {
      const lookup: LookupFn = async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ];
      const { url, addresses } = await assertUrlAllowedWithAddresses(
        'https://api.example.com/path',
        lookup,
      );
      expect(url.hostname).toBe('api.example.com');
      expect(addresses).toEqual(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);
    });

    it('returns the literal IP itself as the single validated address (no DNS lookup)', async () => {
      const lookup = jest.fn();
      const { addresses } = await assertUrlAllowedWithAddresses(
        'https://203.0.113.7/health',
        lookup as unknown as LookupFn,
      );
      expect(addresses).toEqual(['203.0.113.7']);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects (never surfaces addresses) when any resolved address is private', async () => {
      const lookup: LookupFn = async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.9', family: 4 },
      ];
      await expect(
        assertUrlAllowedWithAddresses('https://evil.example.com/', lookup),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    });
  });

  describe('SSRF_ALLOWED_HOSTS allowlist', () => {
    const prev = process.env.SSRF_ALLOWED_HOSTS;
    afterEach(() => {
      if (prev === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
      else process.env.SSRF_ALLOWED_HOSTS = prev;
    });

    it('allows an allowlisted localhost host (self-hosted Ollama)', async () => {
      process.env.SSRF_ALLOWED_HOSTS = 'localhost,127.0.0.1';
      const loopback: LookupFn = async () => [{ address: '127.0.0.1', family: 4 }];
      const url = await assertUrlAllowed('http://localhost:11434/api/tags', loopback);
      expect(url.hostname).toBe('localhost');
    });

    it('allows an allowlisted literal loopback IP without a DNS lookup', async () => {
      process.env.SSRF_ALLOWED_HOSTS = '127.0.0.1';
      const lookup = jest.fn();
      const { addresses } = await assertUrlAllowedWithAddresses(
        'http://127.0.0.1:11434/api/tags',
        lookup as unknown as LookupFn,
      );
      expect(addresses).toEqual(['127.0.0.1']);
      expect(lookup).not.toHaveBeenCalled();
    });

    it('still blocks a private host that is NOT allowlisted', async () => {
      process.env.SSRF_ALLOWED_HOSTS = 'localhost';
      await expect(
        assertUrlAllowed('http://127.0.0.1:11434/', jest.fn() as unknown as LookupFn),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    });

    it('is strict when the env is empty (default)', async () => {
      delete process.env.SSRF_ALLOWED_HOSTS;
      await expect(
        assertUrlAllowed('http://localhost:3000/', async () => [
          { address: '127.0.0.1', family: 4 },
        ]),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    });
  });

  describe('OLLAMA_SERVER_BASE_URL auto-allowlist', () => {
    const prev = process.env.OLLAMA_SERVER_BASE_URL;
    const privateLookup: LookupFn = async () => [{ address: '127.0.0.1', family: 4 }];
    afterEach(() => {
      if (prev === undefined) delete process.env.OLLAMA_SERVER_BASE_URL;
      else process.env.OLLAMA_SERVER_BASE_URL = prev;
    });

    it('allows the env-configured hosted-Ollama host even though it resolves to a private IP', async () => {
      process.env.OLLAMA_SERVER_BASE_URL = 'http://ollama:11434';
      const { url } = await assertUrlAllowedWithAddresses(
        'http://ollama:11434/api/tags',
        privateLookup,
      );
      expect(url.hostname).toBe('ollama');
    });

    it('does NOT widen the guard for a different self-hosted private host', async () => {
      process.env.OLLAMA_SERVER_BASE_URL = 'http://ollama:11434';
      await expect(
        assertUrlAllowed('http://localhost:11434/api/tags', privateLookup),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    });
  });
});
