import { Test } from '@nestjs/testing';
import { HttpRequestAction } from '../actions/http-request';
import { OllamaClientFactory } from './ollama/ollama-client.factory';
import { S3ClientFactory } from './s3/s3-client.factory';

// Regression guard for the production boot crash where OllamaClientFactory and
// S3ClientFactory declared an optional `lookupFn?: LookupFn` constructor param
// WITHOUT `@Optional()`. Nest then treats the bare `LookupFn` type as a required
// dependency it can't resolve, throwing UnknownDependenciesException at bootstrap
// (the worker crash-looped in prod). The unit SSRF specs never caught it because
// they construct the factories directly (`new OllamaClientFactory(...)`), bypassing
// the Nest DI container.
//
// This test resolves the SSRF-related providers THROUGH the DI container, exactly
// as EngineModule does at app bootstrap: any optional-injected constructor param
// missing `@Optional()` makes `.compile()` throw and fails this test.
describe('connector factory DI resolution', () => {
  it.each([
    ['OllamaClientFactory', OllamaClientFactory],
    ['S3ClientFactory', S3ClientFactory],
    ['HttpRequestAction', HttpRequestAction],
  ])('resolves %s via the Nest DI container (optional ctor params must be @Optional)', async (_name, Provider) => {
    const moduleRef = await Test.createTestingModule({ providers: [Provider] }).compile();
    expect(moduleRef.get(Provider)).toBeInstanceOf(Provider);
    await moduleRef.close();
  });
});
