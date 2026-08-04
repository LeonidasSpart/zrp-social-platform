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
  charityContribution: number; // percentage
}

export const PLANS: Record<string, PlanLimits> = {
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
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan] || PLANS.free;
}

export function getUserPlan(user: { plan?: string }): string {
  return user?.plan || 'free';
}
