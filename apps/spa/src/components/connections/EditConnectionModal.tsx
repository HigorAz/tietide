import { useMemo } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import { PROVIDER_CONFIG_SCHEMAS, type ProviderConfigMap } from '@tietide/shared';
import type { ConnectionView } from '@/api/connections';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import { getProviderLabel } from './providerCatalog';

export interface EditConnectionModalProps {
  connection: ConnectionView;
  onClose: () => void;
  onSave: (config: Record<string, unknown>) => Promise<void> | void;
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

// Only object-shaped provider schemas expose `.shape` for field derivation.
// Connections whose schema is a union (e.g. the HTTP auth discriminated union)
// can't be edited via this generic form — revoke + recreate instead.
function getObjectSchema(provider: string): ZodObject<ZodRawShape> | null {
  const schema = PROVIDER_CONFIG_SCHEMAS[provider as keyof ProviderConfigMap] as unknown;
  if (schema && typeof schema === 'object' && 'shape' in (schema as object)) {
    return schema as ZodObject<ZodRawShape>;
  }
  return null;
}

export function EditConnectionModal({
  connection,
  onClose,
  onSave,
}: EditConnectionModalProps): JSX.Element {
  const providerLabel = getProviderLabel(connection.provider);
  const objectSchema = useMemo(() => getObjectSchema(connection.provider), [connection.provider]);

  const fieldMetas: FieldMeta[] = useMemo(() => {
    if (!objectSchema) return [];
    return Object.entries(objectSchema.shape).map(([name, def]) => ({
      name,
      label: humanize(name),
      isOptional: (def as ZodTypeAny).isOptional(),
      isSecret: /key|secret|token|password/i.test(name),
    }));
  }, [objectSchema]);

  const formSchema = useMemo(
    () => z.object({ config: objectSchema ?? z.object({}) }),
    [objectSchema],
  );

  const defaultValues: DefaultValues<{ config: Record<string, string> }> = {
    config: Object.fromEntries(fieldMetas.map((f) => [f.name, ''])),
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ config: Record<string, string> }>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const submit = handleSubmit(async (values) => {
    const config: Record<string, unknown> = {};
    for (const meta of fieldMetas) {
      const v = values.config[meta.name];
      if (typeof v === 'string' && v.length > 0) config[meta.name] = v;
    }
    try {
      await onSave(config);
    } catch {
      // Parent toasts the error.
    }
  });

  const configErrors = errors.config as
    | Record<string, { message?: string } | undefined>
    | undefined;

  return (
    <Modal
      titleId="edit-connection-modal-title"
      ariaLabel={`Edit ${connection.name}`}
      onClose={onClose}
    >
      <h2 id="edit-connection-modal-title" className="mb-1 text-lg font-semibold text-text-primary">
        Edit {connection.name}
      </h2>
      <p className="mb-5 text-sm text-text-secondary">
        Re-enter the {providerLabel} credentials below. For security they are never shown, so all
        fields must be provided again. They are re-encrypted at rest.
      </p>

      {objectSchema === null ? (
        <div className="space-y-4">
          <p className="text-sm text-error" role="alert">
            This connection type can’t be edited from here. Revoke it and create a new one instead.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
                'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {fieldMetas.map((meta) => {
            const fieldId = `edit-connection-${meta.name}`;
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
              {isSubmitting && <Spinner size="sm" label="Saving" />}
              <span>{isSubmitting ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
