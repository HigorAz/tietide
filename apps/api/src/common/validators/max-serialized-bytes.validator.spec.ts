import { validate } from 'class-validator';
import {
  DEFAULT_TRIGGER_DATA_MAX_BYTES,
  MaxSerializedBytes,
  serializedByteLength,
} from './max-serialized-bytes.validator';

describe('serializedByteLength', () => {
  it('returns 0 for undefined (optional fields pass)', () => {
    expect(serializedByteLength(undefined)).toBe(0);
  });

  it('measures the UTF-8 byte length of the JSON form', () => {
    expect(serializedByteLength({ a: 'x' })).toBe(Buffer.byteLength('{"a":"x"}', 'utf8'));
  });

  it('counts multibyte characters by bytes, not code points', () => {
    // "é" is 2 bytes in UTF-8.
    expect(serializedByteLength('é')).toBe(Buffer.byteLength('"é"', 'utf8'));
  });

  it('treats circular structures as oversized', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(serializedByteLength(a)).toBe(Number.POSITIVE_INFINITY);
  });
});

class Holder {
  @MaxSerializedBytes(100)
  data?: unknown;
}

describe('MaxSerializedBytes decorator', () => {
  it('passes when the field is omitted', async () => {
    const errors = await validate(new Holder());
    expect(errors).toHaveLength(0);
  });

  it('passes a small payload', async () => {
    const h = new Holder();
    h.data = { hello: 'world' };
    expect(await validate(h)).toHaveLength(0);
  });

  it('rejects a payload over the cap', async () => {
    const h = new Holder();
    h.data = { big: 'x'.repeat(200) };
    const errors = await validate(h);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('maxSerializedBytes');
  });

  it('exposes a sane default cap', () => {
    expect(DEFAULT_TRIGGER_DATA_MAX_BYTES).toBe(65536);
  });
});
