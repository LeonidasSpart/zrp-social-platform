import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ArticleEditorForm from "@/components/journalist/ArticleEditorForm";
import ArticleEditorHeader from "@/components/journalist/ArticleEditorHeader";

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
        <ArticleEditorHeader mode="create" />

        <ArticleEditorForm mode="create" canSubmit={user.journalistProfile.status === "VERIFIED"} />
      </div>
    </div>
  );
}
