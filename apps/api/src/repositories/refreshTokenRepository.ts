import type { Types } from 'mongoose';

import { RefreshTokenModel, type RefreshTokenDoc } from '../models/RefreshToken';

export interface CreateRefreshTokenInput {
  userId: Types.ObjectId | string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
}

export const refreshTokenRepository = {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenDoc> {
    return RefreshTokenModel.create(input);
  },
  findByHash(tokenHash: string): Promise<RefreshTokenDoc | null> {
    return RefreshTokenModel.findOne({ tokenHash }).exec();
  },
  revokeById(id: Types.ObjectId | string, replacedBy?: string): Promise<RefreshTokenDoc | null> {
    return RefreshTokenModel.findByIdAndUpdate(
      id,
      { revokedAt: new Date(), ...(replacedBy ? { replacedBy } : {}) },
      { new: true },
    ).exec();
  },
  revokeFamily(family: string): Promise<{ modifiedCount: number }> {
    return RefreshTokenModel.updateMany(
      { family, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    )
      .exec()
      .then((r) => ({ modifiedCount: r.modifiedCount }));
  },
  revokeAllForUser(userId: Types.ObjectId | string): Promise<{ modifiedCount: number }> {
    return RefreshTokenModel.updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    )
      .exec()
      .then((r) => ({ modifiedCount: r.modifiedCount }));
  },
};
