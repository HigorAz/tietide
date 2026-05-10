import { trelloCardChangedConfigSchema, TRELLO_CARD_EVENT_TYPES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'modelId',
    label: 'Board / list / card ID',
    required: true,
    placeholder: '24-char hex Trello id',
  },
  {
    kind: 'select',
    key: 'eventType',
    label: 'Event type filter',
    options: TRELLO_CARD_EVENT_TYPES.map((s) => ({ value: s, label: s })),
  },
];

export function TrelloCardChangedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-card-changed-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloCardChangedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
