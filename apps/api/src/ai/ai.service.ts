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

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('AI_SERVICE_URL', 'http://localhost:8000') ?? 'http://localhost:8000'
    ).replace(/\/+$/, '');
    this.timeoutMs = Number(this.config.get<string>('AI_SERVICE_TIMEOUT_MS', '120000'));
  }

  async generateDocs(params: GenerateDocsParams): Promise<GenerateDocsResult> {
    const url = `${this.baseUrl}/generate-docs`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const { objective, triggers, actions, data_flow: dataFlow, decisions } = sections;

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
      sections: { objective, triggers, actions, dataFlow, decisions },
      model,
    };
  }
}
