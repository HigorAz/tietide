import { useState } from 'react';

const stringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export interface JsonBlockProps {
  label: string;
  testId: string;
  value: unknown;
}

export function JsonBlock({ label, testId, value }: JsonBlockProps): JSX.Element {
  const text = stringify(value);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable / permission denied — degrade silently.
    }
  };

  return (
    <div data-testid={testId} className="space-y-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label} JSON`}
          className="rounded px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-32 overflow-auto rounded bg-deep-blue/40 p-2 text-[11px] leading-tight text-text-primary">
        {text}
      </pre>
    </div>
  );
}
