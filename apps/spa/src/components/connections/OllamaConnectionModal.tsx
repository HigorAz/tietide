import { useEffect, useId, useState } from 'react';
import {
  ConnectionProvider,
  ConnectionType,
  OLLAMA_TEXT_MODELS,
  ollamaConfigSchema,
} from '@tietide/shared';
import type { HttpConnectionModalProps } from './HttpConnectionModal';
import { getOllamaServerAvailability } from '@/api/connections';
import { OllamaModelSelect } from '@/components/editor/config/ollama/OllamaModelSelect';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';

export type OllamaConnectionModalProps = HttpConnectionModalProps;

type Mode = 'server' | 'self-hosted';

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 text-sm text-text-primary',
  'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

export function OllamaConnectionModal({
  onClose,
  onCreate,
}: OllamaConnectionModalProps): JSX.Element {
  const nameId = useId();
  const baseUrlId = useId();
  const modelId = useId();

  const [serverAvailable, setServerAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>('self-hosted');
  const [name, setName] = useState('Local Ollama');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getOllamaServerAvailability()
      .then((available) => {
        if (!active) return;
        setServerAvailable(available);
        if (available) setMode('server');
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmedName = name.trim();
    const nameOk = trimmedName.length > 0 && trimmedName.length <= 100;
    setNameError(nameOk ? null : 'Name is required');

    if (mode === 'server') {
      if (model.trim().length === 0) {
        setConfigError('Pick a default model');
        return;
      }
    } else {
      const parsed = ollamaConfigSchema.safeParse({ baseUrl, model });
      if (!parsed.success) {
        setConfigError(parsed.error.issues[0]?.message ?? 'Invalid configuration');
        return;
      }
    }
    setConfigError(null);
    if (!nameOk) return;

    setSubmitting(true);
    try {
      await onCreate({
        provider: ConnectionProvider.OLLAMA,
        type: ConnectionType.CUSTOM,
        name: trimmedName,
        // In server mode the baseUrl is injected by the API — send only the model.
        config: mode === 'server' ? { model } : { baseUrl, model },
        ...(mode === 'server' ? { ollamaServerHosted: true } : {}),
      });
    } catch {
      // Parent toasts the error.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal titleId="ollama-modal-title" ariaLabel="Connect Ollama" onClose={onClose}>
      <h2 id="ollama-modal-title" className="mb-1 text-lg font-semibold text-text-primary">
        Connect Ollama
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        Run local LLMs in your workflows. Use TieTide’s hosted Ollama, or point at your own
        self-hosted server.
      </p>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={nameId} className={labelClasses}>
            Connection name
          </label>
          <input
            id={nameId}
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClasses}
            aria-invalid={nameError ? 'true' : 'false'}
          />
          {nameError && (
            <p className="mt-1 text-xs text-error" role="alert">
              {nameError}
            </p>
          )}
        </div>

        {serverAvailable && (
          <fieldset className="space-y-2">
            <legend className={labelClasses}>Server</legend>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="ollama-mode"
                value="server"
                checked={mode === 'server'}
                onChange={() => setMode('server')}
                data-testid="ollama-mode-server"
              />
              Use TieTide’s hosted Ollama
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="ollama-mode"
                value="self-hosted"
                checked={mode === 'self-hosted'}
                onChange={() => setMode('self-hosted')}
                data-testid="ollama-mode-self-hosted"
              />
              Self-hosted (my own server)
            </label>
          </fieldset>
        )}

        {mode === 'self-hosted' && (
          <div>
            <label htmlFor={baseUrlId} className={labelClasses}>
              Server URL
            </label>
            <input
              id={baseUrlId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className={inputClasses}
            />
          </div>
        )}

        <div>
          <label htmlFor={modelId} className={labelClasses}>
            Default model
          </label>
          <OllamaModelSelect
            id={modelId}
            baseUrl={mode === 'self-hosted' ? baseUrl || undefined : undefined}
            ollamaServerHosted={mode === 'server'}
            value={model}
            onChange={setModel}
            curated={OLLAMA_TEXT_MODELS}
          />
        </div>

        {configError && (
          <p className="text-xs text-error" role="alert">
            {configError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
              'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {submitting && <Spinner size="sm" label="Connecting" />}
            <span>{submitting ? 'Connecting…' : 'Connect'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
