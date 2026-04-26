import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService, AiServiceUnavailableError } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              if (key === 'AI_SERVICE_URL') return 'http://ai-service.test';
              return fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('generateDocs', () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    };

    it('should POST to AI service and return parsed result on success', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          workflow_id: 'wf-1',
          workflow_name: 'Demo',
          documentation: '# Demo\nGenerated text',
          sections: {
            objective: 'obj',
            triggers: 'trig',
            actions: 'act',
            data_flow: 'flow',
            decisions: 'dec',
          },
          model: 'llama3.1:8b',
        }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await service.generateDocs({
        workflowId: 'wf-1',
        workflowName: 'Demo',
        definition,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://ai-service.test/generate-docs');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body as string)).toEqual({
        workflow_id: 'wf-1',
        workflow_name: 'Demo',
        definition,
      });
      expect(result).toEqual({
        documentation: '# Demo\nGenerated text',
        sections: {
          objective: 'obj',
          triggers: 'trig',
          actions: 'act',
          dataFlow: 'flow',
          decisions: 'dec',
        },
        model: 'llama3.1:8b',
      });
    });

    it('should throw AiServiceUnavailableError when fetch rejects', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

      await expect(
        service.generateDocs({ workflowId: 'wf-1', workflowName: 'Demo', definition }),
      ).rejects.toBeInstanceOf(AiServiceUnavailableError);
    });

    it('should throw AiServiceUnavailableError on 5xx responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'AI service temporarily unavailable' }),
      }) as unknown as typeof fetch;

      await expect(
        service.generateDocs({ workflowId: 'wf-1', workflowName: 'Demo', definition }),
      ).rejects.toBeInstanceOf(AiServiceUnavailableError);
    });

    it('should throw AiServiceUnavailableError when response shape is invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ something: 'unexpected' }),
      }) as unknown as typeof fetch;

      await expect(
        service.generateDocs({ workflowId: 'wf-1', workflowName: 'Demo', definition }),
      ).rejects.toBeInstanceOf(AiServiceUnavailableError);
    });
  });
});
