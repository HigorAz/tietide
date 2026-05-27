import { githubListIssuesConfigSchema, GITHUB_ISSUE_STATES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'owner', label: 'Owner', required: true, placeholder: 'octocat' },
  { kind: 'pill', key: 'repo', label: 'Repository', required: true, placeholder: 'hello-world' },
  {
    kind: 'select',
    key: 'state',
    label: 'State',
    options: GITHUB_ISSUE_STATES.map((s) => ({ value: s, label: s })),
  },
  { kind: 'number', key: 'perPage', label: 'Per page (1–100)' },
];

export function GitHubListIssuesForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="github-list-issues-form"
      provider="github"
      providerLabel="GitHub"
      schema={githubListIssuesConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
