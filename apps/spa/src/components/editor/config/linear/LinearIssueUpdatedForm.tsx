import { linearIssueUpdatedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'teamId',
    label: 'Team ID (UUID, optional filter)',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  { kind: 'number', key: 'intervalSeconds', label: 'Poll interval (seconds)' },
];

export function LinearIssueUpdatedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="linear-issue-updated-form"
      provider="linear"
      providerLabel="Linear"
      schema={linearIssueUpdatedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
