import { linearAddCommentConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'issueId',
    label: 'Issue ID (UUID)',
    required: true,
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  { kind: 'text', key: 'body', label: 'Comment body', required: true, multiline: true },
];

export function LinearAddCommentForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="linear-add-comment-form"
      provider="linear"
      providerLabel="Linear"
      schema={linearAddCommentConfigSchema}
      fields={FIELDS}
    />
  );
}
