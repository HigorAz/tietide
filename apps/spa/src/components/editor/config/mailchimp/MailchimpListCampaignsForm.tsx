import { mailchimpListCampaignsConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'number', key: 'count', label: 'Count (1–100)', placeholder: '10' },
  {
    kind: 'select',
    key: 'status',
    label: 'Status',
    options: [
      { value: 'save', label: 'Draft (save)' },
      { value: 'paused', label: 'Paused' },
      { value: 'schedule', label: 'Scheduled' },
      { value: 'sending', label: 'Sending' },
      { value: 'sent', label: 'Sent' },
    ],
  },
];

export function MailchimpListCampaignsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mailchimp-list-campaigns-form"
      provider="mailchimp"
      providerLabel="Mailchimp"
      schema={mailchimpListCampaignsConfigSchema}
      fields={FIELDS}
    />
  );
}
