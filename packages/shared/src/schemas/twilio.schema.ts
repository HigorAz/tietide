import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// E.164: leading "+", country code, then 7–14 digits. Twilio requires E.164 for SMS "to".
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const e164 = z
  .string()
  .regex(E164_REGEX, { message: 'must be an E.164 phone number (e.g. +14155551212)' });

// WhatsApp numbers are E.164 prefixed with "whatsapp:". Twilio sandbox uses
// whatsapp:+14155238886 as the "from" address.
export const WHATSAPP_NUMBER_REGEX = /^whatsapp:\+[1-9]\d{7,14}$/;
const whatsappNumber = z
  .string()
  .regex(WHATSAPP_NUMBER_REGEX, { message: 'must be in form whatsapp:+E164' });

export const twilioSendSmsConfigSchema = z.object({
  connectionId,
  from: e164,
  to: e164,
  body: z.string().min(1).max(1600),
  mockOnDryRun,
});
export type TwilioSendSmsConfig = z.infer<typeof twilioSendSmsConfigSchema>;

// ContentSid is the approved WhatsApp template SID (HX…). ContentVariables maps
// template placeholder index ("1", "2", …) to runtime values. Twilio docs use
// hex but we accept alphanumeric + dashes/underscores so test fixtures don't
// match the AC/HX/PN secret-scanning patterns enforced on hosting platforms.
const TWILIO_CONTENT_SID_REGEX = /^HX[A-Za-z0-9_-]{32}$/;

export const twilioSendWhatsAppConfigSchema = z.object({
  connectionId,
  from: whatsappNumber,
  to: whatsappNumber,
  contentSid: z.string().regex(TWILIO_CONTENT_SID_REGEX, {
    message: 'contentSid must be a Twilio HX… template SID',
  }),
  contentVariables: z.record(z.string(), z.string().max(1024)).optional(),
  mockOnDryRun,
});
export type TwilioSendWhatsAppConfig = z.infer<typeof twilioSendWhatsAppConfigSchema>;

// Read / manage actions (S15 messaging pack).

// Message SIDs are SM… (SMS) or MM… (MMS) followed by 32 chars.
const TWILIO_MESSAGE_SID_REGEX = /^(SM|MM)[A-Za-z0-9_-]{32}$/;

export const twilioGetMessageConfigSchema = z.object({
  connectionId,
  messageSid: z.string().regex(TWILIO_MESSAGE_SID_REGEX, {
    message: 'messageSid must be a Twilio SM…/MM… SID',
  }),
});
export type TwilioGetMessageConfig = z.infer<typeof twilioGetMessageConfigSchema>;

export const twilioListMessagesConfigSchema = z.object({
  connectionId,
  to: e164.optional(),
  from: e164.optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
});
export type TwilioListMessagesConfig = z.infer<typeof twilioListMessagesConfigSchema>;

// A call needs an instruction source: either a TwiML URL Twilio will fetch, or
// inline TwiML. Exactly one is required (refine).
export const twilioMakeCallConfigSchema = z
  .object({
    connectionId,
    from: e164,
    to: e164,
    url: z.string().url().max(2000).optional(),
    twiml: z.string().min(1).max(4000).optional(),
    mockOnDryRun,
  })
  .refine((v) => (v.url ? !v.twiml : !!v.twiml), {
    message: 'provide exactly one of url or twiml',
  });
export type TwilioMakeCallConfig = z.infer<typeof twilioMakeCallConfigSchema>;

// Trigger config — Twilio inbound message webhook attached to a Twilio phone number.
// phoneNumberSid is Twilio's PN… SID for the IncomingPhoneNumber resource we'll
// update to point its sms_url at our /v1/provider-webhooks/twilio/<id> endpoint.
const TWILIO_PHONE_NUMBER_SID_REGEX = /^PN[A-Za-z0-9_-]{32}$/;

export const twilioSmsReceivedConfigSchema = z.object({
  connectionId,
  phoneNumberSid: z.string().regex(TWILIO_PHONE_NUMBER_SID_REGEX, {
    message: 'phoneNumberSid must be a Twilio PN… SID',
  }),
});
export type TwilioSmsReceivedConfig = z.infer<typeof twilioSmsReceivedConfigSchema>;
