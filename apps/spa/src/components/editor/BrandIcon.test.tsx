import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrandIcon } from './BrandIcon';

describe('BrandIcon', () => {
  it('renders a bright brand in its true colour', () => {
    const { container } = render(<BrandIcon appId="discord" colored />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('fill')).toBe('#5865F2');
  });

  it('lightens a near-black brand on a dark surface so it stays visible', () => {
    const { container } = render(<BrandIcon appId="github" colored onDarkSurface />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('fill')).toBe('#E6EDF3');
  });

  it('keeps the literal dark brand hex when not on a dark surface', () => {
    const { container } = render(<BrandIcon appId="github" colored />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('fill')).toBe('#181717');
  });

  it('inherits currentColor when not coloured', () => {
    const { container } = render(<BrandIcon appId="discord" colored={false} />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('fill')).toBe('currentColor');
  });
});
