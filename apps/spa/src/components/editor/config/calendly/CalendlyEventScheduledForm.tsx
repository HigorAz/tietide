import { calendlyEventScheduledConfigSchema, CALENDLY_TRIGGER_EVENT_TYPES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'select',
    key: 'scope',
    label: 'Subscription scope',
    required: true,
    options: [
      { value: 'user', label: 'user' },
      { value: 'organization', label: 'organization' },
    ],
  },
  { kind: 'pill', key: 'userUri', label: 'User URI (when scope=user)' },
  { kind: 'pill', key: 'organizationUri', label: 'Organization URI (when scope=organization)' },
  {
    kind: 'select',
    key: 'eventType',
    label: 'Event type filter',
    options: CALENDLY_TRIGGER_EVENT_TYPES.map((s) => ({ value: s, label: s })),
  },
];

export function CalendlyEventScheduledForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="calendly-event-scheduled-form"
      provider="calendly"
      providerLabel="Calendly"
      schema={calendlyEventScheduledConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
