import { mailchimpAddSubscriberConfigSchema, MAILCHIMP_SUBSCRIBER_STATUSES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'listId', label: 'List ID', placeholder: 'abc1234567', required: true },
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
  {
    kind: 'select',
    key: 'status',
    label: 'Status',
    required: true,
    options: MAILCHIMP_SUBSCRIBER_STATUSES.map((s) => ({ value: s, label: s })),
  },
];

export function MailchimpAddSubscriberForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-add-subscriber-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpAddSubscriberConfigSchema}
      fields={FIELDS}
    />
  );
}
