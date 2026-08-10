'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Reply {
  id: string;
  message: string;
  createdAt: string;
  isInternal: boolean;
  user: { username: string; avatarUrl: string | null; role: string };
}

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  userId: string; // ✅ added – the foreign key to the user
  user: { username: string; email: string; avatarUrl: string | null; plan: string };
  assignedAdmin: { username: string; avatarUrl: string | null } | null;
  replies: Reply[];
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-zrp-red/10 text-zrp-red border-zrp-red/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  AWAITING_REPLY: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  RESOLVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  CLOSED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyMessage, setReplyMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }
    fetchTicket();
  }, [session, status, id]);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const data = await res.json();
      setTicket(data);
    } catch (error) {
      console.error('Failed to fetch ticket', error);
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage }),
      });
      if (res.ok) {
        setReplyMessage('');
        fetchTicket();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!ticket) return <div className="p-8 text-center">Ticket not found</div>;

  // ✅ fix: use ticket.userId (the direct foreign key) instead of ticket.user?.id
  const isOwner = session?.user?.id === ticket.userId;

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link href="/support/tickets" className="text-zrp-red hover:underline mb-4 inline-block">
          ← Back to my tickets
        </Link>

        {/* Ticket header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-orbitron text-zrp-charcoal dark:text-white">
              {ticket.subject}
            </h1>
            <div className="flex flex-wrap gap-3 mt-2 text-sm text-zrp-charcoal/60 dark:text-white/60">
              <span>Status: <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[ticket.status]}`}>{ticket.status}</span></span>
              <span>Priority: {ticket.priority}</span>
              <span>Category: {ticket.category}</span>
              <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Original message */}
        <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-xl mb-6 border border-zrp-silver/30 dark:border-zrp-charcoal">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-zrp-red/20 flex items-center justify-center text-zrp-red font-bold text-sm">
              {ticket.user.username[0].toUpperCase()}
            </div>
            <span className="font-medium">{ticket.user.username}</span>
            <span className="text-xs text-zrp-charcoal/50 dark:text-white/50">{new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-zrp-charcoal/80 dark:text-white/80 whitespace-pre-wrap">{ticket.message}</p>
        </div>

        {/* Replies */}
        <div className="space-y-3 mb-6">
          {ticket.replies.map((reply) => (
            <div
              key={reply.id}
              className={`p-4 rounded-xl border ${reply.isInternal ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700' : 'bg-white dark:bg-zrp-charcoal/50 border-zrp-silver/30 dark:border-zrp-charcoal'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-zrp-red/20 flex items-center justify-center text-zrp-red font-bold text-sm">
                  {reply.user.username[0].toUpperCase()}
                </div>
                <span className="font-medium">{reply.user.username}</span>
                {reply.user.role === 'ADMIN' && <span className="text-xs text-zrp-red font-medium">(Support)</span>}
                {reply.isInternal && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-0.5 rounded">Internal Note</span>}
                <span className="text-xs text-zrp-charcoal/50 dark:text-white/50">{new Date(reply.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-zrp-charcoal/80 dark:text-white/80 whitespace-pre-wrap">{reply.message}</p>
            </div>
          ))}
        </div>

        {/* Reply form – only if ticket is not closed/resolved (or always for admins) */}
        {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
          <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
            <textarea
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              placeholder="Type your reply..."
              className="w-full p-3 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal bg-white dark:bg-zrp-charcoal/50 text-zrp-charcoal dark:text-white resize-none min-h-[100px]"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={sendReply}
                disabled={!replyMessage.trim() || submitting}
                className="px-6 py-2 bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </div>
        )}

        {ticket.status === 'RESOLVED' && (
          <div className="text-center text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
            ✅ This ticket has been resolved. If you still need help, you can create a new ticket.
          </div>
        )}
        {ticket.status === 'CLOSED' && (
          <div className="text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            🔒 This ticket is closed and can no longer be replied to.
          </div>
        )}
      </div>
    </div>
  );
}
