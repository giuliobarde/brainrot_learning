import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export interface UserDoc extends Document<Types.ObjectId> {
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String, trim: true },
  },
  { timestamps: true },
);

export const UserModel: Model<UserDoc> = model<UserDoc>('User', UserSchema);
