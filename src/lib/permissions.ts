import { hasFeature, getUserPlan, Plan } from './limits';

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

// ─── Team Membership Helpers ─────────────────────────────────────
// (These require database queries: call them from API routes or server components)

import { prisma } from './db';

// ─── Private Account Enforcement ─────────────────────────────────
//
// ⚠️ SECURITY: this is the single server-side gate content endpoints
// must use before returning a private account's posts, likes,
// reposts, replies, media, or relationship lists to a caller who
// isn't the account owner. Never rely on the frontend to hide this
// data - the API must refuse to serve it in the first place.

/**
 * Prisma `where` fragment to attach under an `author:` relation filter
 * (e.g. `where: { author: viewablePostAuthorFilter(viewerId), ... }`)
 * so that public listings (explore, search, hashtags) only ever
 * surface posts from non-private accounts, the viewer's own posts, or
 * accounts the viewer has an approved follow relationship with.
 * Blocked/muted-author exclusion is a separate, existing concern and
 * should still be applied alongside this.
 */
export function viewablePostAuthorFilter(viewerId: string | null | undefined) {
  return {
    OR: [
      { isPrivate: false },
      ...(viewerId
        ? [
            { id: viewerId },
            { followers: { some: { followerId: viewerId } } },
          ]
        : []),
    ],
  };
}

/**
 * Can `viewerId` see private content belonging to `targetUserId`?
 * True when the target isn't private, the viewer *is* the target, or
 * the viewer has an approved (accepted) follow relationship with the
 * target - i.e. a row exists in Follow, which is only ever created
 * once a private-account follow request has been approved (see
 * POST /api/users/[username]/follow).
 */
export async function canViewPrivateContent(
  viewerId: string | null | undefined,
  targetUserId: string,
  isTargetPrivate: boolean
): Promise<boolean> {
  if (!isTargetPrivate) return true;
  if (!viewerId) return false;
  if (viewerId === targetUserId) return true;

  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: viewerId,
        followingId: targetUserId,
      },
    },
    select: { id: true },
  });

  return !!follow;
}

/**
 * Check if a user is a member of a specific team (account owner's team).
 * Returns true if they are an OWNER (admin) or a regular member.
 */
export async function isTeamMember(
  userId: string,
  accountOwnerId: string
): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: {
      accountId_userId: {
        accountId: accountOwnerId,
        userId: userId,
      },
    },
  });
  return !!member;
}

/**
 * Check if a user is an ADMIN of a specific team.
 */
export async function isTeamAdmin(
  userId: string,
  accountOwnerId: string
): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: {
      accountId_userId: {
        accountId: accountOwnerId,
        userId: userId,
      },
    },
  });
  return member?.role === 'ADMIN';
}

/**
 * Get all members of a team (only callable by the account owner or admins).
 * You'll handle the permission check separately.
 */
export async function getTeamMembers(accountOwnerId: string) {
  return prisma.teamMember.findMany({
    where: { accountId: accountOwnerId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          email: true,
        },
      },
    },
  });
}
