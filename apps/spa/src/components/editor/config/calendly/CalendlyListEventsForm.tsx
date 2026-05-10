import { calendlyListEventsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'userUri',
    label: 'User URI',
    placeholder: 'https://api.calendly.com/users/<uuid>',
    required: true,
  },
  {
    kind: 'select',
    key: 'status',
    label: 'Status',
    options: [
      { value: 'active', label: 'active' },
      { value: 'canceled', label: 'canceled' },
    ],
  },
  { kind: 'number', key: 'count', label: 'Count (1–100)', placeholder: '20' },
];

export function CalendlyListEventsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="calendly-list-events-form"
      provider="calendly"
      providerLabel="Calendly"
      schema={calendlyListEventsConfigSchema}
      fields={FIELDS}
    />
  );
}
