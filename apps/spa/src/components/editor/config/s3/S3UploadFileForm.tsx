import { s3UploadFileConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  {
    kind: 'pill',
    key: 'key',
    label: 'Object key',
    placeholder: 'reports/2026/q1.csv',
    required: true,
  },
  {
    kind: 'pill',
    key: 'content',
    label: 'Content',
    placeholder: 'plain text or base64 (see encoding below)',
    required: true,
    multiline: true,
  },
  {
    kind: 'select',
    key: 'contentEncoding',
    label: 'Content encoding',
    required: true,
    options: [
      { value: 'utf8', label: 'utf8' },
      { value: 'base64', label: 'base64' },
    ],
  },
  {
    kind: 'text',
    key: 'contentType',
    label: 'Content type',
    placeholder: 'application/octet-stream',
  },
];

export function S3UploadFileForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-upload-file-form"
      provider="s3"
      providerLabel="S3"
      schema={s3UploadFileConfigSchema}
      fields={FIELDS}
    />
  );
}
