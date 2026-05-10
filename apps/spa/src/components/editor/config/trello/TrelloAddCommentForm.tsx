import { trelloAddCommentConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'cardId',
    label: 'Card ID',
    placeholder: '24-char hex Trello id',
    required: true,
  },
  {
    kind: 'pill',
    key: 'text',
    label: 'Comment text',
    placeholder: 'Looks great! @member',
    required: true,
    multiline: true,
  },
];

export function TrelloAddCommentForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="trello-add-comment-form"
      provider="trello"
      providerLabel="Trello"
      schema={trelloAddCommentConfigSchema}
      fields={FIELDS}
    />
  );
}
