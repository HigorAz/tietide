import { linearGetIssueConfigSchema } from '@tietide/shared';
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
];

export function LinearGetIssueForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="linear-get-issue-form"
      provider="linear"
      providerLabel="Linear"
      schema={linearGetIssueConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
