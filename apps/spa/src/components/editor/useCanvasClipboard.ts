import { useCallback, useEffect } from 'react';
import {
  buildClipboardPayload,
  ClipboardFormatError,
  parseClipboardPayload,
  serializeClipboardPayload,
} from '@/lib/clipboard';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';

export interface CanvasClipboard {
  /** Copy the currently-selected nodes to the system clipboard. */
  runCopy: () => Promise<void>;
  /** Read the system clipboard and paste any valid TieTide payload. */
  runPaste: () => Promise<void>;
  /** Apply a pasted-as-text payload; returns an error message or undefined. */
  applyPasteText: (text: string) => string | undefined;
  /** Serialize the current selection for the "Copy as JSON" dialog. */
  buildSelectedJson: () => string;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
};

// True when the user has selected actual page text (not just a canvas node
// "selection"). Without this check the global Ctrl+C handler intercepts every
// copy attempt — including text selections inside the InspectorRunPanel error
// block — and replaces it with the node-copy clipboard payload.
const hasTextSelection = (): boolean => {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (selection === null) return false;
  return selection.toString().length > 0;
};

/**
 * Encapsulates the editor canvas clipboard behavior — copy/paste/delete
 * keyboard shortcuts and the JSON copy/paste helpers used by the context menu.
 * Extracted from Canvas so that component stays under the 300-line budget.
 */
export function useCanvasClipboard(): CanvasClipboard {
  const pasteFromClipboardPayload = useEditorStore((s) => s.pasteFromClipboardPayload);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const showToast = useToastStore((s) => s.show);

  const buildSelectedJson = useCallback((): string => {
    const { nodes: curNodes, edges: curEdges } = useEditorStore.getState();
    const selected = curNodes.filter((n) => n.selected);
    return serializeClipboardPayload(buildClipboardPayload(selected, curEdges));
  }, []);

  const applyPasteText = useCallback(
    (text: string): string | undefined => {
      try {
        const payload = parseClipboardPayload(text);
        const ids = pasteFromClipboardPayload(payload);
        const skipped = payload.nodes.length - ids.length;
        if (skipped > 0) {
          showToast({
            tone: 'warning',
            message: `Skipped ${skipped} trigger node${skipped === 1 ? '' : 's'} — workflow already has a trigger.`,
          });
        }
        if (ids.length > 0) {
          showToast({
            tone: 'success',
            message: `Pasted ${ids.length} node${ids.length === 1 ? '' : 's'}`,
          });
        }
        return undefined;
      } catch (err) {
        if (err instanceof ClipboardFormatError) return err.message;
        return 'Paste failed.';
      }
    },
    [pasteFromClipboardPayload, showToast],
  );

  const runCopy = useCallback(async (): Promise<void> => {
    const { nodes: curNodes, edges: curEdges } = useEditorStore.getState();
    const selected = curNodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const payload = buildClipboardPayload(selected, curEdges);
    try {
      await navigator.clipboard.writeText(serializeClipboardPayload(payload));
    } catch {
      showToast({ tone: 'error', message: 'Could not write to clipboard.' });
    }
  }, [showToast]);

  const runPaste = useCallback(async (): Promise<void> => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      showToast({
        tone: 'error',
        message: "Couldn't read clipboard. Use 'Paste from JSON' instead.",
      });
      return;
    }
    const error = applyPasteText(text);
    if (error) showToast({ tone: 'error', message: error });
  }, [applyPasteText, showToast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === 'c') {
          // Defer to native copy when the user has selected text on the page
          // (e.g. an error message in the InspectorRunPanel). Only hijack
          // Ctrl+C for the node-copy clipboard when no text is selected.
          if (hasTextSelection()) return;
          event.preventDefault();
          void runCopy();
        } else if (key === 'v') {
          event.preventDefault();
          void runPaste();
        }
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const hasSelection = useEditorStore.getState().nodes.some((n) => n.selected === true);
        if (!hasSelection) return;
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runCopy, runPaste, deleteSelected]);

  return { runCopy, runPaste, applyPasteText, buildSelectedJson };
}
