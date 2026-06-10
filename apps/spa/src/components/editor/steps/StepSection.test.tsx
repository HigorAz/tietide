import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StepSection } from './StepSection';

describe('StepSection', () => {
  it('active + open: shows the index number, children visible, aria-expanded=true', () => {
    render(
      <StepSection index={2} title="Configure" status="active" open onToggle={vi.fn()}>
        <p>body content</p>
      </StepSection>,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('done + closed: bubble shows a check, children hidden, summary visible', () => {
    const { container } = render(
      <StepSection
        index={1}
        title="Connection"
        status="done"
        summary="My Google · active"
        open={false}
        onToggle={vi.fn()}
        data-testid="step-1"
      >
        <p>body content</p>
      </StepSection>,
    );
    expect(screen.getByText('My Google · active')).toBeInTheDocument();
    expect(screen.queryByText('body content')).toBeNull();
    // lucide Check renders an svg with the lucide-check class.
    expect(container.querySelector('svg.lucide-check')).toBeTruthy();
  });

  it('locked: header disabled, onToggle not called, root dimmed', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <StepSection
        index={3}
        title="Test"
        status="locked"
        open={false}
        onToggle={onToggle}
        data-testid="step-3"
      >
        <p>body content</p>
      </StepSection>,
    );
    const header = screen.getByRole('button');
    expect(header).toBeDisabled();
    fireEvent.click(header);
    expect(onToggle).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="step-3"]')?.className).toContain('opacity');
  });

  it('pending + closed: bubble shows the number, clicking calls onToggle', () => {
    const onToggle = vi.fn();
    render(
      <StepSection index={2} title="Configure" status="pending" open={false} onToggle={onToggle}>
        <p>body content</p>
      </StepSection>,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keepMounted + closed: children stay mounted but hidden', () => {
    const { container } = render(
      <StepSection
        index={2}
        title="Configure"
        status="active"
        open={false}
        onToggle={vi.fn()}
        keepMounted
      >
        <p data-testid="kept-child">body content</p>
      </StepSection>,
    );
    const child = container.querySelector('[data-testid="kept-child"]');
    expect(child).toBeTruthy();
    expect(child?.closest('.hidden')).toBeTruthy();
  });

  it('keepMounted unset + closed: children are absent', () => {
    const { container } = render(
      <StepSection index={2} title="Configure" status="active" open={false} onToggle={vi.fn()}>
        <p data-testid="kept-child">body content</p>
      </StepSection>,
    );
    expect(container.querySelector('[data-testid="kept-child"]')).toBeNull();
  });
});
