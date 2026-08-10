import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { notifyTicketReply } from '@/lib/notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get the ticket and verify ownership
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { 
        userId: true, 
        status: true,
        subject: true,
        assignedTo: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Only ticket owner or admin can reply
    if (ticket.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Don't allow replies to closed/resolved tickets (unless admin)
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'This ticket is closed and cannot be replied to' },
          { status: 400 }
        );
      }
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: params.id,
        userId: session.user.id,
        message: message.trim(),
        isInternal: session.user.role === 'ADMIN' ? false : false, // users can't send internal notes
      },
      include: {
        user: { select: { username: true, avatarUrl: true, role: true } },
      },
    });

    // If ticket was OPEN and user replies, update to AWAITING_REPLY (admin needs to respond)
    // If admin replies, update to IN_PROGRESS
    const newStatus = session.user.role === 'ADMIN' ? 'IN_PROGRESS' : 'AWAITING_REPLY';
    await prisma.supportTicket.update({
      where: { id: params.id },
      data: { status: newStatus },
    });

    // ─── 🆕 Notify the other party ──────────────────────────────────
    const isAdminReply = session.user.role === 'ADMIN';
    
    // If admin replies → notify the ticket owner (user)
    // If user replies → notify the assigned admin (or fallback to first admin)
    let recipientId: string | null = null;
    
    if (isAdminReply) {
      // Admin replied → notify the ticket owner
      recipientId = ticket.userId;
    } else {
      // User replied → notify assigned admin, or get any admin
      if (ticket.assignedTo) {
        recipientId = ticket.assignedTo;
      } else {
        // If no admin assigned, find the first admin
        const firstAdmin = await prisma.user.findFirst({
          where: { role: 'ADMIN' },
          select: { id: true },
        });
        if (firstAdmin) recipientId = firstAdmin.id;
      }
    }

    if (recipientId) {
      await notifyTicketReply({
        ticketId: params.id,
        ticketSubject: ticket.subject || 'Support Ticket',
        userId: recipientId,
        fromUserId: session.user.id,
        isAdminReply,
      });
    }

    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    console.error('Error creating reply:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
