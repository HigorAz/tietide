import { z } from 'zod';

const connectionId = z.string().uuid();
const promptText = z.string().min(1).max(50_000);

// Ollama generate-endpoint config. The connection carries `baseUrl` and a default
// `model`; this schema's optional `model` lets a workflow node target a different
// model on the same Ollama server without creating a second connection.
export const ollamaGenerateConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).optional(),
  prompt: promptText,
  mockOnDryRun: z.boolean().optional(),
});

export type OllamaGenerateConfig = z.infer<typeof ollamaGenerateConfigSchema>;

// --- S15 commerce/data/storage read/update pack (#246): AI enrichment ---

// Ollama embeddings (/api/embeddings). `model` falls back to the connection's
// default when omitted, mirroring ollama-generate.
export const ollamaEmbeddingsConfigSchema = z.object({
  connectionId,
  model: z.string().min(1).max(128).optional(),
  prompt: promptText,
  mockOnDryRun: z.boolean().optional(),
});
export type OllamaEmbeddingsConfig = z.infer<typeof ollamaEmbeddingsConfigSchema>;
