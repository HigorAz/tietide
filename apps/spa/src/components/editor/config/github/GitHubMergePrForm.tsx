import { githubMergePrConfigSchema, GITHUB_MERGE_METHODS } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'owner', label: 'Owner', required: true, placeholder: 'octocat' },
  { kind: 'pill', key: 'repo', label: 'Repository', required: true, placeholder: 'hello-world' },
  { kind: 'number', key: 'pullNumber', label: 'Pull request number', required: true },
  {
    kind: 'select',
    key: 'mergeMethod',
    label: 'Merge method',
    options: GITHUB_MERGE_METHODS.map((m) => ({ value: m, label: m })),
  },
  { kind: 'pill', key: 'commitTitle', label: 'Commit title' },
];

export function GitHubMergePrForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="github-merge-pr-form"
      provider="github"
      providerLabel="GitHub"
      schema={githubMergePrConfigSchema}
      fields={FIELDS}
    />
  );
}
