import { Conflict, NotFound } from '../lib/errors';
import type { UserDoc } from '../models/User';
import { userRepository, type CreateUserInput } from '../repositories/userRepository';

export const userService = {
  async create(input: CreateUserInput): Promise<UserDoc> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw Conflict('email already registered', { email: input.email });
    return userRepository.create(input);
  },
  async getById(id: string): Promise<UserDoc> {
    const user = await userRepository.findById(id);
    if (!user) throw NotFound('user', id);
    return user;
  },
  findByEmail(email: string): Promise<UserDoc | null> {
    return userRepository.findByEmail(email);
  },
};
