import { githubIssueOpenedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'owner', label: 'Owner', required: true, placeholder: 'octocat' },
  { kind: 'pill', key: 'repo', label: 'Repository', required: true, placeholder: 'hello-world' },
];

export function GitHubIssueOpenedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="github-issue-opened-form"
      provider="github"
      providerLabel="GitHub"
      schema={githubIssueOpenedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
