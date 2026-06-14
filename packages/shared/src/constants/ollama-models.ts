// Curated Ollama model catalogs — the fallback/suggestion lists shown in the model
// dropdowns when the server's installed models can't be fetched (or to surface models
// worth pulling). The picker merges these with the live `/api/tags` list; a model not
// in either can still be typed via the "custom" option. `hint`/`sizeGb` drive the
// option labels so users can see the trade-offs (faster vs more capable). Sizes are the
// approximate default-quant download sizes and are advisory only.

export interface OllamaModelOption {
  /** The exact tag passed to Ollama, e.g. `qwen2.5:7b`. */
  name: string;
  /** Human label for the option. */
  label: string;
  /** Short trade-off note shown next to the label. */
  hint: string;
  /** Approximate download size in GB (advisory). */
  sizeGb: number;
  /** Marks the suggested default for most users. */
  recommended?: boolean;
}

// Text/chat generation models (also the connection-level default). Ordered fastest →
// most capable so the dropdown reads as a speed/capability ramp.
export const OLLAMA_TEXT_MODELS: readonly OllamaModelOption[] = [
  { name: 'llama3.2:1b', label: 'Llama 3.2 1B', hint: 'fastest, tiny', sizeGb: 1.3 },
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', hint: 'fast, lightweight', sizeGb: 2 },
  { name: 'qwen2.5:3b', label: 'Qwen2.5 3B', hint: 'fast, good instructions', sizeGb: 1.9 },
  {
    name: 'qwen2.5:7b',
    label: 'Qwen2.5 7B',
    hint: 'recommended — best JSON & instructions',
    sizeGb: 4.7,
    recommended: true,
  },
  { name: 'llama3.1:8b', label: 'Llama 3.1 8B', hint: 'balanced, solid all-rounder', sizeGb: 4.7 },
  { name: 'mistral:7b', label: 'Mistral 7B', hint: 'balanced', sizeGb: 4.1 },
  { name: 'gemma2:9b', label: 'Gemma 2 9B', hint: 'more capable, heavier', sizeGb: 5.4 },
  { name: 'qwen2.5:14b', label: 'Qwen2.5 14B', hint: 'most capable, needs more RAM', sizeGb: 9 },
] as const;

// Embedding models (for ollama-embeddings). These return vectors, not text, so they are
// a distinct curated list from the chat models above.
export const OLLAMA_EMBEDDING_MODELS: readonly OllamaModelOption[] = [
  {
    name: 'nomic-embed-text',
    label: 'Nomic Embed Text',
    hint: 'recommended — general embeddings',
    sizeGb: 0.3,
    recommended: true,
  },
  {
    name: 'mxbai-embed-large',
    label: 'mxbai Embed Large',
    hint: 'higher quality, larger',
    sizeGb: 0.7,
  },
  { name: 'all-minilm', label: 'all-MiniLM', hint: 'tiny, fast', sizeGb: 0.05 },
  { name: 'bge-m3', label: 'BGE-M3', hint: 'multilingual', sizeGb: 1.2 },
] as const;

// Shape returned by the API model-listing endpoint. `reachable` is false when the
// server couldn't be probed, signalling the UI to show the curated list instead.
export interface OllamaModelsResult {
  models: string[];
  reachable: boolean;
}
