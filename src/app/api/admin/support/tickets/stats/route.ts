import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    const [open, inProgress, awaitingReply, resolved, total] = await Promise.all([
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { status: 'AWAITING_REPLY' } }),
      prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      prisma.supportTicket.count(),
    ]);

    return NextResponse.json({ open, inProgress, awaitingReply, resolved, total });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
