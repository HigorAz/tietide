import { mailchimpSendCampaignConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'campaignId', label: 'Campaign ID', placeholder: 'abc123', required: true },
];

export function MailchimpSendCampaignForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-send-campaign-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpSendCampaignConfigSchema}
      fields={FIELDS}
    />
  );
}
