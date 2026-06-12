import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export type RunSectionTone = 'neutral' | 'success' | 'failed';

export interface RunSection {
  id: string;
  title: string;
  tone: RunSectionTone;
  defaultOpen: boolean;
  badge?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export interface RunSectionTimelineProps {
  sections: RunSection[];
  testId?: string;
}

const DOT_TONE: Record<RunSectionTone, string> = {
  neutral: 'border-white/20',
  success: 'border-status-success',
  failed: 'border-status-failed',
};

/**
 * Generic collapsible section timeline (locked sketch 002-D): a status rail with
 * one tone-colored dot per card, each card a click-to-toggle header over a body,
 * plus an expand-all / collapse-all control. Intentionally semantics-free — it
 * knows nothing about config/input/output; callers pass titles, tones, badges,
 * header actions, and bodies. Header-action clicks stopPropagation so they never
 * toggle the section.
 */
export function RunSectionTimeline({
  sections,
  testId = 'run-section-timeline',
}: RunSectionTimelineProps): JSX.Element {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.id, s.defaultOpen])),
  );

  // Reconcile the open map when the section id SET changes (e.g. a success run
  // → failed run on the same selected node inserts the Error card). Newly-added
  // sections seed from their `defaultOpen` (so the Error card opens by default),
  // removed ids drop, and user toggles on still-present sections are preserved
  // (WR-04). Keyed on the joined id set so reordering/content swaps don't reset.
  const sectionIdKey = sections.map((s) => s.id).join('|');
  useEffect(() => {
    setOpen((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of sections) next[s.id] = prev[s.id] ?? s.defaultOpen;
      return next;
    });
    // `sections` is intentionally excluded — we only reconcile on the id set
    // (`sectionIdKey`), not on every per-render rebuild of the sections array.
  }, [sectionIdKey]);

  const allOpen = sections.length > 0 && sections.every((s) => open[s.id]);

  const toggle = (id: string): void => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAll = (value: boolean): void => {
    setOpen(Object.fromEntries(sections.map((s) => [s.id, value])));
  };

  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex justify-end">
        <button
          type="button"
          data-testid="run-section-expand-all"
          onClick={() => setAll(!allOpen)}
          className="text-xs text-text-secondary transition hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          {allOpen ? '− collapse all' : '+ expand all'}
        </button>
      </div>

      <div className="relative space-y-2 pl-[18px] before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-white/10 before:content-['']">
        {sections.map((section) => {
          const isOpen = open[section.id] ?? section.defaultOpen;
          return (
            <div
              key={section.id}
              data-testid={`run-section-card-${section.id}`}
              className="relative rounded-md border border-white/5 bg-deep-blue/40"
            >
              <span
                data-testid={`run-section-dot-${section.id}`}
                className={cn(
                  'absolute -left-[17px] top-3.5 h-2.5 w-2.5 rounded-full border-2 bg-surface',
                  DOT_TONE[section.tone],
                )}
              />
              <div className="flex items-center gap-2 pr-3">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-xs uppercase tracking-wide text-text-secondary transition hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
                >
                  <ChevronRight
                    size={12}
                    aria-hidden
                    className={cn('shrink-0 transition-transform', isOpen && 'rotate-90')}
                  />
                  <span>{section.title}</span>
                  {section.badge && (
                    <span className="text-[10px] normal-case text-text-muted">{section.badge}</span>
                  )}
                </button>
                {section.headerActions && (
                  <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {section.headerActions}
                  </span>
                )}
              </div>
              {isOpen && <div className="border-t border-white/5 p-3">{section.children}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
