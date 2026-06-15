import { instagramPublishPhotoConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'igUserId',
    label: 'Instagram Business account ID',
    required: true,
    help: 'The IG Business Account ID to publish to (from your Meta app / Graph API Explorer).',
  },
  {
    kind: 'pill',
    key: 'imageUrl',
    label: 'Image URL',
    required: true,
    help: 'A PUBLIC image URL — e.g. {{ steps.image.imageUrl }} from the AI: Generate Image node.',
  },
  { kind: 'pill', key: 'caption', label: 'Caption' },
];

export function InstagramPublishPhotoForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="instagram-publish-photo-form"
      provider="instagram"
      providerLabel="Instagram"
      schema={instagramPublishPhotoConfigSchema}
      fields={FIELDS}
    />
  );
}
