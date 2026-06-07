import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkflowDocumentationResponse } from '@/api/ai';
import { useDocumentationStore } from '@/stores/documentationStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';

vi.mock('@/api/ai', () => ({
  getWorkflowDocs: vi.fn(),
  startWorkflowDocsRegeneration: vi.fn(),
}));

import { getWorkflowDocs, startWorkflowDocsRegeneration } from '@/api/ai';
import { DocumentationPanel } from './DocumentationPanel';

const mockedGet = vi.mocked(getWorkflowDocs);
const mockedStart = vi.mocked(startWorkflowDocsRegeneration);

const sample: WorkflowDocumentationResponse = {
  workflowId: 'wf-1',
  version: 3,
  documentation: '# Demo Workflow\n\nThis is **generated** documentation.',
  sections: {
    overview: 'Move data from A to B',
    prerequisites: 'Requires a Slack connection',
    trigger: 'Manual',
    walkthrough: 'Step 1 trigger fires, step 2 HTTP request runs.',
    dataFlow: 'A → B',
    decisions: 'None',
    errorHandling: 'Retries twice on failure',
  },
  model: 'llama3.1:8b',
  generatedAt: '2026-04-26T01:00:00Z',
};

describe('DocumentationPanel', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedStart.mockReset();
    mockedGet.mockResolvedValue(null); // default: no existing docs
    // POST returns 202 immediately; the doc arrives via polling getWorkflowDocs.
    mockedStart.mockResolvedValue({ workflowId: 'wf-1', status: 'pending' });
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
      expect(mockedStart).not.toHaveBeenCalled();
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
    it('should POST to start regeneration when the button is clicked', async () => {
      mockedGet.mockResolvedValue(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      await waitFor(() => expect(mockedStart).toHaveBeenCalledWith('wf-1'));
    });

    it('should show a loading indicator and disable the button while regenerating', async () => {
      // POST stays pending → the panel sits in the loading state.
      mockedStart.mockReturnValue(new Promise(() => {}));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByText(/generating documentation/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
    });
  });

  describe('ready state', () => {
    it('should render rendered markdown documentation when regeneration succeeds', async () => {
      mockedGet.mockResolvedValue(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      expect(await screen.findByRole('heading', { name: /demo workflow/i })).toBeInTheDocument();
      expect(screen.getByText(/move data from a to b/i)).toBeInTheDocument();
      // New runbook sections render.
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Prerequisites')).toBeInTheDocument();
      expect(screen.getByText('Walkthrough')).toBeInTheDocument();
      expect(screen.getByText('Error handling')).toBeInTheDocument();
      expect(screen.getByText(/step 1 trigger fires/i)).toBeInTheDocument();
    });

    it('should render legacy section keys from docs generated before the redesign', async () => {
      const legacy: WorkflowDocumentationResponse = {
        ...sample,
        sections: {
          objective: 'Legacy objective text',
          walkthrough: 'Legacy walkthrough',
          triggers: 'Manual',
          actions: 'HTTP request',
          dataFlow: 'A → B',
          decisions: 'None',
        },
      };
      mockedGet.mockResolvedValue(legacy);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /generate documentation/i }));

      // Legacy objective surfaces under the Overview label; Actions still shows.
      expect(await screen.findByText(/legacy objective text/i)).toBeInTheDocument();
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
      // New-only sections are absent for legacy docs.
      expect(screen.queryByText('Prerequisites')).not.toBeInTheDocument();
      expect(screen.queryByText('Error handling')).not.toBeInTheDocument();
    });

    it('should expose a copy-to-clipboard button that copies the raw markdown', async () => {
      mockedGet.mockResolvedValue(sample);

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
      mockedGet.mockResolvedValue(sample);

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
      mockedStart.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

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
      mockedGet.mockResolvedValue(sample);

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
      mockedStart.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

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
      mockedStart.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

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
      mockedGet.mockResolvedValue(sample);

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
      mockedStart.mockReturnValue(new Promise(() => {}));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const button = await screen.findByRole('button', { name: /generate documentation/i });
      await user.click(button);

      const triggerButton = await screen.findByRole('button', { name: /generating/i });
      expect(triggerButton.querySelector('[data-testid="spinner"]')).toBeInTheDocument();
    });
  });
});
