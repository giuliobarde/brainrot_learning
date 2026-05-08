import type { FilterQuery, Types } from 'mongoose';

import { UserModel, type UserDoc } from '../models/User';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl?: string;
}

export const userRepository = {
  create(input: CreateUserInput): Promise<UserDoc> {
    return UserModel.create(input);
  },
  findById(id: string | Types.ObjectId): Promise<UserDoc | null> {
    return UserModel.findById(id).exec();
  },
  findByEmail(email: string): Promise<UserDoc | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  },
  update(id: string | Types.ObjectId, patch: Partial<CreateUserInput>): Promise<UserDoc | null> {
    return UserModel.findByIdAndUpdate(id, patch, { new: true }).exec();
  },
  delete(id: string | Types.ObjectId): Promise<UserDoc | null> {
    return UserModel.findByIdAndDelete(id).exec();
  },
  count(filter: FilterQuery<UserDoc> = {}): Promise<number> {
    return UserModel.countDocuments(filter).exec();
  },
};
