import { useRef, useState, type ChangeEvent } from 'react';
import { Upload } from 'lucide-react';
import type { Workflow } from '@tietide/shared';
import { createWorkflow } from '@/api/workflows';
import { useToastStore } from '@/stores/toastStore';
import { parseExport } from '@/lib/workflowExport';
import { cn } from '@/utils/cn';

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });

export interface ImportWorkflowButtonProps {
  onImported: (workflow: Workflow) => void;
  variant: 'primary' | 'secondary';
}

export function ImportWorkflowButton({
  onImported,
  variant,
}: ImportWorkflowButtonProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToastStore((s) => s.show);
  const [isImporting, setIsImporting] = useState(false);

  const openFileDialog = (): void => {
    inputRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await readFileAsText(file);
      const payload = parseExport(text);
      const created = await createWorkflow({
        name: payload.name,
        definition: payload.definition,
      });
      toast({ tone: 'success', message: `Imported "${created.name}"` });
      onImported(created);
    } catch (err) {
      toast({
        tone: 'error',
        message: errorMessage(err, 'Could not import workflow'),
      });
    } finally {
      setIsImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openFileDialog}
        disabled={isImporting}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition',
          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary'
            ? 'bg-accent-teal text-deep-blue hover:bg-accent-teal-hover'
            : 'border border-white/10 bg-elevated text-text-primary hover:bg-surface',
        )}
      >
        <Upload aria-hidden="true" className="h-4 w-4" />
        {isImporting ? 'Importing…' : 'Import'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.tietide.json,application/json"
        data-testid="import-workflow-file-input"
        className="hidden"
        onChange={(event) => {
          void handleFile(event);
        }}
      />
    </>
  );
}
