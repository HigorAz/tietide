import { instagramCommentAddedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'mediaId',
    label: 'Media ID',
    required: true,
    help: 'The Instagram media (post) id whose comments to watch.',
  },
  { kind: 'number', key: 'intervalSeconds', label: 'Poll interval (seconds)' },
];

export function InstagramCommentAddedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="instagram-comment-added-form"
      provider="instagram"
      providerLabel="Instagram"
      schema={instagramCommentAddedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
