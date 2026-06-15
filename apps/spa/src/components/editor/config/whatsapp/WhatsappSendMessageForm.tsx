import { whatsappSendMessageConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'phoneNumberId',
    label: 'Phone number ID',
    required: true,
    help: 'The WhatsApp Business sending number’s resource id (from the Meta dashboard).',
  },
  {
    kind: 'pill',
    key: 'to',
    label: 'Recipient (E.164)',
    required: true,
    help: 'Destination number in E.164 form, e.g. 15551230000.',
  },
  { kind: 'pill', key: 'message', label: 'Message', required: true },
];

export function WhatsappSendMessageForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="whatsapp-send-message-form"
      provider="whatsapp"
      providerLabel="WhatsApp"
      schema={whatsappSendMessageConfigSchema}
      fields={FIELDS}
    />
  );
}
