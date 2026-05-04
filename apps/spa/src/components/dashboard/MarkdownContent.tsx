import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/utils/cn';

export interface MarkdownContentProps {
  source: string;
  className?: string;
}

function MarkdownContentImpl({ source, className }: MarkdownContentProps): JSX.Element {
  return (
    <div
      className={cn(
        'prose prose-invert prose-sm max-w-none',
        'prose-headings:text-text-primary prose-p:text-text-secondary',
        'prose-strong:text-text-primary prose-code:text-accent-teal',
        'prose-a:text-accent-teal prose-li:text-text-secondary',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentImpl);
