import { whatsappMessageReceivedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm } from '../GenericConnectorForm';

export function WhatsappMessageReceivedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="whatsapp-message-received-form"
      provider="whatsapp"
      providerLabel="WhatsApp"
      schema={whatsappMessageReceivedConfigSchema}
      fields={[]}
      showMockToggle={false}
    />
  );
}
