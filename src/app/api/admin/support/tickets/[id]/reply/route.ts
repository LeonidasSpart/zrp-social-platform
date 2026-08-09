// src/app/api/admin/support/tickets/[id]/reply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { message, isInternal } = body;

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: params.id,
      userId: session.user.id,
      message,
      isInternal: isInternal || false,
    },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true, role: true } },
    },
  });

  // Update ticket status to IN_PROGRESS if it was OPEN
  await prisma.supportTicket.update({
    where: { id: params.id },
    data: { status: 'IN_PROGRESS' },
  });

  return NextResponse.json(reply);
}
