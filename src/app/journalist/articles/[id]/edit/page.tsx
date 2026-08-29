import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ArticleEditorForm from "@/components/journalist/ArticleEditorForm";
import ArticleEditorHeader from "@/components/journalist/ArticleEditorHeader";

export default async function EditJournalistArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, journalistProfile: { select: { status: true } } },
  });

  if (!user || user.role !== "JOURNALIST" || !user.journalistProfile) {
    redirect("/journalist");
  }

  const article = await prisma.newsArticle.findUnique({ where: { id } });

  if (!article || article.authorId !== session.user.id) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <ArticleEditorHeader mode="edit" />

        <ArticleEditorForm
          mode="edit"
          canSubmit={user.journalistProfile.status === "VERIFIED"}
          article={{
            id: article.id,
            title: article.title,
            slug: article.slug,
            excerpt: article.excerpt,
            content: article.content,
            coverImage: article.coverImage,
            sourceName: article.sourceName,
            sourceUrl: article.sourceUrl,
            category: article.category,
            status: article.status,
            reviewNote: article.reviewNote,
          }}
        />
      </div>
    </div>
  );
}
