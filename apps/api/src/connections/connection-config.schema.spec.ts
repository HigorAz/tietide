import {
  PROVIDER_CONFIG_SCHEMAS,
  anthropicApiKeyConfigSchema,
  googleOAuth2ConfigSchema,
  notionOAuth2ConfigSchema,
  ollamaConfigSchema,
  openAIApiKeyConfigSchema,
  slackOAuth2ConfigSchema,
  hubspotOAuth2ConfigSchema,
  mailchimpApiKeyConfigSchema,
  calendlyApiKeyConfigSchema,
  postgresCustomConfigSchema,
  mysqlCustomConfigSchema,
  s3CustomConfigSchema,
  postgresRunQueryConfigSchema,
  mysqlRunQueryConfigSchema,
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

  describe('hubspotOAuth2ConfigSchema', () => {
    it('accepts a payload with access + refresh tokens', () => {
      const result = hubspotOAuth2ConfigSchema.safeParse({
        accessToken: 'CN_abc',
        refreshToken: 'rf_abc',
        hubId: '12345',
      });
      expect(result.success).toBe(true);
    });

    it('rejects when refreshToken is missing', () => {
      const result = hubspotOAuth2ConfigSchema.safeParse({ accessToken: 'CN_abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('mailchimpApiKeyConfigSchema', () => {
    it('accepts apiKey with valid dataCenter', () => {
      const result = mailchimpApiKeyConfigSchema.safeParse({
        apiKey: 'abcdef-us1',
        dataCenter: 'us1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects malformed dataCenter (e.g. "USA1")', () => {
      const result = mailchimpApiKeyConfigSchema.safeParse({
        apiKey: 'abcdef-us1',
        dataCenter: 'USA1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('calendlyApiKeyConfigSchema', () => {
    it('accepts a Personal Access Token', () => {
      const result = calendlyApiKeyConfigSchema.safeParse({ apiKey: 'eyJ.calendly.token' });
      expect(result.success).toBe(true);
    });

    it('rejects empty apiKey', () => {
      const result = calendlyApiKeyConfigSchema.safeParse({ apiKey: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('postgresCustomConfigSchema', () => {
    it('accepts postgresql:// URL', () => {
      const result = postgresCustomConfigSchema.safeParse({
        connectionString: 'postgresql://user:pass@host:5432/db',
      });
      expect(result.success).toBe(true);
    });

    it('accepts postgres:// URL', () => {
      const result = postgresCustomConfigSchema.safeParse({
        connectionString: 'postgres://localhost/db',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mysql:// URL', () => {
      const result = postgresCustomConfigSchema.safeParse({
        connectionString: 'mysql://localhost/db',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('mysqlCustomConfigSchema', () => {
    it('accepts mysql:// URL', () => {
      const result = mysqlCustomConfigSchema.safeParse({
        connectionString: 'mysql://user:pass@host:3306/db',
      });
      expect(result.success).toBe(true);
    });

    it('rejects postgresql:// URL', () => {
      const result = mysqlCustomConfigSchema.safeParse({
        connectionString: 'postgresql://localhost/db',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('s3CustomConfigSchema', () => {
    it('accepts AWS-shaped config without endpoint', () => {
      const result = s3CustomConfigSchema.safeParse({
        accessKeyId: 'AKIA1234567890',
        secretAccessKey: 'secret',
        region: 'us-east-1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts S3-compatible config with custom endpoint and forcePathStyle', () => {
      const result = s3CustomConfigSchema.safeParse({
        accessKeyId: 'minio',
        secretAccessKey: 'minio-secret',
        region: 'us-east-1',
        endpoint: 'https://minio.example.com',
        forcePathStyle: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid endpoint URL', () => {
      const result = s3CustomConfigSchema.safeParse({
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        endpoint: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('postgresRunQueryConfigSchema (SQL hardening)', () => {
    const VALID_CONNECTION_ID = '11111111-1111-1111-1111-111111111111';

    it('accepts parameterized query with matching params', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT * FROM users WHERE id = $1',
        params: ['abc'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects multi-statement (DROP TABLE) injection', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT 1; DROP TABLE users',
      });
      expect(result.success).toBe(false);
    });

    it('rejects -- line comment', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT * FROM users -- bypass',
      });
      expect(result.success).toBe(false);
    });

    it('rejects /* block comment */', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT 1 /* injected */',
      });
      expect(result.success).toBe(false);
    });

    it('rejects ${} template-literal pattern', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT * FROM users WHERE id = ${userId}',
      });
      expect(result.success).toBe(false);
    });

    it('rejects placeholder/param count mismatch', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT $1, $2',
        params: ['only-one'],
      });
      expect(result.success).toBe(false);
    });

    it('treats comment-like sequences inside string literals as data', () => {
      const result = postgresRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: "SELECT '-- not a comment' AS note",
      });
      expect(result.success).toBe(true);
    });
  });

  describe('mysqlRunQueryConfigSchema (SQL hardening)', () => {
    const VALID_CONNECTION_ID = '11111111-1111-1111-1111-111111111111';

    it('accepts parameterized query (?) with matching params', () => {
      const result = mysqlRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT * FROM users WHERE id = ?',
        params: ['abc'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects # line comment', () => {
      const result = mysqlRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT 1 # bypass',
      });
      expect(result.success).toBe(false);
    });

    it('rejects multi-statement', () => {
      const result = mysqlRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT 1; DROP TABLE users',
      });
      expect(result.success).toBe(false);
    });

    it('rejects ? count mismatch', () => {
      const result = mysqlRunQueryConfigSchema.safeParse({
        connectionId: VALID_CONNECTION_ID,
        query: 'SELECT ?, ?',
        params: ['only-one'],
      });
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
      expect(PROVIDER_CONFIG_SCHEMAS.hubspot).toBe(hubspotOAuth2ConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.mailchimp).toBe(mailchimpApiKeyConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.calendly).toBe(calendlyApiKeyConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.postgres).toBe(postgresCustomConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.mysql).toBe(mysqlCustomConfigSchema);
      expect(PROVIDER_CONFIG_SCHEMAS.s3).toBe(s3CustomConfigSchema);
    });
  });
});
