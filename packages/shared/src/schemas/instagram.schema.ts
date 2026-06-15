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

/**
 * Instagram: Comment Added trigger. Polls a single media's comments and fires
 * for each new one. `mediaId` is the IG media (post) id to watch.
 */
export const instagramCommentAddedConfigSchema = z.object({
  connectionId,
  mediaId: z.string().min(1),
  intervalSeconds: z.number().int().min(60).max(86_400).optional(),
});
export type InstagramCommentAddedConfig = z.infer<typeof instagramCommentAddedConfigSchema>;
