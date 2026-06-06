import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowFacts } from './workflow-facts';

export class AiServiceUnavailableError extends Error {
  constructor(message = 'AI service unavailable') {
    super(message);
    this.name = 'AiServiceUnavailableError';
  }
}

export interface GenerateDocsParams {
  workflowId: string;
  workflowName: string;
  definition: Record<string, unknown>;
  // Deterministic ground-truth facts extracted from the definition. Optional so
  // the AI service still works (with its own fallback extraction) if absent.
  facts?: WorkflowFacts;
}

/**
 * Documentation sections (camelCase, as stored in JSONB + returned to the SPA).
 * The current model is a Diátaxis/runbook hybrid; the legacy keys are optional
 * and only present when reading documentation generated before the redesign.
 */
export interface DocumentationSections {
  overview: string;
  prerequisites: string;
  trigger: string;
  walkthrough: string;
  dataFlow: string;
  decisions: string;
  errorHandling: string;
  // Legacy (pre-redesign) keys — present only on old cached rows.
  objective?: string;
  triggers?: string;
  actions?: string;
}

export interface GenerateDocsResult {
  documentation: string;
  sections: DocumentationSections;
  model: string;
}

interface AiServiceRawResponse {
  workflow_id?: unknown;
  workflow_name?: unknown;
  documentation?: unknown;
  model?: unknown;
  sections?: Record<string, unknown>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly internalToken: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000') ?? 'http://localhost:8000'
    ).replace(/\/+$/, '');
    // Doc generation is serialized in the AI service and now produces richer,
    // longer output, so a queued request can legitimately take minutes. Keep the
    // API's client timeout comfortably above the AI service's own (300s) Ollama
    // timeout so a slow-but-healthy generation isn't aborted as a false 503.
    this.timeoutMs = Number(this.config.get<string>('AI_SERVICE_TIMEOUT_MS', '300000'));
    // Shared secret the AI service requires once configured. Empty in local dev
    // (the AI service then skips the check).
    this.internalToken = this.config.get<string>('INTERNAL_AI_TOKEN', '') ?? '';
  }

  async generateDocs(params: GenerateDocsParams): Promise<GenerateDocsResult> {
    const url = `${this.baseUrl}/generate-docs`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.internalToken ? { 'X-Internal-Token': this.internalToken } : {}),
        },
        body: JSON.stringify({
          workflow_id: params.workflowId,
          workflow_name: params.workflowName,
          definition: params.definition,
          ...(params.facts ? { facts: params.facts } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.warn(`AI service request failed: ${(err as Error).message}`);
      throw new AiServiceUnavailableError('AI service unreachable');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.warn(`AI service returned ${response.status} for ${params.workflowId}`);
      throw new AiServiceUnavailableError(`AI service returned status ${response.status}`);
    }

    const raw = (await response.json()) as AiServiceRawResponse;
    return this.parseResponse(raw);
  }

  private parseResponse(raw: AiServiceRawResponse): GenerateDocsResult {
    const documentation = raw.documentation;
    const model = raw.model;
    const sections = raw.sections;

    if (typeof documentation !== 'string' || typeof model !== 'string' || !sections) {
      throw new AiServiceUnavailableError('AI service returned an unparseable response');
    }

    // Tolerant, key-by-key mapping (snake_case → camelCase) with empty-string
    // defaults. This keeps the API resilient across deploy skew between the new
    // (overview/prerequisites/trigger/error_handling) and legacy
    // (objective/triggers/actions) section models — neither set throws.
    const str = (key: string): string =>
      typeof sections[key] === 'string' ? (sections[key] as string) : '';
    const optional = (key: string): { [k: string]: string } =>
      typeof sections[key] === 'string' ? { [key]: sections[key] as string } : {};

    return {
      documentation,
      sections: {
        overview: str('overview'),
        prerequisites: str('prerequisites'),
        trigger: str('trigger'),
        walkthrough: str('walkthrough'),
        dataFlow: str('data_flow'),
        decisions: str('decisions'),
        errorHandling: str('error_handling'),
        // Pass legacy keys through untouched so old responses still render.
        ...optional('objective'),
        ...optional('triggers'),
        ...optional('actions'),
      },
      model,
    };
  }
}
