import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import { NodeGlyph } from './NodeGlyph';

describe('NodeGlyph', () => {
  it('renders the provider brand icon for a connector node', () => {
    const { container } = render(<NodeGlyph type={NodeType.GMAIL_SEND} />);
    expect(container.querySelector('[data-testid="brand-icon-gmail"]')).toBeInTheDocument();
  });

  it('renders the Discord brand icon for the Discord trigger', () => {
    const { container } = render(<NodeGlyph type={NodeType.DISCORD_MESSAGE_RECEIVED} />);
    expect(container.querySelector('[data-testid="brand-icon-discord"]')).toBeInTheDocument();
  });

  it('keeps the distinctive Lucide icon for Core/Logic nodes (no brand flattening)', () => {
    const core = render(<NodeGlyph type={NodeType.HTTP_REQUEST} />);
    expect(core.container.querySelector('[data-testid^="brand-icon-"]')).not.toBeInTheDocument();
    expect(core.container.querySelector('svg')).toBeInTheDocument();

    const logic = render(<NodeGlyph type={NodeType.CONDITIONAL} />);
    expect(logic.container.querySelector('[data-testid^="brand-icon-"]')).not.toBeInTheDocument();
    expect(logic.container.querySelector('svg')).toBeInTheDocument();
  });
});
