import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkflowDocumentationResponse } from '@/api/ai';
import { DocumentationModal } from './DocumentationModal';
import { downloadDocAsPdf, downloadDocAsWord } from '@/lib/exportDocument';

vi.mock('@/lib/exportDocument', () => ({
  slugifyDocFilename: (s: string) => s,
  downloadDocAsWord: vi.fn().mockResolvedValue(undefined),
  downloadDocAsPdf: vi.fn().mockResolvedValue(undefined),
}));

const docs: WorkflowDocumentationResponse = {
  workflowId: 'wf-1',
  version: 2,
  documentation: '# Heading\n\nBody text here.',
  sections: {},
  model: 'llama3.1:8b',
  generatedAt: '2026-05-01T00:00:00.000Z',
};

const baseProps = () => ({
  workflowName: 'Demo workflow',
  status: 'ready' as const,
  docs,
  error: null,
  onRegenerate: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentationModal', () => {
  it('renders the documentation in view mode', () => {
    render(<DocumentationModal {...baseProps()} />);
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByText('Body text here.')).toBeInTheDocument();
  });

  it('enters edit mode and saves edited content via onSave', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<DocumentationModal {...props} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByLabelText('Edit documentation');
    await user.clear(textarea);
    await user.type(textarea, '# Edited');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('# Edited'));
  });

  it('prompts to confirm when closing with unsaved edits', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<DocumentationModal {...props} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Edit documentation'), ' extra');

    // Closing while dirty does NOT close immediately — it asks first.
    await user.click(screen.getByRole('button', { name: 'Close documentation' }));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // "Go back" dismisses the prompt and keeps editing.
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('discards edits and closes from the confirm prompt', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<DocumentationModal {...props} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Edit documentation'), ' extra');
    await user.click(screen.getByRole('button', { name: 'Close documentation' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('closes immediately when there are no unsaved edits', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<DocumentationModal {...props} />);

    await user.click(screen.getByRole('button', { name: 'Close documentation' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('downloads as Word and PDF from the download menu', async () => {
    const user = userEvent.setup();
    render(<DocumentationModal {...baseProps()} />);

    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getByRole('menuitem', { name: /word/i }));
    await waitFor(() => expect(downloadDocAsWord).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Download' }));
    await user.click(screen.getByRole('menuitem', { name: /pdf/i }));
    await waitFor(() => expect(downloadDocAsPdf).toHaveBeenCalledTimes(1));
  });
});
