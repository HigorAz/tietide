import { mailchimpUnsubscribeConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'listId', label: 'Audience (List) ID', required: true },
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
];

export function MailchimpUnsubscribeForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-unsubscribe-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpUnsubscribeConfigSchema}
      fields={FIELDS}
    />
  );
}
