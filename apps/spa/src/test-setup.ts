import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver; Radix primitives (Slider) use it
// via @radix-ui/react-use-size. A no-op polyfill is enough — the Slider's
// keyboard/onValueChange paths do not depend on observed size.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverPolyfill {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

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
