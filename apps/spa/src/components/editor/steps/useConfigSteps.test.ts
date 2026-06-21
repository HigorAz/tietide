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

describe('useConfigSteps', () => {
  it('skips the connection step and renumbers when no connection is registered', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: false })),
    );
    const { steps } = result.current;
    expect(steps.map((s) => s.id)).toEqual(['configure', 'test']);
    const configure = steps.find((s) => s.id === 'configure')!;
    const test = steps.find((s) => s.id === 'test')!;
    expect(configure.index).toBe(1);
    expect(test.index).toBe(2);
  });

  it('opens EVERY step by default for a brand-new node (no locking, no pending)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: meta(), configureValid: false })),
    );
    const { steps } = result.current;
    expect(steps.map((s) => s.id)).toEqual(['connection', 'configure', 'test']);
    expect(steps.every((s) => s.open)).toBe(true);
    // Incomplete steps are 'active', never 'locked' or 'pending'.
    for (const s of steps) {
      expect(['active', 'done']).toContain(s.status);
    }
    expect(steps.find((s) => s.id === 'connection')!.status).toBe('active');
    expect(steps.find((s) => s.id === 'configure')!.status).toBe('active');
    expect(steps.find((s) => s.id === 'test')!.status).toBe('active');
  });

  it('marks complete steps done while keeping them open (saved node)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({
          connection: meta({ hasSelection: true, selectedName: 'My Google' }),
          configureValid: true,
        }),
      ),
    );
    const { steps } = result.current;
    expect(steps.every((s) => s.open)).toBe(true);
    expect(steps.find((s) => s.id === 'connection')!.status).toBe('done');
    expect(steps.find((s) => s.id === 'configure')!.status).toBe('done');
    // Not tested yet → still active.
    expect(steps.find((s) => s.id === 'test')!.status).toBe('active');
  });

  it('counts an optional connection with nothing selected as done', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: meta({ optional: true }), configureValid: true })),
    );
    const connection = result.current.steps.find((s) => s.id === 'connection')!;
    expect(connection.status).toBe('done');
  });

  it('treats an optional+stale connection as complete (done)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({ connection: meta({ optional: true, stale: true }), configureValid: true }),
      ),
    );
    const connection = result.current.steps.find((s) => s.id === 'connection')!;
    expect(connection.status).toBe('done');
  });

  it('keeps a REQUIRED+stale connection incomplete (active, never locked)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({ connection: meta({ optional: false, stale: true }), configureValid: true }),
      ),
    );
    const connection = result.current.steps.find((s) => s.id === 'connection')!;
    const test = result.current.steps.find((s) => s.id === 'test')!;
    expect(connection.status).toBe('active');
    expect(test.status).not.toBe('locked');
  });

  it('marks the test step done when tested is true', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true, tested: true })),
    );
    const test = result.current.steps.find((s) => s.id === 'test')!;
    expect(test.status).toBe('done');
  });

  it('re-arms Test to active (not done) when dirty, keeping every step open', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true, tested: true, dirty: true })),
    );
    const { steps } = result.current;
    expect(steps.every((s) => s.open)).toBe(true);
    expect(steps.find((s) => s.id === 'configure')!.status).toBe('done');
    expect(steps.find((s) => s.id === 'test')!.status).toBe('active');
  });

  it('toggleStep collapses only the targeted step and leaves the others open', () => {
    const { result } = renderHook(() =>
      useConfigSteps(
        input({
          connection: meta({ hasSelection: true, selectedName: 'My Google' }),
          configureValid: true,
        }),
      ),
    );
    act(() => result.current.toggleStep('configure'));
    const steps = result.current.steps;
    expect(steps.find((s) => s.id === 'configure')!.open).toBe(false);
    // The others stay open — no single-open invariant.
    expect(steps.find((s) => s.id === 'connection')!.open).toBe(true);
    expect(steps.find((s) => s.id === 'test')!.open).toBe(true);
  });

  it('toggleStep on a collapsed step re-opens it', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true })),
    );
    act(() => result.current.toggleStep('configure'));
    expect(result.current.steps.find((s) => s.id === 'configure')!.open).toBe(false);
    act(() => result.current.toggleStep('configure'));
    expect(result.current.steps.find((s) => s.id === 'configure')!.open).toBe(true);
  });

  it('expandStep re-opens a collapsed step (Fix-in-Configure path)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true })),
    );
    act(() => result.current.toggleStep('configure'));
    expect(result.current.steps.find((s) => s.id === 'configure')!.open).toBe(false);
    act(() => result.current.expandStep('configure'));
    expect(result.current.steps.find((s) => s.id === 'configure')!.open).toBe(true);
  });

  it('expandStep on an already-open step is a no-op (stays open)', () => {
    const { result } = renderHook(() =>
      useConfigSteps(input({ connection: null, configureValid: true })),
    );
    act(() => result.current.expandStep('configure'));
    expect(result.current.steps.find((s) => s.id === 'configure')!.open).toBe(true);
  });
});
