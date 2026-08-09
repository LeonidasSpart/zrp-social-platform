// src/app/api/admin/support/tickets/[id]/resolve/route.ts
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { resolution } = body;

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolution: resolution || null,
    },
  });

  return NextResponse.json(ticket);
}
