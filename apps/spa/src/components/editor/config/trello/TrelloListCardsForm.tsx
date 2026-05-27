import { trelloListCardsConfigSchema, TRELLO_LIST_CARDS_SOURCES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'select',
    key: 'source',
    label: 'Source',
    required: true,
    options: TRELLO_LIST_CARDS_SOURCES.map((s) => ({ value: s, label: s })),
  },
  {
    kind: 'pill',
    key: 'containerId',
    label: 'Board or list ID',
    required: true,
    placeholder: '24-char hex Trello id',
  },
];

export function TrelloListCardsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-list-cards-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloListCardsConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
