import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { notifyTicketResolved } from '@/lib/notifications';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    const body = await req.json().catch(() => ({}));
    const { resolution } = body;

    const current = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { status: true, userId: true, subject: true },
    });
    if (!current) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: params.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolution: typeof resolution === 'string' && resolution.trim() ? resolution.trim() : null,
      },
    });

    // Same user notification PUT /api/admin/support/tickets/[id] sends on
    // a status change to RESOLVED - the admin UI's "Resolve" button posts
    // here, so without it the user was never told.
    if (current.status !== 'RESOLVED') {
      await notifyTicketResolved({
        ticketId: params.id,
        ticketSubject: current.subject || 'Support Ticket',
        userId: current.userId,
        fromUserId: adminCheck.session.user.id,
      });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error resolving ticket:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
