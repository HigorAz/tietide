import { useId } from 'react';
import { hubspotUpdateContactConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const stringifyJson = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return '';
  }
};

const tryParseJson = (s: string): { ok: true; value: unknown } | { ok: false } => {
  if (!s.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
};

export function HubspotUpdateContactForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const contactId = asString(config.contactId);
  const propsText = stringifyJson(config.properties);
  const contactFieldId = useId();
  const propsFieldId = useId();

  const propsParse = tryParseJson(propsText);
  const parsed = hubspotUpdateContactConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    contactId,
    properties: propsParse.ok ? (propsParse.value ?? {}) : {},
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const contactIssue = issueFor('contactId');

  return (
    <div data-testid="hubspot-update-contact-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>HubSpot connection</span>
        <ConnectionPicker
          provider="hubspot"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="hubspot-update-contact-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a HubSpot connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contactFieldId} className={labelClass}>
          Contact ID
        </label>
        <DataPillInput
          id={contactFieldId}
          nodeId={nodeId}
          value={contactId}
          placeholder="501"
          aria-invalid={contactIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { contactId: next })}
        />
        {contactIssue && (
          <p
            data-testid="hubspot-update-contact-contact-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {contactIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={propsFieldId} className={labelClass}>
          Properties (JSON)
        </label>
        <DataPillInput
          id={propsFieldId}
          nodeId={nodeId}
          value={propsText}
          placeholder='{"lifecyclestage": "customer"}'
          onChange={(next) => {
            const parsedNext = tryParseJson(next);
            updateNodeConfig(nodeId, { properties: parsedNext.ok ? parsedNext.value : next });
          }}
        />
      </div>
    </div>
  );
}
