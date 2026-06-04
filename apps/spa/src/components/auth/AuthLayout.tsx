import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import logoIcon from '@/assets/brand/logo-icon.png';
import { AuthFlow } from './AuthFlow';
import { FLOW_GAP, NODE_R, type FlowGeo } from './authFlowGeometry';
import './auth.css';

const FEATURES = [
  'Visual drag-and-drop workflow builder',
  '20+ app connectors across SaaS, data & comms',
  'AI-generated workflow documentation',
  'Self-hostable & open by design',
];

function Wordmark({ className }: { className?: string }): JSX.Element {
  return (
    <span className={className}>
      <img src={logoIcon} alt="" aria-hidden className="h-9 w-9 rounded-[11px]" />
      <span className="text-[21px] font-bold text-text-primary">
        Tie<span className="text-accent-teal">Tide</span>
      </span>
    </span>
  );
}

/**
 * Split-screen auth shell: a branded "tide" panel beside the form column, sharing
 * a measured workflow graph in the gutter. The form content for each page is passed
 * as `children` (rendered into the right column).
 */
export function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  const innerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<FlowGeo | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return undefined;

    const measure = (): void => {
      const box = inner.getBoundingClientRect();
      // Single-column (mobile) layout has no gutter to draw into.
      if (box.width < 920 || box.height <= 0) {
        setGeo(null);
        return;
      }
      const title = titleRef.current;
      const card = formCardRef.current;
      if (!title || !card) return;

      // Right edge of the actual title glyphs (not the padded box).
      let titleRight = title.getBoundingClientRect().right;
      try {
        const range = document.createRange();
        range.selectNodeContents(title);
        const r = range.getBoundingClientRect();
        if (r.width > 0) titleRight = r.right;
      } catch {
        /* createRange unavailable — fall back to the element box */
      }
      const formLeft = card.getBoundingClientRect().left;

      setGeo({
        w: box.width,
        h: box.height,
        x0: titleRight - box.left + FLOW_GAP + NODE_R,
        x3: formLeft - box.left - FLOW_GAP - NODE_R,
      });
    };

    measure();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(inner);
    }
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(measure);
    }
    return () => ro?.disconnect();
  }, []);

  return (
    <div className="auth-shell">
      <div className="auth-grid" aria-hidden />
      <div ref={innerRef} className="auth-inner">
        <AuthFlow geo={geo} />

        <aside className="auth-brand">
          <div className="flex flex-col gap-7">
            <Wordmark className="flex items-center gap-2.5" />
            <div>
              <p className="mb-[18px] text-xs font-semibold uppercase tracking-[2px] text-accent-teal">
                Integration &amp; automation
              </p>
              <h2
                ref={titleRef}
                className="mb-[18px] max-w-[12ch] text-[46px] font-extrabold leading-[1.08] text-text-primary"
              >
                Connect your tools. Ride the tide.
              </h2>
              <p className="max-w-[33ch] text-base leading-relaxed text-text-secondary">
                Build, run, and monitor integrations between the apps your business already lives in
                — no glue code required.
              </p>
              <ul className="mt-7 grid max-w-[34ch] gap-3.5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-[15px] text-text-primary">
                    <span className="flex h-[23px] w-[23px] flex-none items-center justify-center rounded-full bg-accent-teal/15 text-xs text-accent-teal">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-[52px] text-xs text-text-muted">
              © 2026 TieTide · Self-hostable iPaaS
            </p>
          </div>
        </aside>

        <main className="auth-form-col">
          <div ref={formCardRef} className="w-full max-w-[384px]">
            <Wordmark className="auth-mobile-logo mb-7 items-center gap-2.5" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
