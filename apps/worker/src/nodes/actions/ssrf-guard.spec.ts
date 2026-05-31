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
      'fd00:ec2::254', // AWS IPv6 metadata (fc00::/7)
      'fe80::1', // link-local
    ])('blocks %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])(
      'allows public %s',
      (ip) => {
        expect(isBlockedAddress(ip)).toBe(false);
      },
    );
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

    it('rejects when the host does not resolve', async () => {
      const lookup: LookupFn = async () => [];
      await expect(assertUrlAllowed('https://nope.invalid/', lookup)).rejects.toBeInstanceOf(
        SsrfBlockedError,
      );
    });
  });
});
