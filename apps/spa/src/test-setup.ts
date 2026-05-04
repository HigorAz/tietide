import '@testing-library/jest-dom/vitest';

// Workaround for an incompatibility between jsdom and Node's native fetch
// (undici): the React Router data router creates Request objects whose
// AbortSignal comes from jsdom's realm, and undici rejects it with
// "Expected signal to be an instance of AbortSignal". The data router does
// not actually need the signal in tests (no loaders/actions), so we strip
// it before delegating to the original constructor.
const OriginalRequest = globalThis.Request;
globalThis.Request = new Proxy(OriginalRequest, {
  construct(target, args: unknown[]) {
    const [input, init] = args as [unknown, RequestInit | undefined];
    if (init && 'signal' in init) {
      const { signal: _stripped, ...rest } = init;
      void _stripped;
      return Reflect.construct(target, [input, rest]);
    }
    return Reflect.construct(target, args);
  },
}) as typeof Request;
