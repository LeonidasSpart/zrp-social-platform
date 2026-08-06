// ─── Plan Definitions ──────────────────────────────────────────────

export type Plan = 'free' | 'pro' | 'business' | 'enterprise';

export interface PlanLimits {
  postLength: number;
  imagesPerPost: number;
  videoUploadMB: number;
  scheduledPostsPerMonth: number;
  analytics: 'basic' | 'advanced' | 'full' | 'custom';
  verifiedBadge: boolean;
  customProfileUrl: boolean;
  recruitmentProfiles: boolean;
  articlePublishing: boolean;
  teamManagement: boolean;
  apiAccess: boolean;
  prioritySupport: 'none' | 'standard' | 'priority' | '24/7';
  charityContribution: number;
  priceMonthly: number | null;
  priceYearly?: number | null;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: {
    postLength: 280,
    imagesPerPost: 1,
    videoUploadMB: 32,
    scheduledPostsPerMonth: 5,
    analytics: 'basic',
    verifiedBadge: false,
    customProfileUrl: false,
    recruitmentProfiles: false,
    articlePublishing: false,
    teamManagement: false,
    apiAccess: false,
    prioritySupport: 'none',
    charityContribution: 35,
    priceMonthly: 0,
    priceYearly: 0,
  },
  pro: {
    postLength: 1000,
    imagesPerPost: 4,
    videoUploadMB: 100,
    scheduledPostsPerMonth: 50,
    analytics: 'advanced',
    verifiedBadge: true,
    customProfileUrl: true,
    recruitmentProfiles: false,
    articlePublishing: false,
    teamManagement: false,
    apiAccess: false,
    prioritySupport: 'standard',
    charityContribution: 35,
    priceMonthly: 9.99,
    priceYearly: 99.99,
  },
  business: {
    postLength: 5000,
    imagesPerPost: 10,
    videoUploadMB: 500,
    scheduledPostsPerMonth: 500,
    analytics: 'full',
    verifiedBadge: true,
    customProfileUrl: true,
    recruitmentProfiles: true,
    articlePublishing: true,
    teamManagement: true,
    apiAccess: true,
    prioritySupport: 'priority',
    charityContribution: 35,
    priceMonthly: 49.99,
    priceYearly: 499.99,
  },
  enterprise: {
    postLength: 999999,
    imagesPerPost: 999999,
    videoUploadMB: 2048,
    scheduledPostsPerMonth: 999999,
    analytics: 'custom',
    verifiedBadge: true,
    customProfileUrl: true,
    recruitmentProfiles: true,
    articlePublishing: true,
    teamManagement: true,
    apiAccess: true,
    prioritySupport: '24/7',
    charityContribution: 35,
    priceMonthly: 99.99,
    priceYearly: 999.99,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan as Plan] || PLANS.free;
}

export function getUserPlan(user: { plan?: string } | null): Plan {
  const plan = user?.plan || 'free';
  return plan in PLANS ? (plan as Plan) : 'free';
}

// ─── NEW: Feature check helper ────────────────────────────────────
export function hasFeature(
  plan: Plan | string,
  feature: keyof PlanLimits & keyof Omit<PlanLimits, 'priceMonthly' | 'priceYearly' | 'charityContribution' | 'postLength' | 'imagesPerPost' | 'videoUploadMB' | 'scheduledPostsPerMonth' | 'analytics' | 'prioritySupport'>
): boolean {
  const limits = getPlanLimits(plan);
  return limits[feature] === true;
}

// ─── Limit Check Functions ──────────────────────────────────────────
export interface LimitCheckResult {
  allowed: boolean;
  message?: string;
  limit?: number;
}

export function checkPostLength(length: number, plan: string): LimitCheckResult {
  const limits = getPlanLimits(plan);
  if (length > limits.postLength) {
    return {
      allowed: false,
      message: `Post exceeds ${limits.postLength} character limit (${length}). Upgrade to increase.`,
      limit: limits.postLength,
    };
  }
  return { allowed: true };
}

export function checkImagesPerPost(count: number, plan: string): LimitCheckResult {
  const limits = getPlanLimits(plan);
  if (count > limits.imagesPerPost) {
    return {
      allowed: false,
      message: `Maximum ${limits.imagesPerPost} image(s) per post. Upgrade for more.`,
      limit: limits.imagesPerPost,
    };
  }
  return { allowed: true };
}

export function checkVideoSize(fileSizeMB: number, plan: string): LimitCheckResult {
  const limits = getPlanLimits(plan);
  if (fileSizeMB > limits.videoUploadMB) {
    return {
      allowed: false,
      message: `Video exceeds ${limits.videoUploadMB}MB limit. Upgrade for larger uploads.`,
      limit: limits.videoUploadMB,
    };
  }
  return { allowed: true };
}

export function checkScheduledPostsCount(currentCount: number, plan: string): LimitCheckResult {
  const limits = getPlanLimits(plan);
  if (currentCount >= limits.scheduledPostsPerMonth) {
    return {
      allowed: false,
      message: `You've reached your monthly limit of ${limits.scheduledPostsPerMonth} scheduled posts. Upgrade for more.`,
      limit: limits.scheduledPostsPerMonth,
    };
  }
  return { allowed: true };
}
