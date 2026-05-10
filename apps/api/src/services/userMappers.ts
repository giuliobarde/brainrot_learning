import type { SubscriptionPlan, UserDoc, UserEntitlementsSubdoc, UserRole } from '../models/User';

export interface PublicUserEntitlements {
  plan: SubscriptionPlan;
  generationsRemaining: number;
  currentPeriodEnd?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  entitlements: PublicUserEntitlements;
  createdAt: string;
  updatedAt: string;
}

function toEntitlements(e?: UserEntitlementsSubdoc): PublicUserEntitlements {
  return {
    plan: e?.plan ?? 'free',
    generationsRemaining: e?.generationsRemaining ?? 0,
    currentPeriodEnd: e?.currentPeriodEnd?.toISOString(),
  };
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    entitlements: toEntitlements(user.entitlements),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
