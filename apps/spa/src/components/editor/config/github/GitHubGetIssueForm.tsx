import { githubGetIssueConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'owner', label: 'Owner', required: true, placeholder: 'octocat' },
  { kind: 'pill', key: 'repo', label: 'Repository', required: true, placeholder: 'hello-world' },
  { kind: 'number', key: 'issueNumber', label: 'Issue number', required: true },
];

export function GitHubGetIssueForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="github-get-issue-form"
      provider="github"
      providerLabel="GitHub"
      schema={githubGetIssueConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
