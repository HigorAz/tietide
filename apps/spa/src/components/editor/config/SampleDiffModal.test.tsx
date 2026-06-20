import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SampleDiffModal } from './SampleDiffModal';

describe('SampleDiffModal', () => {
  it('renders both the current and new samples', () => {
    render(
      <SampleDiffModal
        previous={{ a: 'old' }}
        next={{ a: 'new' }}
        onKeep={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sample-diff-previous')).toBeInTheDocument();
    expect(screen.getByTestId('sample-diff-next')).toBeInTheDocument();
  });

  it('calls onKeep when "Keep current" is clicked', () => {
    const onKeep = vi.fn();
    render(<SampleDiffModal previous={{}} next={{}} onKeep={onKeep} onReplace={vi.fn()} />);
    fireEvent.click(screen.getByTestId('sample-diff-keep'));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('calls onReplace when "Replace" is clicked', () => {
    const onReplace = vi.fn();
    render(<SampleDiffModal previous={{}} next={{}} onKeep={vi.fn()} onReplace={onReplace} />);
    fireEvent.click(screen.getByTestId('sample-diff-replace'));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });
});
