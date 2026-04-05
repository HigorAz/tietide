import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('should merge conflicting tailwind classes', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });
});
