import { calendlyCancelEventConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'eventUuid', label: 'Event UUID', required: true },
  { kind: 'text', key: 'reason', label: 'Cancellation reason', multiline: true },
];

export function CalendlyCancelEventForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="calendly-cancel-event-form"
      provider="calendly"
      providerLabel="Calendly"
      schema={calendlyCancelEventConfigSchema}
      fields={FIELDS}
    />
  );
}
