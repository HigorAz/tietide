import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { CronForm } from './CronForm';

const NODE_ID = 'node-cron-1';

describe('CronForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('should render the expression input with the current config value', () => {
    render(<CronForm nodeId={NODE_ID} config={{ expression: '*/5 * * * *' }} />);

    const input = screen.getByLabelText(/expression/i) as HTMLInputElement;
    expect(input.value).toBe('*/5 * * * *');
  });

  it('should call updateNodeConfig with the new expression when the user types', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<CronForm nodeId={NODE_ID} config={{ expression: '' }} />);

    fireEvent.change(screen.getByLabelText(/expression/i), {
      target: { value: '0 0 * * *' },
    });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { expression: '0 0 * * *' });
  });

  it('should render an inline error for an invalid cron expression', () => {
    render(<CronForm nodeId={NODE_ID} config={{ expression: 'not valid!' }} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/invalid cron/i);
  });

  it('should not render an error for a valid expression', () => {
    render(<CronForm nodeId={NODE_ID} config={{ expression: '*/5 * * * *' }} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
