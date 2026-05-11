import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewWorkflowModal } from './NewWorkflowModal';

describe('NewWorkflowModal', () => {
  const onClose = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onCreate.mockReset();
  });

  it('should render a name input and a description textarea', () => {
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('should show a validation error for empty name and not call onCreate', async () => {
    const user = userEvent.setup();
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('should call onCreate with an empty starter definition on valid submit', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/name/i), 'Invoice Automation');
    await user.type(screen.getByLabelText(/description/i), 'Sends invoices nightly');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const [arg] = onCreate.mock.calls[0];
    expect(arg.name).toBe('Invoice Automation');
    expect(arg.description).toBe('Sends invoices nightly');
    expect(arg.definition.nodes).toEqual([]);
    expect(arg.definition.edges).toEqual([]);
  });

  it('should omit the description field when it is left blank', async () => {
    const user = userEvent.setup();
    onCreate.mockResolvedValueOnce(undefined);
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/name/i), 'Bare');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    const [arg] = onCreate.mock.calls[0];
    expect(arg.description).toBeUndefined();
  });

  it('should not render an inline submit-error alert when onCreate rejects (toast handles it)', async () => {
    const user = userEvent.setup();
    onCreate.mockRejectedValueOnce(new Error('Server exploded'));
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/name/i), 'Bare');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // No inline error rendered — the parent owns toasting.
    expect(screen.queryByText(/server exploded/i)).not.toBeInTheDocument();
    // Validation alerts stay visible on the form (zod), but no submit-error alert lingers.
    const alerts = screen.queryAllByRole('alert');
    expect(alerts).toHaveLength(0);
  });

  it('should render the shared Spinner inside the Create button while submitting', async () => {
    const user = userEvent.setup();
    onCreate.mockReturnValue(new Promise(() => {}));
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByLabelText(/name/i), 'Bare');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    const submit = await screen.findByRole('button', { name: /creating/i });
    expect(submit.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
  });

  it('should call onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<NewWorkflowModal onClose={onClose} onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
