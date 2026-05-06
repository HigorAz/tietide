import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider } from './Slider';

describe('Slider', () => {
  describe('rendering', () => {
    it('should expose a thumb with role="slider" and the configured aria range', () => {
      render(<Slider defaultValue={[25]} min={0} max={100} aria-label="Test slider" />);

      const thumb = screen.getByRole('slider');
      expect(thumb).toBeInTheDocument();
      expect(thumb).toHaveAttribute('aria-valuemin', '0');
      expect(thumb).toHaveAttribute('aria-valuemax', '100');
      expect(thumb).toHaveAttribute('aria-valuenow', '25');
    });

    it('should forward custom className to the root', () => {
      render(
        <Slider
          data-testid="custom-slider"
          className="my-custom-class"
          defaultValue={[0]}
          min={0}
          max={10}
          aria-label="Test"
        />,
      );

      expect(screen.getByTestId('custom-slider')).toHaveClass('my-custom-class');
    });
  });

  describe('interaction', () => {
    it('should call onValueChange when the user nudges the thumb with the keyboard', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <Slider
          defaultValue={[5]}
          min={0}
          max={10}
          step={1}
          onValueChange={onValueChange}
          aria-label="Test slider"
        />,
      );

      const thumb = screen.getByRole('slider');
      thumb.focus();
      await user.keyboard('{ArrowRight}');

      expect(onValueChange).toHaveBeenCalledWith([6]);
    });
  });
});
