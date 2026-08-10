'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  _count: { replies: number };
  replies: { user: { username: string; avatarUrl: string | null; role: string } }[];
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-zrp-red/10 text-zrp-red border-zrp-red/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  AWAITING_REPLY: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  RESOLVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  CLOSED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export default function MyTicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    fetchTickets();
  }, [session, status]);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/support/tickets');
      const data = await res.json();
      setTickets(data);
    } catch (error) {
      console.error('Failed to fetch tickets', error);
    } finally {
      setLoading(false);
    }
  };

  // ─── Delete a ticket ──────────────────────────────────────────────
  const deleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTickets(tickets.filter((t) => t.id !== ticketId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete ticket');
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert('Failed to delete ticket');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading your tickets...</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-orbitron text-zrp-charcoal dark:text-white">
            My Support Tickets
          </h1>
          <Link
            href="/support"
            className="px-4 py-2 bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition text-sm font-medium"
          >
            + New Ticket
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="text-center py-12 text-zrp-charcoal/50 dark:text-white/50">
            <p className="text-lg">You haven't created any tickets yet.</p>
            <Link href="/support" className="text-zrp-red hover:underline mt-2 inline-block">
              Create your first ticket →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => {
              const isDeletable = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

              return (
                <div
                  key={ticket.id}
                  className="p-4 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-xl hover:bg-zrp-silver/10 dark:hover:bg-zrp-charcoal/30 transition"
                >
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/support/tickets/${ticket.id}`}
                      className="flex-1"
                    >
                      <h3 className="font-semibold text-zrp-charcoal dark:text-white">
                        {ticket.subject}
                      </h3>
                      <p className="text-sm text-zrp-charcoal/60 dark:text-white/60">
                        Category: {ticket.category.toLowerCase()} · Created:{' '}
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[ticket.status] || statusColors.OPEN}`}
                      >
                        {ticket.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-zrp-charcoal/50 dark:text-white/50">
                        {ticket._count.replies} replies
                      </span>
                      {isDeletable && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            deleteTicket(ticket.id);
                          }}
                          className="text-red-500 hover:text-red-700 text-xs font-medium mt-1"
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
