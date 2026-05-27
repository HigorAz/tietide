import { mailchimpGetSubscriberConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'listId', label: 'Audience (List) ID', required: true },
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
];

export function MailchimpGetSubscriberForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-get-subscriber-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpGetSubscriberConfigSchema}
      fields={FIELDS}
    />
  );
}
