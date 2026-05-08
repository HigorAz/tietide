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
};
