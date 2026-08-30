// src/app/admin/support/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/lib/translations';

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

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  OPEN: 'support.tickets.statusOpen',
  IN_PROGRESS: 'support.tickets.statusInProgress',
  AWAITING_REPLY: 'support.tickets.statusAwaitingReply',
  RESOLVED: 'support.tickets.statusResolved',
  CLOSED: 'support.tickets.statusClosed',
};

const PRIORITY_LABEL_KEYS: Record<string, TranslationKey> = {
  LOW: 'support.ticketDetail.priorityLow',
  NORMAL: 'support.ticketDetail.priorityNormal',
  HIGH: 'support.ticketDetail.priorityHigh',
  URGENT: 'support.ticketDetail.priorityUrgent',
};

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  GENERAL: 'support.categoryGeneral',
  ACCOUNT: 'support.categoryAccount',
  PRIVACY: 'support.categoryPrivacy',
  CONTENT: 'support.categoryContent',
  MODERATION: 'support.categoryModeration',
  PAYMENT: 'support.categoryPayment',
  MONETISATION: 'support.categoryMonetisation',
  BUG: 'support.categoryBug',
  FEATURE_REQUEST: 'support.categoryFeatureRequest',
  SECURITY: 'support.categorySecurity',
  OTHER: 'support.categoryOther',
};

export default function AdminSupportPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
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
    return <div className="p-8 text-center">{t('admin.accessDenied')}</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-orbitron text-zrp-charcoal dark:text-white">{t('adminSupport.title')}</h1>
        <div className="flex gap-2">
          <select
            className="px-3 py-2 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-sm"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">{t('adminSupport.allStatus')}</option>
            <option value="OPEN">{t('support.tickets.statusOpen')}</option>
            <option value="IN_PROGRESS">{t('support.tickets.statusInProgress')}</option>
            <option value="AWAITING_REPLY">{t('support.tickets.statusAwaitingReply')}</option>
            <option value="RESOLVED">{t('support.tickets.statusResolved')}</option>
            <option value="CLOSED">{t('support.tickets.statusClosed')}</option>
          </select>
          <select
            className="px-3 py-2 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-sm"
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          >
            <option value="">{t('adminSupport.allPriority')}</option>
            <option value="LOW">{t('support.ticketDetail.priorityLow')}</option>
            <option value="NORMAL">{t('support.ticketDetail.priorityNormal')}</option>
            <option value="HIGH">{t('support.ticketDetail.priorityHigh')}</option>
            <option value="URGENT">{t('support.ticketDetail.priorityUrgent')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">{t('support.loading')}</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 text-zrp-charcoal/50 dark:text-white/50">{t('adminSupport.noTicketsFound')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zrp-charcoal/60 dark:text-white/60 border-b border-zrp-silver/30 dark:border-zrp-charcoal">
              <tr>
                <th className="py-3 px-4">{t('adminSupport.colTicket')}</th>
                <th className="py-3 px-4">{t('adminSupport.colUser')}</th>
                <th className="py-3 px-4">{t('support.categoryLabel')}</th>
                <th className="py-3 px-4">{t('adminSupport.colPriority')}</th>
                <th className="py-3 px-4">{t('adminSupport.colStatus')}</th>
                <th className="py-3 px-4">{t('adminSupport.colReplies')}</th>
                <th className="py-3 px-4">{t('adminSupport.colAssigned')}</th>
                <th className="py-3 px-4">{t('adminSupport.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-zrp-silver/20 dark:border-zrp-charcoal/50 hover:bg-zrp-silver/10 dark:hover:bg-zrp-charcoal/30 transition">
                  <td className="py-3 px-4">
                    <Link href={`/admin/support/${ticket.id}`} className="text-zrp-red hover:underline font-medium">
                      {ticket.subject.length > 40 ? ticket.subject.slice(0, 40) + '...' : ticket.subject}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{ticket.user.username}</div>
                    <div className="text-xs text-zrp-charcoal/50 dark:text-white/50">{ticket.user.plan}</div>
                  </td>
                  <td className="py-3 px-4">{t(CATEGORY_LABEL_KEYS[ticket.category] ?? 'support.categoryOther')}</td>
                  <td className={`py-3 px-4 ${priorityColors[ticket.priority as keyof typeof priorityColors]}`}>
                    {t(PRIORITY_LABEL_KEYS[ticket.priority] ?? 'support.ticketDetail.priorityNormal')}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColors[ticket.status as keyof typeof statusColors]}`}>
                      {t(STATUS_LABEL_KEYS[ticket.status] ?? 'support.tickets.statusOpen')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">{ticket._count.replies}</td>
                  <td className="py-3 px-4">{ticket.assignedAdmin?.username || '-'}</td>
                  <td className="py-3 px-4 text-zrp-charcoal/50 dark:text-white/50 text-xs">
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
