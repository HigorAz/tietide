import { calendlyGetEventConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'eventUuid', label: 'Event UUID', required: true },
];

export function CalendlyGetEventForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="calendly-get-event-form"
      provider="calendly"
      providerLabel="Calendly"
      schema={calendlyGetEventConfigSchema}
      fields={FIELDS}
    />
  );
}
