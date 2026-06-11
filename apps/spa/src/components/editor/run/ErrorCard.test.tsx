import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCard } from './ErrorCard';

const writeText = vi.fn(async () => undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('ErrorCard', () => {
  const demoError = {
    message: 'Template path not found: steps.code.count',
    code: 'TEMPLATE_PATH_NOT_FOUND',
  };

  it('should highlight the failing template path in the message', () => {
    render(<ErrorCard error={demoError} />);
    const mark = screen.getByTestId('error-highlight');
    expect(mark).toHaveTextContent('steps.code.count');
    expect(mark.tagName.toLowerCase()).toBe('mark');
  });

  it('should render the error code uppercase in the header', () => {
    render(<ErrorCard error={demoError} />);
    expect(screen.getByText('TEMPLATE_PATH_NOT_FOUND')).toBeInTheDocument();
    expect(screen.getByText(/node failed/i)).toBeInTheDocument();
  });

  it('should render a hint line when one is derivable', () => {
    render(<ErrorCard error={demoError} />);
    expect(screen.getByText(/Hint:/i)).toBeInTheDocument();
    expect(screen.getByText(/upstream node didn't expose that field/i)).toBeInTheDocument();
  });

  it('should not render a hint when none is derivable', () => {
    render(<ErrorCard error={{ message: 'Some unknown failure', code: null }} />);
    expect(screen.queryByText(/Hint:/i)).toBeNull();
  });

  it('should render Fix in Configure only when the callback is provided', () => {
    const onFix = vi.fn();
    const { rerender } = render(<ErrorCard error={demoError} onFixInConfigure={onFix} />);
    expect(screen.getByRole('button', { name: /fix in configure/i })).toBeInTheDocument();

    rerender(<ErrorCard error={demoError} />);
    expect(screen.queryByRole('button', { name: /fix in configure/i })).toBeNull();
  });

  it('should fire onFixInConfigure on click', async () => {
    const onFix = vi.fn();
    render(<ErrorCard error={demoError} onFixInConfigure={onFix} />);
    await userEvent.click(screen.getByRole('button', { name: /fix in configure/i }));
    expect(onFix).toHaveBeenCalledTimes(1);
  });

  it('should copy "message\\n[code]" when copy error is clicked', async () => {
    render(<ErrorCard error={demoError} />);
    await userEvent.click(screen.getByRole('button', { name: /copy error/i }));
    expect(writeText).toHaveBeenCalledWith(
      'Template path not found: steps.code.count\n[TEMPLATE_PATH_NOT_FOUND]',
    );
  });

  it('should copy just the message when code is null', async () => {
    render(<ErrorCard error={{ message: 'plain failure', code: null }} />);
    await userEvent.click(screen.getByRole('button', { name: /copy error/i }));
    expect(writeText).toHaveBeenCalledWith('plain failure');
  });
});
