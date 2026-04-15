import { Box, Clock, Code2, GitBranch, Globe, Webhook, Zap, type LucideIcon } from 'lucide-react';
import { NodeType } from '@tietide/shared';

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  [NodeType.MANUAL_TRIGGER]: Zap,
  [NodeType.CRON_TRIGGER]: Clock,
  [NodeType.WEBHOOK_TRIGGER]: Webhook,
  [NodeType.HTTP_REQUEST]: Globe,
  [NodeType.CODE]: Code2,
  [NodeType.CONDITIONAL]: GitBranch,
};

export const DEFAULT_NODE_ICON: LucideIcon = Box;

export const getNodeIcon = (nodeType: NodeType | string): LucideIcon =>
  NODE_ICONS[nodeType as NodeType] ?? DEFAULT_NODE_ICON;
