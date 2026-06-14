import { whatsappSendTemplateConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

// `bodyParams` (the template's {{1}}, {{2}}… placeholders) is an array and is not
// expressible in the schema-driven field form; it stays editable via the node's
// raw config. The required fields below cover the common no-parameter case.
const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'phoneNumberId',
    label: 'Phone number ID',
    required: true,
    help: 'The WhatsApp Business sending number’s resource id.',
  },
  { kind: 'pill', key: 'to', label: 'Recipient (E.164)', required: true },
  { kind: 'pill', key: 'templateName', label: 'Template name', required: true },
  {
    kind: 'text',
    key: 'languageCode',
    label: 'Language code',
    required: true,
    placeholder: 'en_US',
  },
];

export function WhatsappSendTemplateForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="whatsapp-send-template-form"
      provider="whatsapp"
      providerLabel="WhatsApp"
      schema={whatsappSendTemplateConfigSchema}
      fields={FIELDS}
    />
  );
}
