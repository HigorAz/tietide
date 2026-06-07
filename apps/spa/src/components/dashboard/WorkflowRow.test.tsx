import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workflow } from '@tietide/shared';
import { WorkflowRow } from './WorkflowRow';

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Example',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  folderId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  executionCount: 0,
  documentation: null,
  tags: [],
  ...overrides,
});

const defaultProps = () => ({
  workflow: makeWorkflow(),
  isExpanded: false,
  isGeneratingDocs: false,
  docsContent: null,
  docsError: null,
  selected: false,
  onOpen: vi.fn(),
  onToggleActive: vi.fn(),
  onDelete: vi.fn(),
  onGenerateDocs: vi.fn(),
  onToggleDocsExpanded: vi.fn(),
  onToggleSelect: vi.fn(),
  onRename: vi.fn().mockResolvedValue(undefined),
});

describe('WorkflowRow', () => {
  describe('inline rename', () => {
    it('clicking the workflow name swaps it for an input field with current value', async () => {
      const user = userEvent.setup();
      render(<WorkflowRow {...defaultProps()} />);

      await user.click(screen.getByText('Example'));

      const input = await screen.findByLabelText(/rename/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Example');
    });

    it('Enter saves the new name via onRename and exits edit mode', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByText('Example'));
      const input = await screen.findByLabelText(/rename/i);
      await user.clear(input);
      await user.type(input, 'Renamed{Enter}');

      await waitFor(() => {
        expect(props.onRename).toHaveBeenCalledWith('wf-1', 'Renamed');
      });
      // Editing exits — input no longer in DOM.
      await waitFor(() => {
        expect(screen.queryByLabelText(/rename/i)).not.toBeInTheDocument();
      });
    });

    it('blur saves the new name via onRename', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByText('Example'));
      const input = await screen.findByLabelText(/rename/i);
      await user.clear(input);
      await user.type(input, 'Blurred');
      input.blur();

      await waitFor(() => {
        expect(props.onRename).toHaveBeenCalledWith('wf-1', 'Blurred');
      });
    });

    it('Escape reverts and exits edit mode without calling onRename', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByText('Example'));
      const input = await screen.findByLabelText(/rename/i);
      await user.clear(input);
      await user.type(input, 'Should revert{Escape}');

      await waitFor(() => {
        expect(screen.queryByLabelText(/rename/i)).not.toBeInTheDocument();
      });
      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    it('keeps the row in edit mode when onRename rejects (e.g. empty name)', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      props.onRename.mockRejectedValueOnce(new Error('Name is required'));
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByText('Example'));
      const input = await screen.findByLabelText(/rename/i);
      await user.clear(input);
      await user.type(input, '{Enter}');

      // onRename was called with empty string — parent decides validity.
      await waitFor(() => {
        expect(props.onRename).toHaveBeenCalledWith('wf-1', '');
      });
      // Input should remain because parent rejected.
      expect(await screen.findByLabelText(/rename/i)).toBeInTheDocument();
    });

    it('clicking the name does not call onOpen (only opens edit mode)', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByText('Example'));

      expect(props.onOpen).not.toHaveBeenCalled();
    });
  });

  describe('selection', () => {
    it('renders an unchecked checkbox when selected=false', () => {
      render(<WorkflowRow {...defaultProps()} />);
      const checkbox = screen.getByRole('checkbox', { name: /select Example/i });
      expect(checkbox).not.toBeChecked();
    });

    it('renders a checked checkbox when selected=true', () => {
      render(<WorkflowRow {...defaultProps()} selected />);
      const checkbox = screen.getByRole('checkbox', { name: /select Example/i });
      expect(checkbox).toBeChecked();
    });

    it('clicking the checkbox calls onToggleSelect with the workflow id', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByRole('checkbox', { name: /select Example/i }));

      expect(props.onToggleSelect).toHaveBeenCalledWith('wf-1');
    });

    it('clicking the checkbox does not trigger onOpen', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByRole('checkbox', { name: /select Example/i }));

      expect(props.onOpen).not.toHaveBeenCalled();
    });
  });

  describe('docs regeneration affordance', () => {
    it('keeps existing docs visible with an "Updating" indicator while regenerating', () => {
      render(
        <WorkflowRow
          {...defaultProps()}
          isExpanded
          isGeneratingDocs
          docsContent={'# Existing docs\n\nbody text'}
        />,
      );

      expect(screen.getByText(/existing docs/i)).toBeInTheDocument();
      expect(screen.getByText(/updating documentation/i)).toBeInTheDocument();
    });
  });

  describe('existing behavior preserved', () => {
    it('clicking the chevron/row body still opens the workflow', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByRole('button', { name: /open Example/i }));

      expect(props.onOpen).toHaveBeenCalledWith('wf-1');
    });

    it('toggle button still calls onToggleActive', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByRole('switch', { name: /toggle active for Example/i }));

      expect(props.onToggleActive).toHaveBeenCalledWith('wf-1', true);
    });

    it('delete button still calls onDelete', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<WorkflowRow {...props} />);

      await user.click(screen.getByRole('button', { name: /delete Example/i }));

      expect(props.onDelete).toHaveBeenCalledWith('wf-1');
    });
  });
});
