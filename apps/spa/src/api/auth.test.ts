import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicUser } from '@tietide/shared';

vi.mock('./client', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import { api } from './client';
import { login, register, verifyEmail, getMe } from './auth';

const mockedPost = vi.mocked(api.post);
const mockedGet = vi.mocked(api.get);

const sampleUser: PublicUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('auth API', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedGet.mockReset();
  });

  describe('login', () => {
    it('should POST /auth/login with email and password and return the token envelope', async () => {
      mockedPost.mockResolvedValueOnce({
        data: { accessToken: 'jwt-token', tokenType: 'Bearer' },
      });

      const result = await login({ email: 'alice@example.com', password: 'pw' });

      expect(mockedPost).toHaveBeenCalledWith('/auth/login', {
        email: 'alice@example.com',
        password: 'pw',
      });
      expect(result).toEqual({ accessToken: 'jwt-token', tokenType: 'Bearer' });
    });

    it('should propagate an error when the request fails', async () => {
      const err = new Error('401');
      mockedPost.mockRejectedValueOnce(err);

      await expect(login({ email: 'a@b.com', password: 'pw' })).rejects.toBe(err);
    });
  });

  describe('register', () => {
    it('should POST /auth/register and return the neutral message envelope', async () => {
      mockedPost.mockResolvedValueOnce({ data: { message: 'check your inbox' } });

      const result = await register({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });

      expect(mockedPost).toHaveBeenCalledWith('/auth/register', {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });
      expect(result).toEqual({ message: 'check your inbox' });
    });
  });

  describe('verifyEmail', () => {
    it('should POST /auth/verify-email with the token and return the session envelope', async () => {
      mockedPost.mockResolvedValueOnce({ data: { accessToken: 'jwt', tokenType: 'Bearer' } });

      const result = await verifyEmail('tok-123');

      expect(mockedPost).toHaveBeenCalledWith('/auth/verify-email', { token: 'tok-123' });
      expect(result).toEqual({ accessToken: 'jwt', tokenType: 'Bearer' });
    });
  });

  describe('getMe', () => {
    it('should GET /auth/me and return the current user', async () => {
      mockedGet.mockResolvedValueOnce({ data: sampleUser });

      const result = await getMe();

      expect(mockedGet).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(sampleUser);
    });
  });
});
