import { useMemo } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import {
  ConnectionType,
  PROVIDER_CONFIG_SCHEMAS,
  type ConnectionProvider as ConnectionProviderType,
  type ProviderConfigMap,
} from '@tietide/shared';
import type { CreateConnectionBody } from '@/api/connections';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import { getProviderLabel } from './providerCatalog';

export interface ApiKeyConnectionModalProps {
  provider: ConnectionProviderType;
  onClose: () => void;
  onCreate: (body: CreateConnectionBody) => Promise<void> | void;
}

interface FieldMeta {
  name: string;
  label: string;
  isOptional: boolean;
  isSecret: boolean;
}

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 text-sm text-text-primary',
  'placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

const labelClasses = 'mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary';

const humanize = (name: string): string =>
  name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const buildFieldMetas = (provider: ConnectionProviderType): FieldMeta[] => {
  const schema = PROVIDER_CONFIG_SCHEMAS[provider as keyof ProviderConfigMap] as
    | ZodObject<ZodRawShape>
    | undefined;
  if (!schema) return [];
  return Object.entries(schema.shape).map(([name, def]) => ({
    name,
    label: humanize(name),
    isOptional: (def as ZodTypeAny).isOptional(),
    isSecret: /key|secret|token|password/i.test(name),
  }));
};

const buildFormSchema = (provider: ConnectionProviderType): ZodObject<ZodRawShape> => {
  const config = PROVIDER_CONFIG_SCHEMAS[
    provider as keyof ProviderConfigMap
  ] as ZodObject<ZodRawShape>;
  return z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, '100 characters max'),
    config,
  });
};

export function ApiKeyConnectionModal({
  provider,
  onClose,
  onCreate,
}: ApiKeyConnectionModalProps): JSX.Element {
  const fieldMetas = useMemo(() => buildFieldMetas(provider), [provider]);
  const formSchema = useMemo(() => buildFormSchema(provider), [provider]);

  const defaultValues: DefaultValues<{ name: string; config: Record<string, string> }> = {
    name: `My ${getProviderLabel(provider)}`,
    config: Object.fromEntries(fieldMetas.map((f) => [f.name, ''])),
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string; config: Record<string, string> }>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    // Strip empty optional fields so the API doesn't see "" for fields the user left blank.
    const config: Record<string, unknown> = {};
    for (const meta of fieldMetas) {
      const v = values.config[meta.name];
      if (typeof v === 'string' && v.length > 0) {
        config[meta.name] = v;
      }
    }
    try {
      await onCreate({
        provider,
        type: ConnectionType.API_KEY,
        name: values.name.trim(),
        config,
      });
    } catch {
      // Parent toasts the error.
    }
  });

  const configErrors = errors.config as
    | Record<string, { message?: string } | undefined>
    | undefined;

  return (
    <Modal
      titleId="api-key-modal-title"
      ariaLabel={`Connect ${getProviderLabel(provider)}`}
      onClose={onClose}
    >
      <h2 id="api-key-modal-title" className="mb-1 text-lg font-semibold text-text-primary">
        Connect {getProviderLabel(provider)}
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        Your credentials are encrypted at rest with libsodium and never leave the server in plain
        text.
      </p>

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor="api-key-modal-name" className={labelClasses}>
            Connection name
          </label>
          <input
            id="api-key-modal-name"
            type="text"
            autoFocus
            className={inputClasses}
            aria-invalid={errors.name ? 'true' : 'false'}
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-error" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        {fieldMetas.map((meta) => {
          const fieldId = `api-key-modal-${meta.name}`;
          const error = configErrors?.[meta.name];
          return (
            <div key={meta.name}>
              <label htmlFor={fieldId} className={labelClasses}>
                {meta.label}{' '}
                {meta.isOptional && <span className="text-text-muted">(optional)</span>}
              </label>
              <input
                id={fieldId}
                type={meta.isSecret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                className={inputClasses}
                aria-invalid={error ? 'true' : 'false'}
                {...register(`config.${meta.name}` as `config.${string}`)}
              />
              {error?.message && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {error.message}
                </p>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
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
            disabled={isSubmitting}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {isSubmitting && <Spinner size="sm" label="Connecting" />}
            <span>{isSubmitting ? 'Connecting…' : 'Connect'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
