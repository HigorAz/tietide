import { Link } from 'react-router-dom';

export function HomeEmptyState(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/10 bg-surface/40 p-12 text-center">
      <h2 className="text-base font-semibold text-text-primary">Let's build your first workflow</h2>
      <p className="max-w-md text-sm text-text-secondary">
        Pick a starter from the library or wire one up from scratch — every workflow chains a
        trigger to one or more actions.
      </p>
      <Link
        to="/library"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal"
      >
        Browse the library
      </Link>
    </div>
  );
}
