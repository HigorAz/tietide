import type { ComponentType } from 'react';
import { NodeType } from '@tietide/shared';
import { CodeForm } from './CodeForm';
import { ConditionalForm } from './ConditionalForm';
import { CronForm } from './CronForm';
import { HttpRequestForm } from './HttpRequestForm';
import { ManualTriggerForm } from './ManualTriggerForm';
import { WebhookForm } from './WebhookForm';

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
};
