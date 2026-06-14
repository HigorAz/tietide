import { z } from 'zod';

const connectionId = z.string().uuid();

/**
 * Instagram: Publish Photo. Publishes a single image post to an Instagram
 * Business account via the Meta Graph API (create media container → publish).
 * `imageUrl` must resolve to a PUBLIC image URL (e.g. a Pollinations URL from
 * the AI: Generate Image node) — Meta fetches it server-side. Values may be data
 * pills, so they are validated as non-empty strings rather than strict URLs.
 */
export const instagramPublishPhotoConfigSchema = z.object({
  connectionId,
  igUserId: z.string().min(1),
  imageUrl: z.string().min(1),
  caption: z.string().max(2200).optional(),
  mockOnDryRun: z.boolean().optional(),
});
export type InstagramPublishPhotoConfig = z.infer<typeof instagramPublishPhotoConfigSchema>;
