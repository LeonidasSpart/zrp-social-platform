// src/app/admin/support/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';

interface Reply {
  id: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  user: { username: string; avatarUrl: string | null; role: string };
}

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  user: { username: string; email: string; avatarUrl: string | null; plan: string };
  assignedAdmin: { username: string } | null;
  replies: Reply[];
}

export default function AdminTicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  useEffect(() => {
    fetchTicket();
  }, [id]);

  const fetchTicket = async () => {
    const res = await fetch(`/api/admin/support/tickets/${id}`);
    const data = await res.json();
    setTicket(data);
    setStatus(data.status);
    setPriority(data.priority);
    setAssignedTo(data.assignedAdmin?.id || '');
    setLoading(false);
  };

  const sendReply = async () => {
    if (!replyMessage.trim()) return;
    const res = await fetch(`/api/admin/support/tickets/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: replyMessage, isInternal }),
    });
    if (res.ok) {
      setReplyMessage('');
      fetchTicket();
    }
  };

  const updateTicket = async () => {
    const res = await fetch(`/api/admin/support/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, priority, assignedTo: assignedTo || null }),
    });
    if (res.ok) fetchTicket();
  };

  const resolveTicket = async () => {
    const resolution = prompt('Resolution notes:');
    if (resolution === null) return;
    const res = await fetch(`/api/admin/support/tickets/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    });
    if (res.ok) fetchTicket();
  };

  if (!session || session.user.role !== 'ADMIN') {
    return <div className="p-8 text-center">Access denied. Admin only.</div>;
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!ticket) return <div className="p-8 text-center">Ticket not found</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="text-zrp-red hover:underline mb-4">
        ← Back to tickets
      </button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-orbitron text-charcoal dark:text-white">{ticket.subject}</h1>
          <div className="flex gap-4 mt-2 text-sm text-charcoal/60 dark:text-white/60">
            <span>From: @{ticket.user.username}</span>
            <span>Plan: {ticket.user.plan}</span>
            <span>Category: {ticket.category}</span>
            <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resolveTicket}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Resolve
          </button>
        </div>
      </div>

      {/* Admin Controls */}
      <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-xl mb-6 border border-silver/30 dark:border-charcoal">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-charcoal/50 dark:text-white/50 block mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-1 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-sm"
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="AWAITING_REPLY">Awaiting Reply</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-charcoal/50 dark:text-white/50 block mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-3 py-1 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-sm"
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-charcoal/50 dark:text-white/50 block mb-1">Assign to</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Admin ID"
              className="px-3 py-1 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-sm"
            />
          </div>
          <button
            onClick={updateTicket}
            className="self-end px-4 py-1 bg-zrp-red text-white rounded-lg hover:bg-dark-red transition"
          >
            Update
          </button>
        </div>
      </div>

      {/* Original Message */}
      <div className="bg-white dark:bg-charcoal/50 p-4 rounded-xl mb-4 border border-silver/30 dark:border-charcoal">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-zrp-red/20 flex items-center justify-center text-zrp-red font-bold">
            {ticket.user.username[0].toUpperCase()}
          </div>
          <span className="font-medium">{ticket.user.username}</span>
          <span className="text-xs text-charcoal/50 dark:text-white/50">{new Date(ticket.createdAt).toLocaleString()}</span>
        </div>
        <p className="text-charcoal/80 dark:text-white/80 whitespace-pre-wrap">{ticket.message}</p>
      </div>

      {/* Replies */}
      <div className="space-y-3 mb-6">
        {ticket.replies.map((reply) => (
          <div
            key={reply.id}
            className={`p-4 rounded-xl border ${reply.isInternal ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-300 dark:border-yellow-700' : 'bg-white dark:bg-charcoal/50 border-silver/30 dark:border-charcoal'}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-zrp-red/20 flex items-center justify-center text-zrp-red font-bold text-sm">
                {reply.user.username[0].toUpperCase()}
              </div>
              <span className="font-medium">{reply.user.username}</span>
              {reply.user.role === 'ADMIN' && <span className="text-xs text-zrp-red font-medium">(Admin)</span>}
              {reply.isInternal && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-0.5 rounded">Internal Note</span>}
              <span className="text-xs text-charcoal/50 dark:text-white/50">{new Date(reply.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-charcoal/80 dark:text-white/80 whitespace-pre-wrap">{reply.message}</p>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <div className="bg-silver/10 dark:bg-charcoal/30 p-4 rounded-xl border border-silver/30 dark:border-charcoal">
        <textarea
          value={replyMessage}
          onChange={(e) => setReplyMessage(e.target.value)}
          placeholder="Type your reply..."
          className="w-full p-3 rounded-lg border border-silver/30 dark:border-charcoal bg-white dark:bg-charcoal/50 text-charcoal dark:text-white resize-none min-h-[100px]"
        />
        <div className="flex justify-between items-center mt-3">
          <label className="flex items-center gap-2 text-sm text-charcoal/60 dark:text-white/60">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
            />
            Internal note (admins only)
          </label>
          <button
            onClick={sendReply}
            disabled={!replyMessage.trim()}
            className="px-6 py-2 bg-zrp-red text-white rounded-lg hover:bg-dark-red transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Reply
          </button>
        </div>
      </div>
    </div>
  );
}
