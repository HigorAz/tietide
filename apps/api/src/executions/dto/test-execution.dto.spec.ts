import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TestExecutionDto } from './test-execution.dto';
import { DEFAULT_TRIGGER_DATA_MAX_BYTES } from '../../common/validators/max-serialized-bytes.validator';

const minimalDefinition = {
  nodes: [{ id: 'n1', type: 'manual', position: { x: 0, y: 0 }, data: {} }],
  edges: [],
};

describe('TestExecutionDto', () => {
  describe('triggerData', () => {
    it('passes when triggerData is omitted', async () => {
      const dto = plainToInstance(TestExecutionDto, { definition: minimalDefinition });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'triggerData')).toBeUndefined();
    });

    it('passes a small triggerData object', async () => {
      const dto = plainToInstance(TestExecutionDto, {
        definition: minimalDefinition,
        triggerData: { hello: 'world' },
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'triggerData')).toBeUndefined();
    });

    it('passes an at-limit (64 KiB) triggerData object', async () => {
      const overhead = Buffer.byteLength('{"a":""}', 'utf8');
      const value = 'x'.repeat(DEFAULT_TRIGGER_DATA_MAX_BYTES - overhead);
      const triggerData = { a: value };
      expect(Buffer.byteLength(JSON.stringify(triggerData), 'utf8')).toBe(
        DEFAULT_TRIGGER_DATA_MAX_BYTES,
      );

      const dto = plainToInstance(TestExecutionDto, {
        definition: minimalDefinition,
        triggerData,
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'triggerData')).toBeUndefined();
    });

    it('rejects a triggerData object larger than 64 KiB', async () => {
      const triggerData = { big: 'x'.repeat(DEFAULT_TRIGGER_DATA_MAX_BYTES + 1) };
      const dto = plainToInstance(TestExecutionDto, {
        definition: minimalDefinition,
        triggerData,
      });
      const errors = await validate(dto);
      const triggerErr = errors.find((e) => e.property === 'triggerData');
      expect(triggerErr).toBeDefined();
      expect(triggerErr?.constraints).toHaveProperty('maxSerializedBytes');
    });
  });
});
