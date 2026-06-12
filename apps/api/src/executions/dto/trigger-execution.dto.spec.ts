import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TriggerExecutionDto } from './trigger-execution.dto';
import { DEFAULT_TRIGGER_DATA_MAX_BYTES } from '../../common/validators/max-serialized-bytes.validator';

describe('TriggerExecutionDto', () => {
  describe('triggerData', () => {
    it('passes when triggerData is omitted', async () => {
      const dto = plainToInstance(TriggerExecutionDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('passes a small triggerData object', async () => {
      const dto = plainToInstance(TriggerExecutionDto, { triggerData: { hello: 'world' } });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('passes an at-limit (64 KiB) triggerData object', async () => {
      // Build a payload whose JSON serialization is exactly the cap.
      const overhead = Buffer.byteLength('{"a":""}', 'utf8');
      const value = 'x'.repeat(DEFAULT_TRIGGER_DATA_MAX_BYTES - overhead);
      const triggerData = { a: value };
      expect(Buffer.byteLength(JSON.stringify(triggerData), 'utf8')).toBe(
        DEFAULT_TRIGGER_DATA_MAX_BYTES,
      );

      const dto = plainToInstance(TriggerExecutionDto, { triggerData });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a triggerData object larger than 64 KiB', async () => {
      const triggerData = { big: 'x'.repeat(DEFAULT_TRIGGER_DATA_MAX_BYTES + 1) };
      const dto = plainToInstance(TriggerExecutionDto, { triggerData });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('maxSerializedBytes');
    });

    it('rejects a triggerData carrying a prototype-pollution key (W5.46)', async () => {
      // Assign directly: class-transformer's plainToInstance drops a raw
      // `__proto__` own key (it never reaches the instance), so build the unsafe
      // value on the instance to exercise the @IsSafeNodeConfig walker the way it
      // guards a payload that survives transform.
      const dto = new TriggerExecutionDto();
      dto.triggerData = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>;
      const errors = await validate(dto);
      expect(errors.some((e) => e.constraints?.isSafeNodeConfig != null)).toBe(true);
    });

    it('rejects a triggerData with a nested constructor key (W5.46)', async () => {
      const dto = new TriggerExecutionDto();
      dto.triggerData = { a: { constructor: { evil: true } } };
      const errors = await validate(dto);
      expect(errors.some((e) => e.constraints?.isSafeNodeConfig != null)).toBe(true);
    });
  });
});
