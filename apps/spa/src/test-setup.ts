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

// jsdom lacks Pointer Events APIs that @radix-ui/react-select relies on for
// trigger pointer-down handling and option scroll-into-view. Without these
// no-op stubs, opening a Select in tests throws "hasPointerCapture is not a
// function". The polyfills don't change behavior, just keep Radix happy.
type ElementProto = typeof Element.prototype & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  scrollIntoView?: (arg?: boolean | ScrollIntoViewOptions) => void;
};
const elementProto = Element.prototype as ElementProto;
if (typeof elementProto.hasPointerCapture !== 'function') {
  elementProto.hasPointerCapture = (): boolean => false;
}
if (typeof elementProto.setPointerCapture !== 'function') {
  elementProto.setPointerCapture = (): void => {};
}
if (typeof elementProto.releasePointerCapture !== 'function') {
  elementProto.releasePointerCapture = (): void => {};
}
if (typeof elementProto.scrollIntoView !== 'function') {
  elementProto.scrollIntoView = (): void => {};
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
