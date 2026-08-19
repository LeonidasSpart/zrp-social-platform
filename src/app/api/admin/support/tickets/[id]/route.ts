import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { notifyTicketResolved, notifyTicketClosed } from '@/lib/notifications';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
            plan: true,
            createdAt: true,
          },
        },
        assignedAdmin: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
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
        },
        feedback: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;
    const session = adminCheck.session;

    const body = await req.json();
    const { status, priority, assignedTo, resolution } = body;

    if (status && !['OPEN', 'IN_PROGRESS', 'AWAITING_REPLY', 'RESOLVED', 'CLOSED'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    if (priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
      return NextResponse.json(
        { error: 'Invalid priority value' },
        { status: 400 }
      );
    }

    // ─── Validate assignedTo ──────────────────────────────────────────
    let assignedToId: string | null = null;
    if (assignedTo !== undefined) {
      if (assignedTo === '' || assignedTo === null) {
        assignedToId = null;
      } else {
        // Check that the assigned user exists
        const assignedUser = await prisma.user.findUnique({
          where: { id: assignedTo },
          select: { id: true },
        });
        if (!assignedUser) {
          return NextResponse.json(
            { error: 'Assigned admin not found' },
            { status: 400 }
          );
        }
        assignedToId = assignedTo;
      }
    }

    // ─── Get current ticket to check for status change ───────────────
    const currentTicket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { status: true, userId: true, subject: true },
    });

    if (!currentTicket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (assignedTo !== undefined) data.assignedTo = assignedToId;
    if (resolution !== undefined) data.resolution = resolution || null;

    if (status === 'RESOLVED') {
      data.resolvedAt = new Date();
    } else if (status && status !== 'RESOLVED') {
      data.resolvedAt = null;
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: params.id },
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            plan: true,
          },
        },
        assignedAdmin: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // ─── 🆕 Notify user on status change ──────────────────────────────
    if (status && status !== currentTicket.status) {
      if (status === 'RESOLVED') {
        await notifyTicketResolved({
          ticketId: params.id,
          ticketSubject: currentTicket.subject || 'Support Ticket',
          userId: currentTicket.userId,
          fromUserId: session.user.id,
        });
      } else if (status === 'CLOSED') {
        await notifyTicketClosed({
          ticketId: params.id,
          ticketSubject: currentTicket.subject || 'Support Ticket',
          userId: currentTicket.userId,
          fromUserId: session.user.id,
        });
      }
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Admin can delete any ticket ────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return adminCheck.response;

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Delete the ticket (replies cascade via onDelete: Cascade)
    await prisma.supportTicket.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
