import { s3GetPresignedUrlConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  { kind: 'pill', key: 'key', label: 'Key', placeholder: 'path/to/file.txt', required: true },
  {
    kind: 'select',
    key: 'operation',
    label: 'Operation',
    options: [
      { value: 'get', label: 'GET (download)' },
      { value: 'put', label: 'PUT (upload)' },
    ],
  },
  {
    kind: 'number',
    key: 'expiresIn',
    label: 'Expires in (seconds, max 604800)',
    placeholder: '3600',
  },
  { kind: 'pill', key: 'contentType', label: 'Content type (PUT only)' },
];

export function S3GetPresignedUrlForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-get-presigned-url-form"
      provider="s3"
      providerLabel="S3"
      schema={s3GetPresignedUrlConfigSchema}
      fields={FIELDS}
    />
  );
}
