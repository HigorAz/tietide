import { PrismaService } from './prisma.service';

describe('api PrismaService', () => {
  let service: PrismaService;
  let connectSpy: jest.SpyInstance;
  let disconnectSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new PrismaService();
    // Stub the upstream PrismaClient I/O so the test never opens a real
    // database connection. We only want to assert lifecycle wiring.
    connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit', () => {
    it('should open a Prisma connection when the module boots', async () => {
      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    it('should propagate underlying connection failures so Nest aborts boot', async () => {
      connectSpy.mockRejectedValueOnce(new Error('postgres unreachable'));

      await expect(service.onModuleInit()).rejects.toThrow(/postgres unreachable/);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the Prisma connection when the module is torn down', async () => {
      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('should still attempt disconnect even after a failed connect (idempotent shutdown)', async () => {
      connectSpy.mockRejectedValueOnce(new Error('boom'));
      await expect(service.onModuleInit()).rejects.toThrow();

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
