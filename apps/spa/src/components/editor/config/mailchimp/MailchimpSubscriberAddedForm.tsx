import {
  mailchimpSubscriberAddedConfigSchema,
  MAILCHIMP_TRIGGER_EVENT_TYPES,
} from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'listId', label: 'List ID', placeholder: 'abc1234567', required: true },
  {
    kind: 'select',
    key: 'eventType',
    label: 'Event type filter',
    options: MAILCHIMP_TRIGGER_EVENT_TYPES.map((s) => ({ value: s, label: s })),
  },
];

export function MailchimpSubscriberAddedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-subscriber-added-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpSubscriberAddedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
