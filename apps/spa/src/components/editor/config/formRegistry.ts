import type { ComponentType } from 'react';
import { NodeType } from '@tietide/shared';
import { CodeForm } from './CodeForm';
import { ConditionalForm } from './ConditionalForm';
import { CronForm } from './CronForm';
import { HttpRequestForm } from './HttpRequestForm';
import { IteratorForm } from './IteratorForm';
import { ManualTriggerForm } from './ManualTriggerForm';
import { ReturnForm } from './ReturnForm';
import { SubworkflowForm } from './SubworkflowForm';
import { WebhookForm } from './WebhookForm';
import { GmailSendForm } from './google/GmailSendForm';
import { GmailSearchForm } from './google/GmailSearchForm';
import { DriveCreateForm } from './google/DriveCreateForm';
import { DriveListForm } from './google/DriveListForm';
import { SheetsAppendForm } from './google/SheetsAppendForm';
import { SheetsReadForm } from './google/SheetsReadForm';
import { DocsCreateForm } from './google/DocsCreateForm';
import { CalendarCreateForm } from './google/CalendarCreateForm';
import { SheetsRowAddedForm } from './google/SheetsRowAddedForm';
import { GmailMessageReceivedForm } from './google/GmailMessageReceivedForm';
import { GmailLabelAddedForm } from './google/GmailLabelAddedForm';
import { DriveFileAddedForm } from './google/DriveFileAddedForm';
import { CalendarEventCreatedForm } from './google/CalendarEventCreatedForm';
import { OutlookSendForm } from './microsoft/OutlookSendForm';
import { OutlookSearchForm } from './microsoft/OutlookSearchForm';
import { ExcelAppendForm } from './microsoft/ExcelAppendForm';
import { ExcelReadForm } from './microsoft/ExcelReadForm';
import { OneDriveCreateForm } from './microsoft/OneDriveCreateForm';
import { OutlookMessageReceivedForm } from './microsoft/OutlookMessageReceivedForm';
import { OutlookMessageFlaggedForm } from './microsoft/OutlookMessageFlaggedForm';
import { OneDriveFileAddedForm } from './microsoft/OneDriveFileAddedForm';
import { ExcelRowAddedForm } from './microsoft/ExcelRowAddedForm';
import { SlackPostMessageForm } from './slack/SlackPostMessageForm';
import { SlackPostToChannelForm } from './slack/SlackPostToChannelForm';
import { SlackUploadFileForm } from './slack/SlackUploadFileForm';
import { SlackMessageReceivedForm } from './slack/SlackMessageReceivedForm';
import { SlackReactionAddedForm } from './slack/SlackReactionAddedForm';
import { DiscordPostWebhookForm } from './discord/DiscordPostWebhookForm';
import { DiscordMessageReceivedForm } from './discord/DiscordMessageReceivedForm';
import { TwilioSendSmsForm } from './twilio/TwilioSendSmsForm';
import { TwilioSendWhatsAppForm } from './twilio/TwilioSendWhatsAppForm';
import { TwilioSmsReceivedForm } from './twilio/TwilioSmsReceivedForm';
import { TelegramSendMessageForm } from './telegram/TelegramSendMessageForm';
import { TelegramMessageReceivedForm } from './telegram/TelegramMessageReceivedForm';

export interface NodeConfigFormProps {
  nodeId: string;
  config: Record<string, unknown>;
}

export const FORM_REGISTRY: Partial<Record<NodeType, ComponentType<NodeConfigFormProps>>> = {
  [NodeType.MANUAL_TRIGGER]: ManualTriggerForm,
  [NodeType.CRON_TRIGGER]: CronForm,
  [NodeType.WEBHOOK_TRIGGER]: WebhookForm,
  [NodeType.HTTP_REQUEST]: HttpRequestForm,
  [NodeType.CODE]: CodeForm,
  [NodeType.CONDITIONAL]: ConditionalForm,
  [NodeType.ITERATOR]: IteratorForm,
  [NodeType.SUBWORKFLOW]: SubworkflowForm,
  [NodeType.RETURN]: ReturnForm,
  [NodeType.GMAIL_SEND]: GmailSendForm,
  [NodeType.GMAIL_SEARCH]: GmailSearchForm,
  [NodeType.DRIVE_CREATE]: DriveCreateForm,
  [NodeType.DRIVE_LIST]: DriveListForm,
  [NodeType.SHEETS_APPEND]: SheetsAppendForm,
  [NodeType.SHEETS_READ]: SheetsReadForm,
  [NodeType.DOCS_CREATE]: DocsCreateForm,
  [NodeType.CALENDAR_CREATE]: CalendarCreateForm,
  [NodeType.SHEETS_ROW_ADDED]: SheetsRowAddedForm,
  [NodeType.GMAIL_MESSAGE_RECEIVED]: GmailMessageReceivedForm,
  [NodeType.GMAIL_LABEL_ADDED]: GmailLabelAddedForm,
  [NodeType.DRIVE_FILE_ADDED]: DriveFileAddedForm,
  [NodeType.CALENDAR_EVENT_CREATED]: CalendarEventCreatedForm,
  [NodeType.OUTLOOK_SEND]: OutlookSendForm,
  [NodeType.OUTLOOK_SEARCH]: OutlookSearchForm,
  [NodeType.EXCEL_APPEND]: ExcelAppendForm,
  [NodeType.EXCEL_READ]: ExcelReadForm,
  [NodeType.ONEDRIVE_CREATE]: OneDriveCreateForm,
  [NodeType.OUTLOOK_MESSAGE_RECEIVED]: OutlookMessageReceivedForm,
  [NodeType.OUTLOOK_MESSAGE_FLAGGED]: OutlookMessageFlaggedForm,
  [NodeType.ONEDRIVE_FILE_ADDED]: OneDriveFileAddedForm,
  [NodeType.EXCEL_ROW_ADDED]: ExcelRowAddedForm,
  [NodeType.SLACK_POST_MESSAGE]: SlackPostMessageForm,
  [NodeType.SLACK_POST_TO_CHANNEL]: SlackPostToChannelForm,
  [NodeType.SLACK_UPLOAD_FILE]: SlackUploadFileForm,
  [NodeType.SLACK_MESSAGE_RECEIVED]: SlackMessageReceivedForm,
  [NodeType.SLACK_REACTION_ADDED]: SlackReactionAddedForm,
  [NodeType.DISCORD_POST_WEBHOOK]: DiscordPostWebhookForm,
  [NodeType.DISCORD_MESSAGE_RECEIVED]: DiscordMessageReceivedForm,
  [NodeType.TWILIO_SEND_SMS]: TwilioSendSmsForm,
  [NodeType.TWILIO_SEND_WHATSAPP]: TwilioSendWhatsAppForm,
  [NodeType.TWILIO_SMS_RECEIVED]: TwilioSmsReceivedForm,
  [NodeType.TELEGRAM_SEND_MESSAGE]: TelegramSendMessageForm,
  [NodeType.TELEGRAM_MESSAGE_RECEIVED]: TelegramMessageReceivedForm,
};
