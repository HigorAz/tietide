import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TestNodeResult, TestNodeStatus, UseTestNodeResult } from '../config/useTestNode';
import { TestStep } from './TestStep';

const run = vi.fn();
const reset = vi.fn();

let mockHook: UseTestNodeResult;

vi.mock('../config/useTestNode', () => ({
  useTestNode: () => mockHook,
}));

const makeHook = (
  status: TestNodeStatus,
  result: Partial<TestNodeResult> = {},
  over: Partial<UseTestNodeResult> = {},
): UseTestNodeResult => ({
  status,
  result: { output: null, durationMs: null, error: null, ...result },
  canRun: true,
  blockedReason: null,
  run,
  reset,
  pendingSample: null,
  confirmSampleReplace: vi.fn(),
  discardSampleChange: vi.fn(),
  captureExternalSample: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Defaults to a ready node so existing behavioural tests stay focused on the run
// flow; the readiness-gating tests below override `ready`/`notReadyReason`.
const renderStep = (
  over: Partial<ComponentProps<typeof TestStep>> = {},
): ReturnType<typeof render> =>
  render(
    <TestStep
      nodeId="n1"
      ready
      notReadyReason={null}
      onFixInConfigure={vi.fn()}
      onResult={vi.fn()}
      {...over}
    />,
  );

describe('TestStep', () => {
  it('renders the run button when idle and triggers run on click', () => {
    mockHook = makeHook('idle');
    renderStep();

    const button = screen.getByTestId('test-step-run');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and disables the button while running', () => {
    mockHook = makeHook('running');
    renderStep();

    expect(screen.getByTestId('test-step-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('test-step-run')).toBeDisabled();
  });

  it('renders the success chip with duration and the output tree, and reports the result', () => {
    const onResult = vi.fn();
    mockHook = makeHook('success', {
      output: { messages: new Array(3).fill({}) },
      durationMs: 1310,
    });
    renderStep({ onResult });

    const chip = screen.getByTestId('test-step-success-chip');
    expect(chip.textContent ?? '').toMatch(/✓ Success · \d+(\.\d+)?s · output captured/);
    // The Phase-1 tree viewer is rendered with the output.
    expect(screen.getByTestId('test-step-output')).toBeInTheDocument();
    expect(screen.getByText('messages')).toBeInTheDocument();

    expect(onResult).toHaveBeenCalledWith({ ok: true, summary: '3 items' });
  });

  it('renders the Phase-1 ErrorCard on failure and wires Fix in Configure', () => {
    const onFixInConfigure = vi.fn();
    mockHook = makeHook('error', { error: { message: 'Boom went the run', code: null } });
    renderStep({ onFixInConfigure });

    expect(screen.getByText('Boom went the run')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fix in Configure'));
    expect(onFixInConfigure).toHaveBeenCalledTimes(1);
  });

  it('disables the button with the blocked reason as its title when canRun is false', () => {
    mockHook = makeHook(
      'idle',
      {},
      { canRun: false, blockedReason: 'Fix the red data pills first.' },
    );
    renderStep();

    const button = screen.getByTestId('test-step-run');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Fix the red data pills first.');
  });

  it('disables the button with the not-ready reason when the config is not ready', () => {
    mockHook = makeHook('idle');
    renderStep({ ready: false, notReadyReason: 'Complete the Configure step first' });

    const button = screen.getByTestId('test-step-run');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Complete the Configure step first');
  });

  it('enables the button when ready and the hook permits a run', () => {
    mockHook = makeHook('idle');
    renderStep({ ready: true, notReadyReason: null });

    expect(screen.getByTestId('test-step-run')).toBeEnabled();
  });
});
