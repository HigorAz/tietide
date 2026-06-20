import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { GitHubCommentIssueForm } from './GitHubCommentIssueForm';

vi.mock('../../ConnectionPicker', () => ({
  ConnectionPicker: () => <div data-testid="connection-picker" />,
}));

describe('GitHubCommentIssueForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  it('renders the Issue / PR number field with an fx toggle', () => {
    render(<GitHubCommentIssueForm nodeId="n1" config={{}} />);
    expect(screen.getByTestId('github-comment-issue-number-fx-toggle')).toBeInTheDocument();
  });

  it('switches the issue number field into expression mode when fx is toggled', () => {
    render(<GitHubCommentIssueForm nodeId="n1" config={{ issueNumber: 5 }} />);
    const toggle = screen.getByTestId('github-comment-issue-number-fx-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('starts the number field in expression mode for a template value', () => {
    render(
      <GitHubCommentIssueForm nodeId="n1" config={{ issueNumber: '{{trigger.issue.number}}' }} />,
    );
    expect(screen.getByTestId('github-comment-issue-number-fx-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
