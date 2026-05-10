import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type UserRole = 'admin' | 'user';
export type SubscriptionPlan = 'free' | 'pro';

export interface UserEntitlementsSubdoc {
  plan: SubscriptionPlan;
  generationsRemaining: number;
  currentPeriodEnd?: Date;
}

export interface UserDoc extends Document<Types.ObjectId> {
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  entitlements: UserEntitlementsSubdoc;
  createdAt: Date;
  updatedAt: Date;
}

const EntitlementsSchema = new Schema<UserEntitlementsSubdoc>(
  {
    plan: { type: String, enum: ['free', 'pro'], default: 'free', required: true },
    generationsRemaining: { type: Number, default: 0, min: 0, required: true },
    currentPeriodEnd: { type: Date },
  },
  { _id: false },
);

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String, trim: true },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
      required: true,
      index: true,
    },
    entitlements: {
      type: EntitlementsSchema,
      default: () => ({ plan: 'free', generationsRemaining: 0 }),
    },
  },
  { timestamps: true },
);

export const UserModel: Model<UserDoc> = model<UserDoc>('User', UserSchema);
