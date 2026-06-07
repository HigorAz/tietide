import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagChips } from './TagChips';

describe('TagChips', () => {
  it('renders a pill per tag with its name', () => {
    render(
      <TagChips
        tags={[
          { id: '1', name: 'urgent', color: '#ef4444' },
          { id: '2', name: 'finance', color: null },
        ]}
      />,
    );

    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('finance')).toBeInTheDocument();
  });

  it('renders nothing when there are no tags', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
