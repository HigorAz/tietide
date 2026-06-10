import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useConfigSteps, type ConfigStepsInput } from './useConfigSteps';
import type { ConnectionStepMeta } from './StepLayoutContext';

const meta = (overrides: Partial<ConnectionStepMeta> = {}): ConnectionStepMeta => ({
  provider: 'google',
  optional: false,
  selectedName: null,
  selectedStatus: null,
  hasSelection: false,
  stale: false,
  ...overrides,
});

const input = (overrides: Partial<ConfigStepsInput> = {}): ConfigStepsInput => ({
  connection: null,
  configureValid: true,
  tested: false,
  ...overrides,
});

const openId = (steps: { id: string; open: boolean }[]): string | undefined =>
  steps.find((s) => s.open)?.id;

describe('useConfigSteps', () => {
  it('skips the connection step and renumbers when no connection is registered (invalid config)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: false })),
    );
    const { steps } = result.current;
    expect(steps.map((s) => s.id)).toEqual(['configure', 'test']);
    const configure = steps.find((s) => s.id === 'configure')!;
    const test = steps.find((s) => s.id === 'test')!;
    expect(configure.index).toBe(1);
    expect(configure.status).toBe('active');
    expect(configure.open).toBe(true);
    expect(test.index).toBe(2);
    expect(test.status).toBe('locked');
  });

  it('shows connection(1, active) → configure(2, pending) → test(3, locked) when connection registered but nothing selected', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: meta(), configureValid: false })),
    );
    const { steps } = result.current;
    expect(steps.map((s) => s.id)).toEqual(['connection', 'configure', 'test']);
    const [connection, configure, test] = steps;
    expect(connection.index).toBe(1);
    expect(connection.status).toBe('active');
    expect(connection.open).toBe(true);
    expect(configure.index).toBe(2);
    expect(configure.status).toBe('pending');
    expect(test.index).toBe(3);
    expect(test.status).toBe('locked');
  });

  it('initializes a saved node (connection selected + valid config) with Test open and zero interactions', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({
          connection: meta({ hasSelection: true, selectedName: 'My Google' }),
          configureValid: true,
        }),
      ),
    );
    const { steps } = result.current;
    const connection = steps.find((s) => s.id === 'connection')!;
    const configure = steps.find((s) => s.id === 'configure')!;
    const test = steps.find((s) => s.id === 'test')!;
    expect(connection.status).toBe('done');
    expect(configure.status).toBe('done');
    expect(test.status).toBe('active');
    expect(test.open).toBe(true);
    expect(openId(steps)).toBe('test');
  });

  it('counts an optional connection with nothing selected as done', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: meta({ optional: true }), configureValid: true })),
    );
    const connection = result.current.steps.find((s) => s.id === 'connection')!;
    expect(connection.status).toBe('done');
  });

  it('does not count an optional connection as done when the saved id is stale', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({ connection: meta({ optional: true, stale: true }), configureValid: false }),
      ),
    );
    const connection = result.current.steps.find((s) => s.id === 'connection')!;
    expect(connection.status).not.toBe('done');
  });

  it('openStep on a done step opens it and closes the others (single-open invariant)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({
          connection: meta({ hasSelection: true, selectedName: 'My Google' }),
          configureValid: true,
        }),
      ),
    );
    // saved-node init opens Test; reopen the (done) connection step
    act(() => result.current.openStep('connection'));
    const steps = result.current.steps;
    expect(openId(steps)).toBe('connection');
    expect(steps.filter((s) => s.open)).toHaveLength(1);
    expect(steps.find((s) => s.id === 'connection')!.status).toBe('active');
  });

  it('openStep on a locked test step is a no-op', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: false })),
    );
    act(() => result.current.openStep('test'));
    expect(openId(result.current.steps)).toBe('configure');
    expect(result.current.steps.find((s) => s.id === 'test')!.status).toBe('locked');
  });

  it('reverts test to locked and auto-opens configure when configureValid flips false after test was open', () => {
    const { result, rerender } = renderHook(
      ({ valid }: { valid: boolean }) =>
        useConfigSteps(input({ connection: null, configureValid: valid })),
      { initialProps: { valid: true } },
    );
    // config valid + no connection step → Test is auto-open
    expect(openId(result.current.steps)).toBe('test');

    rerender({ valid: false });
    const test = result.current.steps.find((s) => s.id === 'test')!;
    expect(test.status).toBe('locked');
    expect(openId(result.current.steps)).toBe('configure');
  });

  it('marks the test step done when tested is true', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true, tested: true })),
    );
    const test = result.current.steps.find((s) => s.id === 'test')!;
    expect(test.status).toBe('done');
  });
});
