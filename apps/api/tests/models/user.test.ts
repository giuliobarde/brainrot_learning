import { describe, expect, it } from 'vitest';

import { UserModel } from '../../src/models/User';

describe('UserModel', () => {
  it('creates a user and surfaces timestamps', async () => {
    const user = await UserModel.create({
      email: 'Alice@Example.com',
      passwordHash: 'hash',
      displayName: 'Alice',
    });

    expect(user.email).toBe('alice@example.com');
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects duplicate emails', async () => {
    await UserModel.create({ email: 'b@example.com', passwordHash: 'h', displayName: 'B' });
    await expect(
      UserModel.create({ email: 'b@example.com', passwordHash: 'h2', displayName: 'B2' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('updates and deletes a user', async () => {
    const u = await UserModel.create({
      email: 'c@example.com',
      passwordHash: 'h',
      displayName: 'C',
    });
    const updated = await UserModel.findByIdAndUpdate(u._id, { displayName: 'C2' }, { new: true });
    expect(updated?.displayName).toBe('C2');

    await UserModel.findByIdAndDelete(u._id);
    expect(await UserModel.findById(u._id)).toBeNull();
  });

  it('declares a unique index on email', async () => {
    const indexes = await UserModel.collection.indexes();
    const emailIdx = indexes.find((i) => i.name === 'email_1');
    expect(emailIdx).toBeDefined();
    expect(emailIdx?.unique).toBe(true);
  });
});
