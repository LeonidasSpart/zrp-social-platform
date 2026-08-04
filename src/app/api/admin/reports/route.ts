// src/app/api/admin/reports/route.ts – updated section

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "pending";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where: Prisma.ReportWhereInput = {};
    // Only apply status filter if it's NOT "all"
    if (statusParam !== "all") {
      where.status = statusParam as any; // valid enum: pending, reviewed, dismissed
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" }, // 👈 changed to desc (newest first)
        include: {
          reporter: {
            select: { id: true, username: true, name: true },
          },
          post: {
            include: {
              author: { select: { id: true, username: true, name: true } },
            },
          },
          comment: {
            include: {
              author: { select: { id: true, username: true, name: true } },
            },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
