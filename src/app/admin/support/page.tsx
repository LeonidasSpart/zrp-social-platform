// src/app/admin/support/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  user: { username: string; email: string; plan: string };
  assignedAdmin: { username: string } | null;
  _count: { replies: number };
}

const statusColors = {
  OPEN: 'bg-zrp-red/10 text-zrp-red border-zrp-red/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  AWAITING_REPLY: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  RESOLVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  CLOSED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const priorityColors = {
  LOW: 'text-gray-400',
  NORMAL: 'text-blue-400',
  HIGH: 'text-orange-400',
  URGENT: 'text-zrp-red font-bold',
};

export default function AdminSupportPage() {
  const { data: session } = useSession();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', priority: '', category: '' });

  useEffect(() => {
    fetchTickets();
  }, [filters]);

  const fetchTickets = async () => {
    setLoading(true);
    const params = new URLSearchParams(filters);
    const res = await fetch(`/api/admin/support/tickets?${params}`);
    const data = await res.json();
    setTickets(data.tickets || []);
    setLoading(false);
  };

  if (!session || session.user.role !== 'ADMIN') {
    return <div className="p-8 text-center">Access denied. Admin only.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-orbitron text-charcoal dark:text-white">Support Tickets</h1>
        <div className="flex gap-2">
          <select
            className="px-3 py-2 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-sm"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="AWAITING_REPLY">Awaiting Reply</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            className="px-3 py-2 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-sm"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          >
            <option value="">All Priority</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-charcoal/50 dark:text-white/50">No tickets found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-charcoal/60 dark:text-white/60 border-b border-silver/30 dark:border-charcoal">
              <tr>
                <th className="py-3 px-4">Ticket</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Replies</th>
                <th className="py-3 px-4">Assigned</th>
                <th className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-silver/20 dark:border-charcoal/50 hover:bg-silver/10 dark:hover:bg-charcoal/30 transition">
                  <td className="py-3 px-4">
                    <Link href={`/admin/support/${ticket.id}`} className="text-zrp-red hover:underline font-medium">
                      {ticket.subject.length > 40 ? ticket.subject.slice(0, 40) + '...' : ticket.subject}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{ticket.user.username}</div>
                    <div className="text-xs text-charcoal/50 dark:text-white/50">{ticket.user.plan}</div>
                  </td>
                  <td className="py-3 px-4 capitalize">{ticket.category.toLowerCase()}</td>
                  <td className={`py-3 px-4 ${priorityColors[ticket.priority as keyof typeof priorityColors]}`}>
                    {ticket.priority}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[ticket.status as keyof typeof statusColors]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">{ticket._count.replies}</td>
                  <td className="py-3 px-4">{ticket.assignedAdmin?.username || '—'}</td>
                  <td className="py-3 px-4 text-charcoal/50 dark:text-white/50 text-xs">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
