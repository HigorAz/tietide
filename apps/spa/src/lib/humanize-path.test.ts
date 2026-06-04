import { describe, it, expect } from 'vitest';
import { humanizePath } from './humanize-path';

describe('humanizePath', () => {
  it('title-cases camelCase fields', () => {
    expect(humanizePath('author.username')).toBe('Author › Username');
    expect(humanizePath('statusCode')).toBe('Status Code');
  });

  it('uppercases known acronyms', () => {
    expect(humanizePath('channelId')).toBe('Channel ID');
    expect(humanizePath('guildId')).toBe('Guild ID');
    expect(humanizePath('user.apiKey')).toBe('User › API Key');
  });

  it('renders numeric segments as bracketed indices', () => {
    expect(humanizePath('items.0.id')).toBe('Items › [0] › ID');
    expect(humanizePath('0.name')).toBe('[0] › Name');
  });

  it('handles snake_case and kebab-case', () => {
    expect(humanizePath('html_body')).toBe('HTML Body');
    expect(humanizePath('content-type')).toBe('Content Type');
  });

  it('labels an empty path as the whole output', () => {
    expect(humanizePath('')).toBe('Whole output');
  });
});
