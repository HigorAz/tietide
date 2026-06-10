import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

export interface FieldLabelProps {
  htmlFor?: string;
  /** Rendered as-is in sentence case — this component does NOT uppercase. */
  label: string;
  /** Red required dot after the label (per sketch: "Query •"). */
  required?: boolean;
  /** Help text shown behind an ⓘ tooltip when present. */
  help?: string;
}

/**
 * Sentence-case field label with an optional required dot and an ⓘ help
 * tooltip. No global TooltipProvider is mounted in the SPA, so the tooltip is
 * wrapped in a local provider (valid Radix usage).
 */
export function FieldLabel({ htmlFor, label, required, help }: FieldLabelProps): JSX.Element {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div className="flex items-center gap-1.5">
      <Tag htmlFor={htmlFor} className="text-xs font-medium text-text-secondary">
        {label}
        {required && (
          <>
            <span
              data-testid="field-label-required-dot"
              aria-hidden
              className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-status-failed align-middle"
            />
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Tag>
      {help && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="field-label-help"
                aria-label={`Help: ${label}`}
                className="text-text-muted transition-colors hover:text-text-secondary focus:outline-none focus-visible:text-text-secondary"
              >
                <Info size={13} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent>{help}</TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
