import { useId, useState } from 'react';
import { ConnectionProvider, ConnectionType, httpConnectionConfigSchema } from '@tietide/shared';
import type { CreateConnectionBody } from '@/api/connections';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';

export interface HttpConnectionModalProps {
  onClose: () => void;
  onCreate: (body: CreateConnectionBody) => Promise<void> | void;
}

type AuthType = 'bearer' | 'apiKey' | 'basic';

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 text-sm text-text-primary',
  'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

const AUTH_OPTIONS: ReadonlyArray<{ value: AuthType; label: string }> = [
  { value: 'bearer', label: 'Bearer token' },
  { value: 'apiKey', label: 'API key (header)' },
  { value: 'basic', label: 'Basic auth' },
];

export function HttpConnectionModal({ onClose, onCreate }: HttpConnectionModalProps): JSX.Element {
  const nameId = useId();
  const authTypeId = useId();
  const tokenId = useId();
  const headerNameId = useId();
  const apiKeyId = useId();
  const usernameId = useId();
  const passwordId = useId();

  const [name, setName] = useState('My HTTP');
  const [authType, setAuthType] = useState<AuthType>('bearer');
  const [token, setToken] = useState('');
  const [headerName, setHeaderName] = useState('X-Api-Key');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildConfig = (): Record<string, unknown> => {
    switch (authType) {
      case 'bearer':
        return { authType, token };
      case 'apiKey':
        return { authType, headerName, apiKey };
      case 'basic':
        return { authType, username, password };
      default:
        return { authType };
    }
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmedName = name.trim();
    const nameOk = trimmedName.length > 0 && trimmedName.length <= 100;
    setNameError(nameOk ? null : 'Name is required');

    const parsed = httpConnectionConfigSchema.safeParse(buildConfig());
    if (!parsed.success) {
      setConfigError(parsed.error.issues[0]?.message ?? 'Invalid credentials');
      return;
    }
    setConfigError(null);
    if (!nameOk) return;

    setSubmitting(true);
    try {
      await onCreate({
        provider: ConnectionProvider.HTTP,
        type: ConnectionType.CUSTOM,
        name: trimmedName,
        config: parsed.data as Record<string, unknown>,
      });
    } catch {
      // Parent toasts the error.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal titleId="http-modal-title" ariaLabel="Connect HTTP" onClose={onClose}>
      <h2 id="http-modal-title" className="mb-1 text-lg font-semibold text-text-primary">
        Connect HTTP
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        Store reusable auth for the HTTP Request node. Credentials are encrypted at rest with
        libsodium and never leave the server in plain text.
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

        <div>
          <label htmlFor={authTypeId} className={labelClasses}>
            Authentication method
          </label>
          <select
            id={authTypeId}
            value={authType}
            onChange={(e) => {
              setAuthType(e.target.value as AuthType);
              setConfigError(null);
            }}
            className={inputClasses}
          >
            {AUTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {authType === 'bearer' && (
          <div>
            <label htmlFor={tokenId} className={labelClasses}>
              Token
            </label>
            <input
              id={tokenId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOi… (sent as Authorization: Bearer …)"
              className={inputClasses}
            />
          </div>
        )}

        {authType === 'apiKey' && (
          <>
            <div>
              <label htmlFor={headerNameId} className={labelClasses}>
                Header name
              </label>
              <input
                id={headerNameId}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                placeholder="X-Api-Key"
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor={apiKeyId} className={labelClasses}>
                API key
              </label>
              <input
                id={apiKeyId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={inputClasses}
              />
            </div>
          </>
        )}

        {authType === 'basic' && (
          <>
            <div>
              <label htmlFor={usernameId} className={labelClasses}>
                Username
              </label>
              <input
                id={usernameId}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor={passwordId} className={labelClasses}>
                Password
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClasses}
              />
            </div>
          </>
        )}

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
