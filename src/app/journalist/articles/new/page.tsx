import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ArticleEditorForm from "@/components/journalist/ArticleEditorForm";

export default async function NewJournalistArticlePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, journalistProfile: { select: { status: true } } },
  });

  if (!user || user.role !== "JOURNALIST" || !user.journalistProfile) {
    redirect("/journalist");
  }

  if (user.journalistProfile.status === "SUSPENDED") {
    redirect("/journalist");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/journalist"
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-zrp-red dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">New article</h1>

        <ArticleEditorForm mode="create" canSubmit={user.journalistProfile.status === "VERIFIED"} />
      </div>
    </div>
  );
}
