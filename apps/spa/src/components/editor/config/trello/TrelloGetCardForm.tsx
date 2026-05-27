import { trelloGetCardConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'cardId',
    label: 'Card ID',
    required: true,
    placeholder: '24-char hex Trello id',
  },
];

export function TrelloGetCardForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-get-card-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloGetCardConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
