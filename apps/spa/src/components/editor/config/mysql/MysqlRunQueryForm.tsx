import { mysqlRunQueryConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'query',
    label: 'Parameterized SQL (?, ?, …)',
    placeholder: 'SELECT * FROM users WHERE id = ?',
    required: true,
    multiline: true,
  },
  { kind: 'number', key: 'rowLimit', label: 'Row limit (1–10 000)', placeholder: '1000' },
];

export function MysqlRunQueryForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="mysql-run-query-form"
      provider="mysql"
      providerLabel="MySQL"
      schema={mysqlRunQueryConfigSchema}
      fields={FIELDS}
      helpBanner={
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          Use ? placeholders. Inline interpolation, multi-statements, and comments are rejected as a
          defence against SQL injection.
        </p>
      }
    />
  );
}
