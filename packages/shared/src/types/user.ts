export type UserRole = 'admin' | 'user';

export type SubscriptionPlan = 'free' | 'pro';

export interface UserEntitlements {
  plan: SubscriptionPlan;
  /** Remaining one-off generations (free trial or top-up packs). */
  generationsRemaining: number;
  /** When the current paid period ends, if any. */
  currentPeriodEnd?: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  entitlements: UserEntitlements;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
}
