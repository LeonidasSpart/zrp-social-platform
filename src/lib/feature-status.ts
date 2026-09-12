// Split out of permissions.ts so this stays importable from
// src/middleware.ts without pulling in Prisma. Middleware can execute
// in an Edge runtime (see middleware.ts's own note on why it never
// imports Redis either) - under Prisma 7+, src/lib/db.ts imports
// @prisma/adapter-pg, whose `pg` dependency requires Node's `crypto`
// module at the top level. permissions.ts imports `prisma` from `./db`
// for its DB-backed team-membership helpers further down, so importing
// *anything* from permissions.ts - even a function that never touches
// the database, like getFeatureStatus - dragged that whole import graph
// into middleware's edge bundle and broke every request in production
// ("The edge runtime does not support Node.js 'crypto' module").
// permissions.ts re-exports everything below so none of its other ~25
// call sites need to change.
import { hasFeature, getUserPlan } from './limits';

export type UserWithPlan = { plan?: string } | null;

// ─── Feature Checks ──────────────────────────────────────────────

/**
 * Check if a user can use a custom profile URL
 */
export function canUseCustomUrl(user: UserWithPlan): boolean {
  if (!user) return false;
  const plan = getUserPlan(user);
  return hasFeature(plan, 'customProfileUrl');
}

/**
 * Check if a user can post recruitment profiles
 */
export function canPostRecruitment(user: UserWithPlan): boolean {
  if (!user) return false;
  const plan = getUserPlan(user);
  return hasFeature(plan, 'recruitmentProfiles');
}

/**
 * Check if a user can publish articles
 */
export function canPublishArticle(user: UserWithPlan): boolean {
  if (!user) return false;
  const plan = getUserPlan(user);
  return hasFeature(plan, 'articlePublishing');
}

/**
 * Check if a user can manage a team (Business/Enterprise only)
 */
export function canManageTeam(user: UserWithPlan): boolean {
  if (!user) return false;
  const plan = getUserPlan(user);
  return hasFeature(plan, 'teamManagement');
}

/**
 * Check if a user can access the API
 */
export function canAccessApi(user: UserWithPlan): boolean {
  if (!user) return false;
  const plan = getUserPlan(user);
  return hasFeature(plan, 'apiAccess');
}

// ─── Bulk Feature Status ─────────────────────────────────────────

export interface FeatureStatus {
  customProfileUrl: boolean;
  recruitmentProfiles: boolean;
  articlePublishing: boolean;
  teamManagement: boolean;
  apiAccess: boolean;
}

/**
 * Get all feature flags for a user in one object
 */
export function getFeatureStatus(user: UserWithPlan): FeatureStatus {
  if (!user) {
    return {
      customProfileUrl: false,
      recruitmentProfiles: false,
      articlePublishing: false,
      teamManagement: false,
      apiAccess: false,
    };
  }
  const plan = getUserPlan(user);
  return {
    customProfileUrl: hasFeature(plan, 'customProfileUrl'),
    recruitmentProfiles: hasFeature(plan, 'recruitmentProfiles'),
    articlePublishing: hasFeature(plan, 'articlePublishing'),
    teamManagement: hasFeature(plan, 'teamManagement'),
    apiAccess: hasFeature(plan, 'apiAccess'),
  };
}
