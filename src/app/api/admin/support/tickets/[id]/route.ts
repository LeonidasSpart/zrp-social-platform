// src/app/api/admin/support/tickets/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, username: true, email: true, avatarUrl: true, plan: true, createdAt: true } },
      assignedAdmin: { select: { id: true, username: true, email: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, username: true, avatarUrl: true, role: true } } },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  return NextResponse.json(ticket);
}
