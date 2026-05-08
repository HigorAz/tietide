import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { NodeResizer, type NodeProps } from 'reactflow';
import {
  STICKY_COLORS,
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  STICKY_MAX_TEXT_LENGTH,
  STICKY_MIN_HEIGHT,
  STICKY_MIN_WIDTH,
  type StickyColor,
} from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useEditorStore } from '@/stores/editorStore';
import type { CustomNodeData } from './CustomNode.types';

const COLOR_BG_CLASS: Record<StickyColor, string> = {
  yellow: 'bg-[#FEF08A]',
  pink: 'bg-[#FBCFE8]',
  blue: 'bg-[#BFDBFE]',
  green: 'bg-[#BBF7D0]',
};

const SWATCH_BG_CLASS: Record<StickyColor, string> = {
  yellow: 'bg-[#FEF08A]',
  pink: 'bg-[#FBCFE8]',
  blue: 'bg-[#BFDBFE]',
  green: 'bg-[#BBF7D0]',
};

const isStickyColor = (value: unknown): value is StickyColor =>
  typeof value === 'string' && (STICKY_COLORS as readonly string[]).includes(value);

const readNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function StickyNodeImpl({ id, data, selected }: NodeProps<CustomNodeData>) {
  const config = data.config ?? {};
  const text = typeof config.text === 'string' ? config.text : '';
  const color: StickyColor = isStickyColor(config.color) ? config.color : 'yellow';
  const width = readNumber(config.width, STICKY_DEFAULT_WIDTH);
  const height = readNumber(config.height, STICKY_DEFAULT_HEIGHT);

  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [text, isEditing]);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const beginEdit = (): void => {
    setDraft(text);
    setIsEditing(true);
  };

  const commit = (next: string): void => {
    if (next !== text) updateNodeConfig(id, { text: next });
    setIsEditing(false);
  };

  const cancel = (): void => {
    setDraft(text);
    setIsEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const onSwatchClick = (e: MouseEvent<HTMLButtonElement>, next: StickyColor): void => {
    e.stopPropagation();
    if (next !== color) updateNodeConfig(id, { color: next });
  };

  const onResizeEnd = (_event: unknown, params: { width: number; height: number }): void => {
    if (params.width !== width || params.height !== height) {
      updateNodeConfig(id, { width: params.width, height: params.height });
    }
  };

  const wrapperStyle: CSSProperties = { width: `${width}px`, height: `${height}px` };

  return (
    <div
      data-testid="sticky-node"
      data-selected={selected ? 'true' : 'false'}
      data-color={color}
      style={wrapperStyle}
      className={cn(
        'relative rounded-md shadow-md text-text-primary p-3 select-none',
        COLOR_BG_CLASS[color],
        selected && 'ring-2 ring-accent-teal',
      )}
      onDoubleClick={beginEdit}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={STICKY_MIN_WIDTH}
        minHeight={STICKY_MIN_HEIGHT}
        onResizeEnd={onResizeEnd}
        lineClassName="!border-accent-teal"
        handleClassName="!bg-accent-teal !border-0"
      />

      {isEditing ? (
        <textarea
          ref={textareaRef}
          data-testid="sticky-node-textarea"
          value={draft}
          maxLength={STICKY_MAX_TEXT_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={onKeyDown}
          className="w-full h-full resize-none bg-transparent border-0 outline-0 text-sm leading-snug text-slate-900"
        />
      ) : (
        <div
          data-testid="sticky-node-text"
          className="w-full h-full whitespace-pre-wrap break-words text-sm leading-snug text-slate-900 overflow-hidden"
        >
          {text || <span className="text-slate-500 italic">Double-click to edit</span>}
        </div>
      )}

      {selected && (
        <div
          data-testid="sticky-node-color-picker"
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex gap-1 rounded-md bg-bg-deep-blue/90 p-1 shadow-md"
        >
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`sticky-node-color-${c}`}
              aria-label={`Set color ${c}`}
              onClick={(e) => onSwatchClick(e, c)}
              className={cn(
                'w-4 h-4 rounded-full border border-white/30',
                SWATCH_BG_CLASS[c],
                color === c && 'ring-2 ring-accent-teal',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const StickyNode = memo(StickyNodeImpl);
StickyNode.displayName = 'StickyNode';
