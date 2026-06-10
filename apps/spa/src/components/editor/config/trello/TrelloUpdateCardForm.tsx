import { trelloUpdateCardConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'cardId', label: 'Card ID', required: true },
  { kind: 'pill', key: 'name', label: 'New name' },
  { kind: 'pill', key: 'desc', label: 'New description' },
  { kind: 'pill', key: 'idList', label: 'Move to list (idList)' },
  { kind: 'checkbox', key: 'closed', label: 'Archive (closed)' },
];

export function TrelloUpdateCardForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-update-card-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloUpdateCardConfigSchema}
      fields={FIELDS}
    />
  );
}
