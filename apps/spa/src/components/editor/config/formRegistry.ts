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
import { GmailGetMessageForm } from './google/GmailGetMessageForm';
import { GmailGetAttachmentForm } from './google/GmailGetAttachmentForm';
import { GmailModifyLabelsForm } from './google/GmailModifyLabelsForm';
import { GmailCreateDraftForm } from './google/GmailCreateDraftForm';
import { DriveCreateForm } from './google/DriveCreateForm';
import { DriveListForm } from './google/DriveListForm';
import { DriveGetFileForm } from './google/DriveGetFileForm';
import { SheetsAppendForm } from './google/SheetsAppendForm';
import { SheetsReadForm } from './google/SheetsReadForm';
import { SheetsFindRowForm } from './google/SheetsFindRowForm';
import { SheetsUpdateRowForm } from './google/SheetsUpdateRowForm';
import { SheetsClearRangeForm } from './google/SheetsClearRangeForm';
import { DocsCreateForm } from './google/DocsCreateForm';
import { DocsGetForm } from './google/DocsGetForm';
import { DocsInsertTextForm } from './google/DocsInsertTextForm';
import { DocsReplaceTextForm } from './google/DocsReplaceTextForm';
import { CalendarCreateForm } from './google/CalendarCreateForm';
import { CalendarListEventsForm } from './google/CalendarListEventsForm';
import { CalendarGetEventForm } from './google/CalendarGetEventForm';
import { SheetsRowAddedForm } from './google/SheetsRowAddedForm';
import { GmailMessageReceivedForm } from './google/GmailMessageReceivedForm';
import { GmailLabelAddedForm } from './google/GmailLabelAddedForm';
import { GmailAttachmentReceivedForm } from './google/GmailAttachmentReceivedForm';
import { DriveFileAddedForm } from './google/DriveFileAddedForm';
import { DriveFileUpdatedForm } from './google/DriveFileUpdatedForm';
import { CalendarEventCreatedForm } from './google/CalendarEventCreatedForm';
import { CalendarEventUpdatedForm } from './google/CalendarEventUpdatedForm';
import { OutlookSendForm } from './microsoft/OutlookSendForm';
import { OutlookSearchForm } from './microsoft/OutlookSearchForm';
import { OutlookGetMessageForm } from './microsoft/OutlookGetMessageForm';
import { OutlookGetAttachmentForm } from './microsoft/OutlookGetAttachmentForm';
import { OutlookUpdateMessageForm } from './microsoft/OutlookUpdateMessageForm';
import { OutlookCreateDraftForm } from './microsoft/OutlookCreateDraftForm';
import { ExcelAppendForm } from './microsoft/ExcelAppendForm';
import { ExcelReadForm } from './microsoft/ExcelReadForm';
import { ExcelFindRowForm } from './microsoft/ExcelFindRowForm';
import { ExcelUpdateRowForm } from './microsoft/ExcelUpdateRowForm';
import { OneDriveCreateForm } from './microsoft/OneDriveCreateForm';
import { OneDriveGetFileForm } from './microsoft/OneDriveGetFileForm';
import { OneDriveListFilesForm } from './microsoft/OneDriveListFilesForm';
import { OutlookMessageReceivedForm } from './microsoft/OutlookMessageReceivedForm';
import { OutlookMessageFlaggedForm } from './microsoft/OutlookMessageFlaggedForm';
import { OutlookMessageWithAttachmentForm } from './microsoft/OutlookMessageWithAttachmentForm';
import { OneDriveFileAddedForm } from './microsoft/OneDriveFileAddedForm';
import { ExcelRowAddedForm } from './microsoft/ExcelRowAddedForm';
import { ExcelRowUpdatedForm } from './microsoft/ExcelRowUpdatedForm';
import { SlackPostMessageForm } from './slack/SlackPostMessageForm';
import { SlackPostToChannelForm } from './slack/SlackPostToChannelForm';
import { SlackUploadFileForm } from './slack/SlackUploadFileForm';
import { SlackMessageReceivedForm } from './slack/SlackMessageReceivedForm';
import { SlackReactionAddedForm } from './slack/SlackReactionAddedForm';
import { DiscordPostWebhookForm } from './discord/DiscordPostWebhookForm';
import { DiscordReplyToCommandForm } from './discord/DiscordReplyToCommandForm';
import { DiscordMessageReceivedForm } from './discord/DiscordMessageReceivedForm';
import { TwilioSendSmsForm } from './twilio/TwilioSendSmsForm';
import { TwilioSendWhatsAppForm } from './twilio/TwilioSendWhatsAppForm';
import { TwilioSmsReceivedForm } from './twilio/TwilioSmsReceivedForm';
import { TelegramSendMessageForm } from './telegram/TelegramSendMessageForm';
import { TelegramMessageReceivedForm } from './telegram/TelegramMessageReceivedForm';
import { NotionCreatePageForm } from './notion/NotionCreatePageForm';
import { NotionQueryDatabaseForm } from './notion/NotionQueryDatabaseForm';
import { NotionGetPageForm } from './notion/NotionGetPageForm';
import { NotionUpdatePageForm } from './notion/NotionUpdatePageForm';
import { NotionAppendBlocksForm } from './notion/NotionAppendBlocksForm';
import { TrelloCreateCardForm } from './trello/TrelloCreateCardForm';
import { TrelloMoveCardForm } from './trello/TrelloMoveCardForm';
import { AirtableCreateRecordForm } from './airtable/AirtableCreateRecordForm';
import { AirtableUpdateRecordForm } from './airtable/AirtableUpdateRecordForm';
import { AirtableListRecordsForm } from './airtable/AirtableListRecordsForm';
import { LinearCreateIssueForm } from './linear/LinearCreateIssueForm';
import { LinearUpdateIssueStatusForm } from './linear/LinearUpdateIssueStatusForm';
import { GitHubCreateIssueForm } from './github/GitHubCreateIssueForm';
import { GitHubCommentIssueForm } from './github/GitHubCommentIssueForm';
import { GitHubCreatePrForm } from './github/GitHubCreatePrForm';
import { ClaudeMessagesForm } from './anthropic/ClaudeMessagesForm';
import { OpenAIChatCompletionForm } from './openai/OpenAIChatCompletionForm';
import { OllamaGenerateForm } from './ollama/OllamaGenerateForm';
import { HubspotCreateContactForm } from './hubspot/HubspotCreateContactForm';
import { HubspotCreateDealForm } from './hubspot/HubspotCreateDealForm';
import { HubspotContactChangedForm } from './hubspot/HubspotContactChangedForm';
import { StripeCreateCustomerForm } from './stripe/StripeCreateCustomerForm';
import { StripeListChargesForm } from './stripe/StripeListChargesForm';
import { StripeEventReceivedForm } from './stripe/StripeEventReceivedForm';
import { MailchimpAddSubscriberForm } from './mailchimp/MailchimpAddSubscriberForm';
import { MailchimpSendCampaignForm } from './mailchimp/MailchimpSendCampaignForm';
import { MailchimpSubscriberAddedForm } from './mailchimp/MailchimpSubscriberAddedForm';
import { CalendlyListEventsForm } from './calendly/CalendlyListEventsForm';
import { CalendlyEventScheduledForm } from './calendly/CalendlyEventScheduledForm';
import { PostgresRunQueryForm } from './postgres/PostgresRunQueryForm';
import { MysqlRunQueryForm } from './mysql/MysqlRunQueryForm';
import { S3UploadFileForm } from './s3/S3UploadFileForm';
import { TrelloAddCommentForm } from './trello/TrelloAddCommentForm';
import { TrelloUpdateCardForm } from './trello/TrelloUpdateCardForm';
import { TrelloCardChangedForm } from './trello/TrelloCardChangedForm';

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
  [NodeType.GMAIL_GET_MESSAGE]: GmailGetMessageForm,
  [NodeType.GMAIL_GET_ATTACHMENT]: GmailGetAttachmentForm,
  [NodeType.GMAIL_MODIFY_LABELS]: GmailModifyLabelsForm,
  [NodeType.GMAIL_CREATE_DRAFT]: GmailCreateDraftForm,
  [NodeType.DRIVE_CREATE]: DriveCreateForm,
  [NodeType.DRIVE_LIST]: DriveListForm,
  [NodeType.DRIVE_GET_FILE]: DriveGetFileForm,
  [NodeType.SHEETS_APPEND]: SheetsAppendForm,
  [NodeType.SHEETS_READ]: SheetsReadForm,
  [NodeType.SHEETS_FIND_ROW]: SheetsFindRowForm,
  [NodeType.SHEETS_UPDATE_ROW]: SheetsUpdateRowForm,
  [NodeType.SHEETS_CLEAR_RANGE]: SheetsClearRangeForm,
  [NodeType.DOCS_CREATE]: DocsCreateForm,
  [NodeType.DOCS_GET]: DocsGetForm,
  [NodeType.DOCS_INSERT_TEXT]: DocsInsertTextForm,
  [NodeType.DOCS_REPLACE_TEXT]: DocsReplaceTextForm,
  [NodeType.CALENDAR_CREATE]: CalendarCreateForm,
  [NodeType.CALENDAR_LIST_EVENTS]: CalendarListEventsForm,
  [NodeType.CALENDAR_GET_EVENT]: CalendarGetEventForm,
  [NodeType.SHEETS_ROW_ADDED]: SheetsRowAddedForm,
  [NodeType.GMAIL_MESSAGE_RECEIVED]: GmailMessageReceivedForm,
  [NodeType.GMAIL_LABEL_ADDED]: GmailLabelAddedForm,
  [NodeType.GMAIL_ATTACHMENT_RECEIVED]: GmailAttachmentReceivedForm,
  [NodeType.DRIVE_FILE_ADDED]: DriveFileAddedForm,
  [NodeType.DRIVE_FILE_UPDATED]: DriveFileUpdatedForm,
  [NodeType.CALENDAR_EVENT_CREATED]: CalendarEventCreatedForm,
  [NodeType.CALENDAR_EVENT_UPDATED]: CalendarEventUpdatedForm,
  [NodeType.OUTLOOK_SEND]: OutlookSendForm,
  [NodeType.OUTLOOK_SEARCH]: OutlookSearchForm,
  [NodeType.OUTLOOK_GET_MESSAGE]: OutlookGetMessageForm,
  [NodeType.OUTLOOK_GET_ATTACHMENT]: OutlookGetAttachmentForm,
  [NodeType.OUTLOOK_UPDATE_MESSAGE]: OutlookUpdateMessageForm,
  [NodeType.OUTLOOK_CREATE_DRAFT]: OutlookCreateDraftForm,
  [NodeType.EXCEL_APPEND]: ExcelAppendForm,
  [NodeType.EXCEL_READ]: ExcelReadForm,
  [NodeType.EXCEL_FIND_ROW]: ExcelFindRowForm,
  [NodeType.EXCEL_UPDATE_ROW]: ExcelUpdateRowForm,
  [NodeType.ONEDRIVE_CREATE]: OneDriveCreateForm,
  [NodeType.ONEDRIVE_GET_FILE]: OneDriveGetFileForm,
  [NodeType.ONEDRIVE_LIST_FILES]: OneDriveListFilesForm,
  [NodeType.OUTLOOK_MESSAGE_RECEIVED]: OutlookMessageReceivedForm,
  [NodeType.OUTLOOK_MESSAGE_FLAGGED]: OutlookMessageFlaggedForm,
  [NodeType.OUTLOOK_MESSAGE_WITH_ATTACHMENT]: OutlookMessageWithAttachmentForm,
  [NodeType.ONEDRIVE_FILE_ADDED]: OneDriveFileAddedForm,
  [NodeType.EXCEL_ROW_ADDED]: ExcelRowAddedForm,
  [NodeType.EXCEL_ROW_UPDATED]: ExcelRowUpdatedForm,
  [NodeType.SLACK_POST_MESSAGE]: SlackPostMessageForm,
  [NodeType.SLACK_POST_TO_CHANNEL]: SlackPostToChannelForm,
  [NodeType.SLACK_UPLOAD_FILE]: SlackUploadFileForm,
  [NodeType.SLACK_MESSAGE_RECEIVED]: SlackMessageReceivedForm,
  [NodeType.SLACK_REACTION_ADDED]: SlackReactionAddedForm,
  [NodeType.DISCORD_POST_WEBHOOK]: DiscordPostWebhookForm,
  [NodeType.DISCORD_REPLY_TO_COMMAND]: DiscordReplyToCommandForm,
  [NodeType.DISCORD_MESSAGE_RECEIVED]: DiscordMessageReceivedForm,
  [NodeType.TWILIO_SEND_SMS]: TwilioSendSmsForm,
  [NodeType.TWILIO_SEND_WHATSAPP]: TwilioSendWhatsAppForm,
  [NodeType.TWILIO_SMS_RECEIVED]: TwilioSmsReceivedForm,
  [NodeType.TELEGRAM_SEND_MESSAGE]: TelegramSendMessageForm,
  [NodeType.TELEGRAM_MESSAGE_RECEIVED]: TelegramMessageReceivedForm,
  [NodeType.NOTION_CREATE_PAGE]: NotionCreatePageForm,
  [NodeType.NOTION_QUERY_DATABASE]: NotionQueryDatabaseForm,
  [NodeType.NOTION_GET_PAGE]: NotionGetPageForm,
  [NodeType.NOTION_UPDATE_PAGE]: NotionUpdatePageForm,
  [NodeType.NOTION_APPEND_BLOCKS]: NotionAppendBlocksForm,
  [NodeType.TRELLO_CREATE_CARD]: TrelloCreateCardForm,
  [NodeType.TRELLO_MOVE_CARD]: TrelloMoveCardForm,
  [NodeType.AIRTABLE_CREATE_RECORD]: AirtableCreateRecordForm,
  [NodeType.AIRTABLE_UPDATE_RECORD]: AirtableUpdateRecordForm,
  [NodeType.AIRTABLE_LIST_RECORDS]: AirtableListRecordsForm,
  [NodeType.LINEAR_CREATE_ISSUE]: LinearCreateIssueForm,
  [NodeType.LINEAR_UPDATE_ISSUE_STATUS]: LinearUpdateIssueStatusForm,
  [NodeType.GITHUB_CREATE_ISSUE]: GitHubCreateIssueForm,
  [NodeType.GITHUB_COMMENT_ISSUE]: GitHubCommentIssueForm,
  [NodeType.GITHUB_CREATE_PR]: GitHubCreatePrForm,
  [NodeType.CLAUDE_MESSAGES]: ClaudeMessagesForm,
  [NodeType.OPENAI_CHAT_COMPLETION]: OpenAIChatCompletionForm,
  [NodeType.OLLAMA_GENERATE]: OllamaGenerateForm,
  [NodeType.HUBSPOT_CREATE_CONTACT]: HubspotCreateContactForm,
  [NodeType.HUBSPOT_CREATE_DEAL]: HubspotCreateDealForm,
  [NodeType.HUBSPOT_CONTACT_CHANGED]: HubspotContactChangedForm,
  [NodeType.STRIPE_CREATE_CUSTOMER]: StripeCreateCustomerForm,
  [NodeType.STRIPE_LIST_CHARGES]: StripeListChargesForm,
  [NodeType.STRIPE_EVENT_RECEIVED]: StripeEventReceivedForm,
  [NodeType.MAILCHIMP_ADD_SUBSCRIBER]: MailchimpAddSubscriberForm,
  [NodeType.MAILCHIMP_SEND_CAMPAIGN]: MailchimpSendCampaignForm,
  [NodeType.MAILCHIMP_SUBSCRIBER_ADDED]: MailchimpSubscriberAddedForm,
  [NodeType.CALENDLY_LIST_EVENTS]: CalendlyListEventsForm,
  [NodeType.CALENDLY_EVENT_SCHEDULED]: CalendlyEventScheduledForm,
  [NodeType.POSTGRES_RUN_QUERY]: PostgresRunQueryForm,
  [NodeType.MYSQL_RUN_QUERY]: MysqlRunQueryForm,
  [NodeType.S3_UPLOAD_FILE]: S3UploadFileForm,
  [NodeType.TRELLO_ADD_COMMENT]: TrelloAddCommentForm,
  [NodeType.TRELLO_UPDATE_CARD]: TrelloUpdateCardForm,
  [NodeType.TRELLO_CARD_CHANGED]: TrelloCardChangedForm,
};
