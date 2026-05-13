import { useState } from 'react';
import { ConnectionType } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { PROVIDER_CATALOG, type ProviderEntry } from './providerCatalog';
import { buildSetupGuideUrl } from './setupGuideUrl';

export interface ProviderPickerProps {
  onPick: (provider: ProviderEntry) => void;
}

export function ProviderPicker({ onPick }: ProviderPickerProps): JSX.Element {
  const [iconErrors, setIconErrors] = useState<Record<string, true>>({});

  return (
    <section aria-labelledby="available-providers-heading">
      <h2
        id="available-providers-heading"
        className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary"
      >
        Available providers
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {PROVIDER_CATALOG.map((provider) => {
          const showFallback = iconErrors[provider.id];
          return (
            <li key={provider.id} className="relative">
              <button
                type="button"
                onClick={() => onPick(provider)}
                data-testid={`provider-card-${provider.id}`}
                className={cn(
                  'group flex w-full flex-col items-center gap-2 rounded-lg border border-white/5 bg-surface p-4 text-center transition',
                  'hover:border-accent-teal/40 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
                )}
              >
                {showFallback ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-elevated text-sm font-semibold text-text-secondary">
                    {provider.label.charAt(0)}
                  </div>
                ) : (
                  <img
                    src={provider.iconUrl}
                    alt={`${provider.label} logo`}
                    className="h-10 w-10 rounded-md"
                    onError={() => setIconErrors((prev) => ({ ...prev, [provider.id]: true }))}
                  />
                )}
                <span className="text-sm font-semibold text-text-primary">{provider.label}</span>
                <span className="text-xs text-text-muted">
                  {provider.type === ConnectionType.OAUTH2 ? 'OAuth' : 'API key'}
                </span>
                <span className="mt-1 inline-flex items-center rounded-md bg-accent-teal/10 px-2 py-1 text-xs font-medium text-accent-teal">
                  Connect
                </span>
              </button>
              {provider.setupGuidePath && (
                <a
                  href={buildSetupGuideUrl(provider.setupGuidePath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`provider-setup-guide-${provider.id}`}
                  aria-label={`${provider.label} setup guide (opens in new tab)`}
                  title={`${provider.label} setup guide`}
                  className={cn(
                    'absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full',
                    'border border-white/5 bg-elevated text-xs font-semibold text-text-secondary transition',
                    'hover:border-accent-teal/40 hover:text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
                  )}
                >
                  ?
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
