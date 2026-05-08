import {
  Box,
  Clock,
  Code2,
  CornerDownLeft,
  GitBranch,
  Globe,
  Repeat2,
  StickyNote,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { NodeType } from '@tietide/shared';

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  [NodeType.MANUAL_TRIGGER]: Zap,
  [NodeType.CRON_TRIGGER]: Clock,
  [NodeType.WEBHOOK_TRIGGER]: Webhook,
  [NodeType.HTTP_REQUEST]: Globe,
  [NodeType.CODE]: Code2,
  [NodeType.CONDITIONAL]: GitBranch,
  [NodeType.ITERATOR]: Repeat2,
  [NodeType.SUBWORKFLOW]: Workflow,
  [NodeType.RETURN]: CornerDownLeft,
  [NodeType.STICKY]: StickyNote,
};

export const DEFAULT_NODE_ICON: LucideIcon = Box;

export const getNodeIcon = (nodeType: NodeType | string): LucideIcon =>
  NODE_ICONS[nodeType as NodeType] ?? DEFAULT_NODE_ICON;
