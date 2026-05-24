import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkflowDocumentationResponse } from '@/api/ai';
import { useDocumentationStore } from '@/stores/documentationStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';

vi.mock('@/api/ai', () => ({
  getWorkflowDocs: vi.fn(),
  regenerateWorkflowDocs: vi.fn(),
}));

import { getWorkflowDocs, regenerateWorkflowDocs } from '@/api/ai';
import { DocumentationPanel } from './DocumentationPanel';

const mockedGet = vi.mocked(getWorkflowDocs);
const mockedRegenerate = vi.mocked(regenerateWorkflowDocs);

const sample: WorkflowDocumentationResponse = {
  workflowId: 'wf-1',
  version: 3,
  documentation: '# Demo Workflow\n\nThis is **generated** documentation.',
  sections: {
    objective: 'Move data from A to B',
    triggers: 'Manual',
    actions: 'HTTP request',
    dataFlow: 'A → B',
    decisions: 'None',
  },
  model: 'llama3.1:8b',
  generatedAt: '2026-04-26T01:00:00Z',
};

describe('DocumentationPanel', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedRegenerate.mockReset();
    mockedGet.mockResolvedValue(null); // default: no existing docs
    useDocumentationStore.setState({ status: 'idle', docs: null, error: null });
    useToastStore.setState({ ...initialToastState });
  });

  describe('initial mount', () => {
    it('should render a Generate Documentation button when no docs exist', () => {
      render(<DocumentationPanel workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /generate documentation/i })).toBeInTheDocument();
    });

    it('should NOT auto-fetch docs on mount (lazy until the dialog is opened)', () => {
      render(<DocumentationPanel workflowId="wf-1" />);
      // Fetch is deferred until handleRegenerate explicitly opens the dialog.
      expect(mockedGet).not.toHaveBeenCalled();
      expect(mockedRegenerate).not.toHaveBeenCalled();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should NOT auto-open the dialog when cached docs are available', () => {
      // The store may already have docs from a prior session, but the floating
      // dialog stays closed until the user clicks the toolbar button.
      useDocumentationStore.setState({ status: 'ready', docs: sample, error: null });

      render(<DocumentationPanel workflowId="wf-1" />);

      expect(screen.queryByRole('heading', { name: /demo workflow/i })).not.toBeInTheDocument();
    });
  });

  describe('regenerate action', () => {
    it('should call regenerateWorkflowDocs (not GET) when the button is clicked', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() => expect(mockedRegenerate).toHaveBeenCalledWith('wf-1'));
    });

    it('should show a loading indicator and disable the button while regenerating', async () => {
      let resolveFn: (v: WorkflowDocumentationResponse) => void = () => {};
      mockedRegenerate.mockReturnValue(
        new Promise<WorkflowDocumentationResponse>((resolve) => {
          resolveFn = resolve;
        }),
      );

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByText(/generating documentation/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
      resolveFn(sample);
    });
  });

  describe('ready state', () => {
    it('should render rendered markdown documentation when regeneration succeeds', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByRole('heading', { name: /demo workflow/i })).toBeInTheDocument();
      expect(screen.getByText(/move data from a to b/i)).toBeInTheDocument();
    });

    it('should expose a copy-to-clipboard button that copies the raw markdown', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);
      const copyButton = await screen.findByRole('button', { name: /copy/i });
      await user.click(copyButton);

      expect(writeText).toHaveBeenCalledWith(sample.documentation);
      expect(await screen.findByText(/copied/i)).toBeInTheDocument();
    });

    it('should not render any "served from cache" indicator after opening the dialog', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /demo workflow/i })).toBeInTheDocument(),
      );
      expect(screen.queryByText(/served from cache/i)).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show fallback message when AI service is down', async () => {
      mockedRegenerate.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('toast feedback', () => {
    it('should fire a success toast when regenerate transitions to ready', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'success' });
        expect(toasts[0].message).toMatch(/documentation/i);
      });
    });

    it('should fire an error toast when regenerate transitions to error', async () => {
      mockedRegenerate.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts).toHaveLength(1);
        expect(toasts[0]).toMatchObject({ tone: 'error' });
      });
    });

    it('should keep the inline retry block alongside the error toast', async () => {
      mockedRegenerate.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(useToastStore.getState().toasts).toHaveLength(1);
      });
    });

    it('should not fire a toast on initial mount (lazy fetch — no API call yet)', () => {
      render(<DocumentationPanel workflowId="wf-1" />);
      expect(mockedGet).not.toHaveBeenCalled();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should fire a success toast only after an explicit regenerate click', async () => {
      mockedRegenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      // Mount alone fires no toast — cached-docs hydration was removed from
      // the floating dialog in favour of the dock-tab path.
      expect(useToastStore.getState().toasts).toHaveLength(0);

      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    });
  });

  describe('spinner', () => {
    it('should render the shared Spinner inside the trigger button while loading', async () => {
      mockedRegenerate.mockReturnValue(new Promise(() => {}));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      const triggerButton = await screen.findByRole('button', { name: /generating/i });
      expect(triggerButton.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
    });
  });
});
