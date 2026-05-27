import { s3DownloadFileConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
  { kind: 'pill', key: 'key', label: 'Key', placeholder: 'path/to/file.txt', required: true },
];

export function S3DownloadFileForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="s3-download-file-form"
      provider="s3"
      providerLabel="S3"
      schema={s3DownloadFileConfigSchema}
      fields={FIELDS}
    />
  );
}
