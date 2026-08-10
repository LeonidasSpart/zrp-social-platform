import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (assignedTo !== undefined) {
      data.assignedTo = assignedTo || null;
    }
    if (resolution !== undefined) {
      data.resolution = resolution || null;
    }

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

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
