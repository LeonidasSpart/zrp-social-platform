import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import VerifiedBadge from "@/components/VerifiedBadge";

interface AdminUserIdentityUser {
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  badgeType?: string | null;
}

/**
 * Shared identity row for admin review queues (ambassadors, upgrade
 * requests, payments, help withdrawals, ...): real avatar, display
 * name + @username both linking to the user's real profile, and the
 * same VerifiedBadge every other admin/profile surface uses - never a
 * hardcoded or fabricated badge.
 *
 * This is the fix for the "missing avatar / non-clickable profile /
 * missing badge" defect found across several admin list rows - reuse
 * it rather than re-hand-rolling the name/username/badge markup.
 */
export default function AdminUserIdentity({
  user,
  extra,
}: {
  user: AdminUserIdentityUser;
  /** Extra chips (status pill, plan, amount, ...) rendered after the badge. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link href={`/profile/${user.username}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
        <Avatar src={user.avatarUrl} alt="" className="h-9 w-9" />
      </Link>
      <Link
        href={`/profile/${user.username}`}
        className="font-medium text-gray-900 hover:underline dark:text-white"
      >
        {user.name || user.username}
      </Link>
      <Link
        href={`/profile/${user.username}`}
        className="text-sm text-gray-500 hover:underline dark:text-gray-400"
      >
        @<bdi>{user.username}</bdi>
      </Link>
      {user.badgeType && <VerifiedBadge badgeType={user.badgeType} />}
      {extra}
    </div>
  );
}
