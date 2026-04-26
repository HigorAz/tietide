import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkflowDocumentationResponse } from '@/api/ai';
import { useDocumentationStore } from '@/stores/documentationStore';

vi.mock('@/api/ai', () => ({
  generateWorkflowDocs: vi.fn(),
}));

import { generateWorkflowDocs } from '@/api/ai';
import { DocumentationPanel } from './DocumentationPanel';

const mockedGenerate = vi.mocked(generateWorkflowDocs);

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
  cached: false,
  generatedAt: '2026-04-26T01:00:00Z',
};

describe('DocumentationPanel', () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
    useDocumentationStore.setState({ status: 'idle', docs: null, error: null });
  });

  describe('initial state', () => {
    it('should render a Generate Documentation button', () => {
      render(<DocumentationPanel workflowId="wf-1" />);
      expect(screen.getByRole('button', { name: /generate documentation/i })).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show a loading indicator and disable the button while generating', async () => {
      let resolveFn: (v: WorkflowDocumentationResponse) => void = () => {};
      mockedGenerate.mockReturnValue(
        new Promise<WorkflowDocumentationResponse>((resolve) => {
          resolveFn = resolve;
        }),
      );

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /generate documentation/i }));

      expect(await screen.findByText(/generating documentation/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
      resolveFn(sample);
    });
  });

  describe('ready state', () => {
    it('should render rendered markdown documentation when generation succeeds', async () => {
      mockedGenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /generate documentation/i }));

      expect(await screen.findByRole('heading', { name: /demo workflow/i })).toBeInTheDocument();
      expect(screen.getByText(/move data from a to b/i)).toBeInTheDocument();
    });

    it('should expose a copy-to-clipboard button that copies the raw markdown', async () => {
      mockedGenerate.mockResolvedValueOnce(sample);

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      await user.click(screen.getByRole('button', { name: /generate documentation/i }));
      const copyButton = await screen.findByRole('button', { name: /copy/i });
      await user.click(copyButton);

      expect(writeText).toHaveBeenCalledWith(sample.documentation);
      expect(await screen.findByText(/copied/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show fallback message when AI service is down', async () => {
      mockedGenerate.mockRejectedValueOnce(new Error('AI service temporarily unavailable'));

      render(<DocumentationPanel workflowId="wf-1" />);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /generate documentation/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });
});
