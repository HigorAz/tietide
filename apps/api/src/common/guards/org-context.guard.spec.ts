import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { OrgContextGuard } from './org-context.guard';

interface MockRequest {
  user?: { id: string };
  headers: Record<string, string | string[] | undefined>;
  org?: { id: string; role: string };
}

function ctxFor(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OrgContextGuard', () => {
  let prisma: {
    organizationMember: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let guard: OrgContextGuard;

  const userId = 'user-1';

  beforeEach(() => {
    prisma = {
      organizationMember: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    guard = new OrgContextGuard(prisma as never);
  });

  it('attaches { id, role } when the X-Org-Id header names an org the user belongs to', async () => {
    prisma.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org-A',
      role: 'ADMIN',
    });
    const request: MockRequest = { user: { id: userId }, headers: { 'x-org-id': 'org-A' } };

    await expect(guard.canActivate(ctxFor(request))).resolves.toBe(true);

    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-A', userId } }),
    );
    expect(request.org).toEqual({ id: 'org-A', role: 'ADMIN' });
  });

  it('throws Forbidden when the header names an org the user is NOT a member of (cross-org IDOR)', async () => {
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    const request: MockRequest = { user: { id: userId }, headers: { 'x-org-id': 'org-B' } };

    await expect(guard.canActivate(ctxFor(request))).rejects.toThrow(ForbiddenException);
    expect(request.org).toBeUndefined();
  });

  it('falls back to the default organization when no header is present', async () => {
    prisma.user.findUnique.mockResolvedValue({ defaultOrganizationId: 'org-default' });
    prisma.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org-default',
      role: 'SUPERADMIN',
    });
    const request: MockRequest = { user: { id: userId }, headers: {} };

    await expect(guard.canActivate(ctxFor(request))).resolves.toBe(true);
    expect(request.org).toEqual({ id: 'org-default', role: 'SUPERADMIN' });
  });

  it('falls back to the earliest membership when there is no header and no default org', async () => {
    prisma.user.findUnique.mockResolvedValue({ defaultOrganizationId: null });
    prisma.organizationMember.findFirst.mockResolvedValue({
      organizationId: 'org-earliest',
      role: 'MEMBER',
    });
    const request: MockRequest = { user: { id: userId }, headers: {} };

    await expect(guard.canActivate(ctxFor(request))).resolves.toBe(true);
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    );
    expect(request.org).toEqual({ id: 'org-earliest', role: 'MEMBER' });
  });

  it('throws Forbidden when the user has no memberships at all', async () => {
    prisma.user.findUnique.mockResolvedValue({ defaultOrganizationId: null });
    prisma.organizationMember.findFirst.mockResolvedValue(null);
    const request: MockRequest = { user: { id: userId }, headers: {} };

    await expect(guard.canActivate(ctxFor(request))).rejects.toThrow(ForbiddenException);
  });

  it('throws Forbidden when there is no authenticated user', async () => {
    const request: MockRequest = { headers: { 'x-org-id': 'org-A' } };

    await expect(guard.canActivate(ctxFor(request))).rejects.toThrow(ForbiddenException);
    expect(prisma.organizationMember.findFirst).not.toHaveBeenCalled();
  });
});
