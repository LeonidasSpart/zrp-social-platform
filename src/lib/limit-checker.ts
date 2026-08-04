import { getPlanLimits } from './limits';

export interface LimitCheckResult {
  allowed: boolean;
  message?: string;
  limit?: number;
}

export function checkPostLength(content: string, plan: string): LimitCheckResult {
  const limits = getPlanLimits(plan);
  if (content.length > limits.postLength) {
    return {
      allowed: false,
      message: `Post exceeds ${limits.postLength} character limit (${content.length}). Upgrade to increase.`,
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
