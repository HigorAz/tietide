import { postgresRunQueryConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'query',
    label: 'Parameterized SQL ($1, $2, …)',
    placeholder: 'SELECT * FROM users WHERE id = $1',
    required: true,
    multiline: true,
  },
  { kind: 'number', key: 'rowLimit', label: 'Row limit (1–10 000)', placeholder: '1000' },
];

export function PostgresRunQueryForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="postgres-run-query-form"
      provider="postgres"
      providerLabel="Postgres"
      schema={postgresRunQueryConfigSchema}
      fields={FIELDS}
      helpBanner={
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          Use $1, $2, … placeholders. Inline interpolation, multi-statements, and comments are
          rejected as a defence against SQL injection.
        </p>
      }
    />
  );
}
