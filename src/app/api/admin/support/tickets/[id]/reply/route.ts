import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { notifyTicketReply } from '@/lib/notifications';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;
    const session = adminCheck.session;

    const body = await req.json().catch(() => ({}));
    const { message, isInternal } = body;

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    const internal = isInternal === true;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { userId: true, subject: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: params.id,
        userId: session.user.id,
        message: message.trim(),
        isInternal: internal,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    await prisma.supportTicket.update({
      where: { id: params.id },
      data: { status: 'IN_PROGRESS' },
    });

    // A public staff reply must reach the ticket owner - the admin ticket
    // view posts here (not to /api/support/tickets/[id]/reply, which is
    // the only route that used to notify), so without this the user was
    // never told support had answered. Internal notes stay silent.
    if (!internal && ticket.userId !== session.user.id) {
      await notifyTicketReply({
        ticketId: params.id,
        ticketSubject: ticket.subject || 'Support Ticket',
        userId: ticket.userId,
        fromUserId: session.user.id,
        isAdminReply: true,
      });
    }

    return NextResponse.json(reply);
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
