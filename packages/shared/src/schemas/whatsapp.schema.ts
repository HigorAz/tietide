import { z } from 'zod';

const connectionId = z.string().uuid();
const phoneNumberId = z.string().min(1);
// E.164-ish recipient. Kept permissive (data pills allowed) — just non-empty.
const to = z.string().min(1).max(32);

/**
 * WhatsApp: Send Message. Sends a free-form text message from a WhatsApp Business
 * number (Cloud API: POST /{phone-number-id}/messages). Note WhatsApp only allows
 * free-form text within the 24h customer-service window; outside it you must use
 * a pre-approved template (see whatsappSendTemplateConfigSchema).
 */
export const whatsappSendMessageConfigSchema = z.object({
  connectionId,
  phoneNumberId,
  to,
  message: z.string().min(1).max(4096),
  mockOnDryRun: z.boolean().optional(),
});
export type WhatsappSendMessageConfig = z.infer<typeof whatsappSendMessageConfigSchema>;

/**
 * WhatsApp: Send Template. Sends a pre-approved message template — the only way
 * to initiate a conversation outside the 24h window. `bodyParams` fill the
 * template's {{1}}, {{2}}, … body placeholders in order.
 */
export const whatsappSendTemplateConfigSchema = z.object({
  connectionId,
  phoneNumberId,
  to,
  templateName: z.string().min(1).max(512),
  languageCode: z.string().min(2).max(10),
  bodyParams: z.array(z.string().max(1024)).max(20).optional(),
  mockOnDryRun: z.boolean().optional(),
});
export type WhatsappSendTemplateConfig = z.infer<typeof whatsappSendTemplateConfigSchema>;
