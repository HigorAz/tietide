import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
}

export interface DocumentationSections {
  objective: string;
  walkthrough: string;
  triggers: string;
  actions: string;
  dataFlow: string;
  decisions: string;
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
  sections?: {
    objective?: unknown;
    walkthrough?: unknown;
    triggers?: unknown;
    actions?: unknown;
    data_flow?: unknown;
    decisions?: unknown;
  };
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

    const { objective, walkthrough, triggers, actions, data_flow: dataFlow, decisions } = sections;

    if (
      typeof objective !== 'string' ||
      typeof triggers !== 'string' ||
      typeof actions !== 'string' ||
      typeof dataFlow !== 'string' ||
      typeof decisions !== 'string'
    ) {
      throw new AiServiceUnavailableError('AI service returned an unparseable response');
    }

    return {
      documentation,
      sections: {
        objective,
        // Tolerate AI services predating the walkthrough section so the API
        // stays forward/backward compatible across deploys.
        walkthrough: typeof walkthrough === 'string' ? walkthrough : '',
        triggers,
        actions,
        dataFlow,
        decisions,
      },
      model,
    };
  }
}
