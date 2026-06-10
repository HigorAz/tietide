import { linearSearchIssuesConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'term', label: 'Search term (title contains)', required: true },
  {
    kind: 'pill',
    key: 'teamId',
    label: 'Team ID (UUID)',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  { kind: 'number', key: 'first', label: 'Max results (1–50)' },
];

export function LinearSearchIssuesForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="linear-search-issues-form"
      provider="linear"
      providerLabel="Linear"
      schema={linearSearchIssuesConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
