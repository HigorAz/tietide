import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AllExecutionsQueryDto } from './all-executions-query.dto';

describe('AllExecutionsQueryDto', () => {
  describe('page', () => {
    it('passes when page is omitted', async () => {
      const dto = plainToInstance(AllExecutionsQueryDto, {});
      expect(await validate(dto)).toHaveLength(0);
    });

    it('passes for a small page number', async () => {
      const dto = plainToInstance(AllExecutionsQueryDto, { page: '5' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('passes at the maximum page cap (1000)', async () => {
      const dto = plainToInstance(AllExecutionsQueryDto, { page: '1000' });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a page above the maximum cap (deep-offset query cost)', async () => {
      const dto = plainToInstance(AllExecutionsQueryDto, { page: '1001' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
      expect(errors[0].constraints).toHaveProperty('max');
    });

    it('rejects a page below the minimum', async () => {
      const dto = plainToInstance(AllExecutionsQueryDto, { page: '0' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
      expect(errors[0].constraints).toHaveProperty('min');
    });
  });
});
