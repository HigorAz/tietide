import {
  PROVIDER_CONFIG_SCHEMAS,
  anthropicApiKeyConfigSchema,
  googleOAuth2ConfigSchema,
  notionOAuth2ConfigSchema,
  ollamaConfigSchema,
  openAIApiKeyConfigSchema,
  slackOAuth2ConfigSchema,
} from '@tietide/shared';

describe('connection config schemas', () => {
  describe('googleOAuth2ConfigSchema', () => {
    it('should accept a complete payload with refresh token, scope, and tokenType', () => {
      const result = googleOAuth2ConfigSchema.safeParse({
        accessToken: 'ya29.abc',
        refreshToken: '1//refresh',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        tokenType: 'Bearer',
      });
      expect(result.success).toBe(true);
    });

    it('should reject when accessToken is empty', () => {
      const result = googleOAuth2ConfigSchema.safeParse({
        accessToken: '',
        refreshToken: '1//refresh',
        scope: '',
        tokenType: 'Bearer',
      });
      expect(result.success).toBe(false);
    });

    it('should reject when tokenType is missing', () => {
      const result = googleOAuth2ConfigSchema.safeParse({
        accessToken: 'ya29.abc',
        refreshToken: '1//refresh',
        scope: 'drive',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('slackOAuth2ConfigSchema', () => {
    it('should accept a complete payload', () => {
      const result = slackOAuth2ConfigSchema.safeParse({
        accessToken: 'xoxb-abc',
        teamId: 'T0001',
        botUserId: 'U0001',
        scope: 'chat:write',
      });
      expect(result.success).toBe(true);
    });

    it('should reject when teamId is missing', () => {
      const result = slackOAuth2ConfigSchema.safeParse({
        accessToken: 'xoxb-abc',
        botUserId: 'U0001',
        scope: 'chat:write',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('notionOAuth2ConfigSchema', () => {
    it('should accept the minimal payload (accessToken + workspaceId)', () => {
      const result = notionOAuth2ConfigSchema.safeParse({
        accessToken: 'ntn_abc',
        workspaceId: 'ws_1',
      });
      expect(result.success).toBe(true);
    });

    it('should reject when workspaceId is missing', () => {
      const result = notionOAuth2ConfigSchema.safeParse({
        accessToken: 'ntn_abc',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('openAIApiKeyConfigSchema', () => {
    it('should accept a key without an organization', () => {
      const result = openAIApiKeyConfigSchema.safeParse({ apiKey: 'sk-abc' });
      expect(result.success).toBe(true);
    });

    it('should accept a key with an organization', () => {
      const result = openAIApiKeyConfigSchema.safeParse({
        apiKey: 'sk-abc',
        organization: 'org-1',
      });
      expect(result.success).toBe(true);
    });

    it('should reject an empty apiKey', () => {
      const result = openAIApiKeyConfigSchema.safeParse({ apiKey: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('anthropicApiKeyConfigSchema', () => {
    it('should accept a valid apiKey', () => {
      const result = anthropicApiKeyConfigSchema.safeParse({ apiKey: 'sk-ant-abc' });
      expect(result.success).toBe(true);
    });

    it('should reject when apiKey is missing', () => {
      const result = anthropicApiKeyConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ollamaConfigSchema', () => {
    it('should accept a valid baseUrl + model', () => {
      const result = ollamaConfigSchema.safeParse({
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1:8b',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-http(s) URL schemes', () => {
      const result = ollamaConfigSchema.safeParse({
        baseUrl: 'ftp://example.com',
        model: 'llama3.1:8b',
      });
      expect(result.success).toBe(false);
    });

    it('should reject when model is missing', () => {
      const result = ollamaConfigSchema.safeParse({ baseUrl: 'http://localhost:11434' });
      expect(result.success).toBe(false);
    });
  });

  describe('PROVIDER_CONFIG_SCHEMAS', () => {
    it('should expose every provider schema by its provider key', () => {
      expect(PROVIDER_CONFIG_SCHEMAS.google).toBe(googleOAuth2ConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.slack).toBe(slackOAuth2ConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.notion).toBe(notionOAuth2ConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.openai).toBe(openAIApiKeyConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.anthropic).toBe(anthropicApiKeyConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.ollama).toBe(ollamaConfigSchema);
    });
  });
});
