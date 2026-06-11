import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunSectionTimeline, type RunSection } from './RunSectionTimeline';

describe('RunSectionTimeline', () => {
  it('should render one card per section in order', () => {
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'a',
            title: 'Alpha',
            tone: 'neutral',
            defaultOpen: true,
            children: <div>A body</div>,
          },
          {
            id: 'b',
            title: 'Beta',
            tone: 'success',
            defaultOpen: true,
            children: <div>B body</div>,
          },
        ]}
      />,
    );
    const cards = screen.getAllByTestId(/^run-section-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-testid', 'run-section-card-a');
    expect(cards[1]).toHaveAttribute('data-testid', 'run-section-card-b');
  });

  it('should keep a defaultOpen=false section collapsed until its header is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'cfg',
            title: 'Configuration',
            tone: 'neutral',
            defaultOpen: false,
            children: <div>secret body</div>,
          },
        ]}
      />,
    );
    expect(screen.queryByText('secret body')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /configuration/i }));
    expect(screen.getByText('secret body')).toBeInTheDocument();
  });

  it('should expand all sections and flip the control label when expand-all is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'a',
            title: 'Alpha',
            tone: 'neutral',
            defaultOpen: false,
            children: <div>A body</div>,
          },
          {
            id: 'b',
            title: 'Beta',
            tone: 'neutral',
            defaultOpen: false,
            children: <div>B body</div>,
          },
        ]}
      />,
    );
    const control = screen.getByTestId('run-section-expand-all');
    expect(control).toHaveTextContent(/expand all/i);
    expect(screen.queryByText('A body')).not.toBeInTheDocument();

    await user.click(control);
    expect(screen.getByText('A body')).toBeInTheDocument();
    expect(screen.getByText('B body')).toBeInTheDocument();
    expect(control).toHaveTextContent(/collapse all/i);

    await user.click(control);
    expect(screen.queryByText('A body')).not.toBeInTheDocument();
    expect(control).toHaveTextContent(/expand all/i);
  });

  it('should label the control as expand all unless every section is open', async () => {
    const user = userEvent.setup();
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'a',
            title: 'Alpha',
            tone: 'neutral',
            defaultOpen: true,
            children: <div>A body</div>,
          },
          {
            id: 'b',
            title: 'Beta',
            tone: 'neutral',
            defaultOpen: false,
            children: <div>B body</div>,
          },
        ]}
      />,
    );
    const control = screen.getByTestId('run-section-expand-all');
    // Not all open → expand all
    expect(control).toHaveTextContent(/expand all/i);

    // Open the second section manually → now all open → collapse all
    await user.click(screen.getByRole('button', { name: /beta/i }));
    expect(control).toHaveTextContent(/collapse all/i);
  });

  it('should render a badge in the header', () => {
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'out',
            title: 'Output',
            tone: 'success',
            defaultOpen: true,
            badge: '10 items',
            children: <div>body</div>,
          },
        ]}
      />,
    );
    expect(screen.getByText('10 items')).toBeInTheDocument();
  });

  it('should not toggle the section when a headerActions button is clicked (stopPropagation)', async () => {
    const user = userEvent.setup();
    render(
      <RunSectionTimeline
        sections={[
          {
            id: 'out',
            title: 'Output',
            tone: 'success',
            defaultOpen: true,
            headerActions: <button type="button">action</button>,
            children: <div>open body</div>,
          },
        ]}
      />,
    );
    expect(screen.getByText('open body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'action' }));
    // Section stays open — header toggle was not triggered.
    expect(screen.getByText('open body')).toBeInTheDocument();
  });

  it('should seed a newly-inserted section from its defaultOpen when the id set changes (WR-04)', () => {
    const baseSections: RunSection[] = [
      { id: 'input', title: 'Input', tone: 'neutral', defaultOpen: true, children: <div>in</div> },
      {
        id: 'output',
        title: 'Output',
        tone: 'success',
        defaultOpen: true,
        children: <div>out</div>,
      },
    ];
    const { rerender } = render(<RunSectionTimeline sections={baseSections} />);
    expect(screen.queryByText('error body')).not.toBeInTheDocument();

    // Re-render with an Error card inserted before Output (success → failed run on
    // the same component instance). It must render OPEN from its defaultOpen.
    const failedSections: RunSection[] = [
      baseSections[0],
      {
        id: 'error',
        title: 'Error',
        tone: 'failed',
        defaultOpen: true,
        children: <div>error body</div>,
      },
      { ...baseSections[1], tone: 'failed' },
    ];
    rerender(<RunSectionTimeline sections={failedSections} />);
    expect(screen.getByText('error body')).toBeInTheDocument();
  });

  it('should preserve a user toggle on a still-present section across an id-set change', async () => {
    const user = userEvent.setup();
    const a: RunSection = {
      id: 'a',
      title: 'Alpha',
      tone: 'neutral',
      defaultOpen: true,
      children: <div>A body</div>,
    };
    const b: RunSection = {
      id: 'b',
      title: 'Beta',
      tone: 'neutral',
      defaultOpen: true,
      children: <div>B body</div>,
    };
    const { rerender } = render(<RunSectionTimeline sections={[a, b]} />);
    // Collapse Alpha.
    await user.click(screen.getByRole('button', { name: /alpha/i }));
    expect(screen.queryByText('A body')).not.toBeInTheDocument();

    // Insert a new section c → Alpha's collapsed state must survive reconciliation.
    const c: RunSection = {
      id: 'c',
      title: 'Gamma',
      tone: 'neutral',
      defaultOpen: true,
      children: <div>C body</div>,
    };
    rerender(<RunSectionTimeline sections={[a, b, c]} />);
    expect(screen.queryByText('A body')).not.toBeInTheDocument();
    expect(screen.getByText('C body')).toBeInTheDocument();
  });

  it('should apply tone-based border classes to the rail dot', () => {
    render(
      <RunSectionTimeline
        sections={[
          { id: 'a', title: 'Alpha', tone: 'failed', defaultOpen: true, children: <div>A</div> },
        ]}
      />,
    );
    const dot = screen.getByTestId('run-section-dot-a');
    expect(dot.className).toContain('border-status-failed');
  });
});
