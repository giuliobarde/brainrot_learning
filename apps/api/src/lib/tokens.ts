import { createHash, randomBytes, randomUUID } from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { config } from '../config';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessPayload {
  sub: string;
  type: 'access';
}

export function signAccessToken(userId: string): { token: string; expiresInSeconds: number } {
  const payload: AccessPayload = { sub: userId, type: 'access' };
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_TTL_SECONDS, jwtid: randomUUID() };
  const token = jwt.sign(payload, config.jwtAccessSecret, options);
  return { token, expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret) as AccessPayload;
  if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
    throw new Error('invalid access token payload');
  }
  return decoded;
}

export function generateOpaqueRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}
