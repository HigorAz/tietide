import { assertUrlAllowed, isBlockedAddress, SsrfBlockedError, type LookupFn } from './ssrf-guard';

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
});
