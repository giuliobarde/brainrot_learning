import { randomUUID } from 'node:crypto';

import { Conflict, Unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/passwords';
import {
  generateOpaqueRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../lib/tokens';
import type { UserDoc } from '../models/User';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository';
import { userRepository } from '../repositories/userRepository';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthResult {
  user: UserDoc;
  tokens: AuthTokens;
}

async function issueTokens(user: UserDoc, family?: string): Promise<AuthTokens> {
  const access = signAccessToken(user.id);
  const refreshToken = generateOpaqueRefreshToken();
  await refreshTokenRepository.create({
    userId: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    family: family ?? randomUUID(),
    expiresAt: refreshTokenExpiry(),
  });
  return {
    accessToken: access.token,
    refreshToken,
    expiresInSeconds: access.expiresInSeconds,
  };
}

export const authService = {
  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResult> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw Conflict('email already registered');
    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      email: input.email.toLowerCase(),
      passwordHash,
      displayName: input.displayName,
    });
    const tokens = await issueTokens(user);
    return { user, tokens };
  },

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user) throw Unauthorized('invalid credentials');
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) throw Unauthorized('invalid credentials');
    const tokens = await issueTokens(user);
    return { user, tokens };
  },

  async refresh(presentedToken: string): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(presentedToken);
    const stored = await refreshTokenRepository.findByHash(tokenHash);
    if (!stored) throw Unauthorized('invalid refresh token');

    if (stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      // Theft suspected: revoke entire family.
      await refreshTokenRepository.revokeFamily(stored.family);
      throw Unauthorized('refresh token reuse detected');
    }

    const user = await userRepository.findById(stored.userId);
    if (!user) throw Unauthorized('user not found');

    const newRefresh = generateOpaqueRefreshToken();
    const newHash = hashRefreshToken(newRefresh);
    await refreshTokenRepository.create({
      userId: user._id,
      tokenHash: newHash,
      family: stored.family,
      expiresAt: refreshTokenExpiry(),
    });
    await refreshTokenRepository.revokeById(stored._id, newHash);

    const access = signAccessToken(user.id);
    return {
      user,
      tokens: {
        accessToken: access.token,
        refreshToken: newRefresh,
        expiresInSeconds: access.expiresInSeconds,
      },
    };
  },

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(presentedToken);
    const stored = await refreshTokenRepository.findByHash(tokenHash);
    if (!stored) return;
    await refreshTokenRepository.revokeFamily(stored.family);
  },
};
