import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExecutionStep } from '@tietide/shared';
import { StepCard } from './StepCard';

const makeStep = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  id: 'step-1',
  executionId: 'exec-1',
  nodeId: 'trigger-1',
  nodeType: 'manual_trigger',
  nodeName: 'Start',
  status: 'SUCCESS',
  inputData: null,
  outputData: { ok: true },
  error: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:01Z'),
  durationMs: 1000,
  ...overrides,
});

describe('StepCard', () => {
  it('renders the node name, type, status badge, and duration', () => {
    render(<StepCard step={makeStep({ nodeName: 'Send Email', nodeType: 'http_request' })} />);

    expect(screen.getByText('Send Email')).toBeInTheDocument();
    expect(screen.getByText('http_request')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/1\.0\s*s|1000\s*ms/i)).toBeInTheDocument();
  });

  it('highlights failed steps in red and shows the error message', () => {
    const step = makeStep({ status: 'FAILED', error: 'HTTP 500: Internal Server Error' });
    render(<StepCard step={step} />);

    const card = screen.getByTestId(`step-card-${step.id}`);
    expect(card).toHaveAttribute('data-status', 'FAILED');
    expect(screen.getByText(/HTTP 500: Internal Server Error/)).toBeInTheDocument();
  });

  it('toggles input and output JSON sections when expanded', async () => {
    const user = userEvent.setup();
    const step = makeStep({ inputData: { foo: 'bar' }, outputData: { result: 42 } });
    render(<StepCard step={step} />);

    expect(screen.queryByText(/"foo": "bar"/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show details/i }));

    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
    expect(screen.getByText(/"result": 42/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide details/i }));

    expect(screen.queryByText(/"foo": "bar"/)).not.toBeInTheDocument();
  });

  it('renders a placeholder when input or output payload is null', async () => {
    const user = userEvent.setup();
    render(<StepCard step={makeStep({ inputData: null, outputData: null })} />);

    await user.click(screen.getByRole('button', { name: /show details/i }));

    expect(screen.getAllByText(/no payload/i)).toHaveLength(2);
  });
});
