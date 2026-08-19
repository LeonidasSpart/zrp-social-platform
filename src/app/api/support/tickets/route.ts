import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { notifyTicketCreated } from '@/lib/notifications';

// ─── GET: List user's own tickets ──────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        replies: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            user: {
              select: {
                username: true,
                avatarUrl: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
    });

    return NextResponse.json(tickets);
  } catch (error) {
    console.error('Error fetching user tickets:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Create a new ticket ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { subject, category, message } = body;

    // Validate required fields
    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: 'Subject and message are required' },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = [
      'GENERAL',
      'ACCOUNT',
      'PRIVACY',
      'CONTENT',
      'MODERATION',
      'PAYMENT',
      'MONETISATION',
      'BUG',
      'FEATURE_REQUEST',
      'SECURITY',
      'OTHER',
    ];

    if (category && !validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Determine priority based on user plan
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });

    const priority =
      user?.plan === 'enterprise'
        ? 'URGENT'
        : user?.plan === 'business'
          ? 'HIGH'
          : 'NORMAL';

    // ─── Create the ticket ──────────────────────────────────────────
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.user.id,
        subject: subject.trim(),
        category: category || 'GENERAL',
        priority,
        message: message.trim(),

        userAgent:
          req.headers.get('user-agent') || undefined,

        // Next.js 15 / NextRequest does not expose req.ip.
        // Prefer proxy-provided client IP headers.
        ipAddress:
          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          req.headers.get('x-real-ip') ||
          undefined,

        referrer:
          req.headers.get('referer') || undefined,
      },

      include: {
        user: {
          select: {
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    // ─── Notify all admins about the new ticket ──────────────────
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    if (admins.length > 0) {
      await notifyTicketCreated({
        ticketId: ticket.id,
        ticketSubject: ticket.subject,
        adminIds: admins.map((a) => a.id),
        fromUserId: session.user.id,
      });
    }

    return NextResponse.json(ticket, {
      status: 201,
    });
  } catch (error) {
    console.error('Error creating ticket:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
