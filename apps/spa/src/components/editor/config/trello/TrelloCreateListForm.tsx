import { trelloCreateListConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'boardId',
    label: 'Board ID',
    required: true,
    placeholder: '24-char hex Trello id',
  },
  { kind: 'pill', key: 'name', label: 'List name', required: true },
  {
    kind: 'select',
    key: 'pos',
    label: 'Position',
    options: [
      { value: 'top', label: 'top' },
      { value: 'bottom', label: 'bottom' },
    ],
  },
];

export function TrelloCreateListForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-create-list-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloCreateListConfigSchema}
      fields={FIELDS}
    />
  );
}
