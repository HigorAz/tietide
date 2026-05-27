import { Module, type OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { ConnectionsModule } from '../connections/connections.module';
import { ProviderTriggerRegistry } from './provider-trigger.registry';
import { ActivationService, PUBLIC_API_URL_TOKEN } from './activation.service';
import { ProviderSubscriptionsController } from './provider-subscriptions.controller';
import { ProviderSubscriptionsService } from './provider-subscriptions.service';
import {
  StripeEventReceivedTrigger,
  STRIPE_EVENT_RECEIVED_TYPE,
} from './triggers/stripe-event-received.trigger';
import { StripeClientFactory } from './triggers/stripe-client.factory';
import { DriveFileAddedTrigger, DRIVE_FILE_ADDED_TYPE } from './triggers/drive-file-added.trigger';
import {
  DriveFileUpdatedTrigger,
  DRIVE_FILE_UPDATED_TYPE,
} from './triggers/drive-file-updated.trigger';
import {
  GmailMessageReceivedTrigger,
  GMAIL_MESSAGE_RECEIVED_TYPE,
} from './triggers/gmail-message-received.trigger';
import { GoogleClientFactory } from './triggers/google/google-client.factory';
import { MicrosoftGraphFactory } from './triggers/microsoft/microsoft-graph.factory';
import {
  OutlookMessageReceivedTrigger,
  OUTLOOK_MESSAGE_RECEIVED_TYPE,
} from './triggers/outlook-message-received.trigger';
import {
  OutlookMessageFlaggedTrigger,
  OUTLOOK_MESSAGE_FLAGGED_TYPE,
} from './triggers/outlook-message-flagged.trigger';
import {
  OnedriveFileAddedTrigger,
  ONEDRIVE_FILE_ADDED_TYPE,
} from './triggers/onedrive-file-added.trigger';
import { TwilioApiFactory } from './triggers/twilio/twilio-client.factory';
import {
  TwilioSmsReceivedTrigger,
  TWILIO_SMS_RECEIVED_TYPE,
} from './triggers/twilio/twilio-sms-received.trigger';
import { TelegramApiFactory } from './triggers/telegram/telegram-client.factory';
import {
  TelegramMessageReceivedTrigger,
  TELEGRAM_MESSAGE_RECEIVED_TYPE,
} from './triggers/telegram/telegram-message-received.trigger';
import {
  SlackMessageReceivedTrigger,
  SLACK_MESSAGE_RECEIVED_TYPE,
} from './triggers/slack/slack-message-received.trigger';
import {
  SlackReactionAddedTrigger,
  SLACK_REACTION_ADDED_TYPE,
} from './triggers/slack/slack-reaction-added.trigger';
import { DiscordBotClientFactory } from './triggers/discord/discord-bot-client.factory';
import {
  DiscordMessageReceivedTrigger,
  DISCORD_MESSAGE_RECEIVED_TYPE,
} from './triggers/discord/discord-message-received.trigger';
import {
  HubspotContactChangedTrigger,
  HUBSPOT_CONTACT_CHANGED_TYPE,
} from './triggers/hubspot/hubspot-contact-changed.trigger';
import {
  MailchimpSubscriberAddedTrigger,
  MAILCHIMP_SUBSCRIBER_ADDED_TYPE,
} from './triggers/mailchimp/mailchimp-subscriber-added.trigger';
import {
  CalendlyEventScheduledTrigger,
  CALENDLY_EVENT_SCHEDULED_TYPE,
} from './triggers/calendly/calendly-event-scheduled.trigger';
import {
  TrelloCardChangedTrigger,
  TRELLO_CARD_CHANGED_TYPE,
} from './triggers/trello/trello-card-changed.trigger';
import { RENEWAL_QUEUE_NAME } from './renewal/subscription-renewer.constants';
import { SubscriptionRenewerProcessor } from './renewal/subscription-renewer.processor';
import { SubscriptionRenewerBootstrap } from './renewal/subscription-renewer-bootstrap.service';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    ConnectionsModule,
    BullModule.registerQueue({ name: RENEWAL_QUEUE_NAME }),
  ],
  controllers: [ProviderSubscriptionsController],
  providers: [
    ProviderTriggerRegistry,
    ProviderSubscriptionsService,
    StripeClientFactory,
    StripeEventReceivedTrigger,
    GoogleClientFactory,
    DriveFileAddedTrigger,
    DriveFileUpdatedTrigger,
    GmailMessageReceivedTrigger,
    MicrosoftGraphFactory,
    OutlookMessageReceivedTrigger,
    OutlookMessageFlaggedTrigger,
    OnedriveFileAddedTrigger,
    TwilioApiFactory,
    TwilioSmsReceivedTrigger,
    TelegramApiFactory,
    TelegramMessageReceivedTrigger,
    SlackMessageReceivedTrigger,
    SlackReactionAddedTrigger,
    DiscordBotClientFactory,
    DiscordMessageReceivedTrigger,
    HubspotContactChangedTrigger,
    MailchimpSubscriberAddedTrigger,
    CalendlyEventScheduledTrigger,
    TrelloCardChangedTrigger,
    ActivationService,
    SubscriptionRenewerProcessor,
    SubscriptionRenewerBootstrap,
    {
      provide: PUBLIC_API_URL_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): string | null =>
        config.get<string>('PUBLIC_API_URL') ?? null,
    },
  ],
  exports: [ProviderTriggerRegistry, ActivationService],
})
export class ProviderTriggerModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderTriggerRegistry,
    private readonly stripeTrigger: StripeEventReceivedTrigger,
    private readonly driveFileAdded: DriveFileAddedTrigger,
    private readonly driveFileUpdated: DriveFileUpdatedTrigger,
    private readonly gmailMessageReceived: GmailMessageReceivedTrigger,
    private readonly outlookMessageReceived: OutlookMessageReceivedTrigger,
    private readonly outlookMessageFlagged: OutlookMessageFlaggedTrigger,
    private readonly onedriveFileAdded: OnedriveFileAddedTrigger,
    private readonly twilioSmsReceived: TwilioSmsReceivedTrigger,
    private readonly telegramMessageReceived: TelegramMessageReceivedTrigger,
    private readonly slackMessageReceived: SlackMessageReceivedTrigger,
    private readonly slackReactionAdded: SlackReactionAddedTrigger,
    private readonly discordMessageReceived: DiscordMessageReceivedTrigger,
    private readonly hubspotContactChanged: HubspotContactChangedTrigger,
    private readonly mailchimpSubscriberAdded: MailchimpSubscriberAddedTrigger,
    private readonly calendlyEventScheduled: CalendlyEventScheduledTrigger,
    private readonly trelloCardChanged: TrelloCardChangedTrigger,
  ) {}

  onModuleInit(): void {
    this.registry.register(STRIPE_EVENT_RECEIVED_TYPE, this.stripeTrigger);
    this.registry.register(DRIVE_FILE_ADDED_TYPE, this.driveFileAdded);
    this.registry.register(DRIVE_FILE_UPDATED_TYPE, this.driveFileUpdated);
    this.registry.register(GMAIL_MESSAGE_RECEIVED_TYPE, this.gmailMessageReceived);
    this.registry.register(OUTLOOK_MESSAGE_RECEIVED_TYPE, this.outlookMessageReceived);
    this.registry.register(OUTLOOK_MESSAGE_FLAGGED_TYPE, this.outlookMessageFlagged);
    this.registry.register(ONEDRIVE_FILE_ADDED_TYPE, this.onedriveFileAdded);
    this.registry.register(TWILIO_SMS_RECEIVED_TYPE, this.twilioSmsReceived);
    this.registry.register(TELEGRAM_MESSAGE_RECEIVED_TYPE, this.telegramMessageReceived);
    this.registry.register(SLACK_MESSAGE_RECEIVED_TYPE, this.slackMessageReceived);
    this.registry.register(SLACK_REACTION_ADDED_TYPE, this.slackReactionAdded);
    this.registry.register(DISCORD_MESSAGE_RECEIVED_TYPE, this.discordMessageReceived);
    this.registry.register(HUBSPOT_CONTACT_CHANGED_TYPE, this.hubspotContactChanged);
    this.registry.register(MAILCHIMP_SUBSCRIBER_ADDED_TYPE, this.mailchimpSubscriberAdded);
    this.registry.register(CALENDLY_EVENT_SCHEDULED_TYPE, this.calendlyEventScheduled);
    this.registry.register(TRELLO_CARD_CHANGED_TYPE, this.trelloCardChanged);
  }
}
