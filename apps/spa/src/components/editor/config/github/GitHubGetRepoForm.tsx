import { githubGetRepoConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'owner', label: 'Owner', required: true, placeholder: 'octocat' },
  { kind: 'pill', key: 'repo', label: 'Repository', required: true, placeholder: 'hello-world' },
];

export function GitHubGetRepoForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="github-get-repo-form"
      provider="github"
      providerLabel="GitHub"
      schema={githubGetRepoConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
