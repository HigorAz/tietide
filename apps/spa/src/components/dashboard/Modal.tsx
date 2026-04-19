import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  titleId?: string;
  className?: string;
}

export function Modal({
  children,
  onClose,
  ariaLabel,
  titleId,
  className,
}: ModalProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-deep-blue/70 px-4 py-8"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-label={titleId ? undefined : ariaLabel}
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-lg bg-surface p-6 shadow-xl focus:outline-none',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
