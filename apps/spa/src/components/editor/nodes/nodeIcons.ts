import {
  Box,
  Calendar,
  Clock,
  Code2,
  CornerDownLeft,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Mail,
  Repeat2,
  Sheet,
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
  [NodeType.GMAIL_SEND]: Mail,
  [NodeType.GMAIL_SEARCH]: Mail,
  [NodeType.DRIVE_CREATE]: HardDrive,
  [NodeType.DRIVE_LIST]: HardDrive,
  [NodeType.SHEETS_APPEND]: Sheet,
  [NodeType.SHEETS_READ]: Sheet,
  [NodeType.DOCS_CREATE]: FileText,
  [NodeType.CALENDAR_CREATE]: Calendar,
};

export const DEFAULT_NODE_ICON: LucideIcon = Box;

export const getNodeIcon = (nodeType: NodeType | string): LucideIcon =>
  NODE_ICONS[nodeType as NodeType] ?? DEFAULT_NODE_ICON;
