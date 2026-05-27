import { calendlyListInviteesConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'eventUuid', label: 'Event UUID', required: true },
  { kind: 'number', key: 'count', label: 'Count (1–100)', placeholder: '20' },
  {
    kind: 'select',
    key: 'status',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'canceled', label: 'Canceled' },
    ],
  },
];

export function CalendlyListInviteesForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="calendly-list-invitees-form"
      provider="calendly"
      providerLabel="Calendly"
      schema={calendlyListInviteesConfigSchema}
      fields={FIELDS}
    />
  );
}
