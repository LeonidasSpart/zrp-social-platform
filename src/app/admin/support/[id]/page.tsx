// src/app/admin/support/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/lib/translations';

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
  const { t } = useLanguage();
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
    const resolution = prompt(t('adminTicket.resolutionPrompt'));
    if (resolution === null) return;
    const res = await fetch(`/api/admin/support/tickets/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    });
    if (res.ok) fetchTicket();
  };

  if (!session || session.user.role !== 'ADMIN') {
    return <div className="p-8 text-center">{t('admin.accessDenied')}</div>;
  }

  if (loading) return <div className="p-8 text-center">{t('support.loading')}</div>;
  if (!ticket) return <div className="p-8 text-center">{t('adminTicket.ticketNotFound')}</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="text-zrp-red hover:underline mb-4">
        ← {t('adminTicket.backToTickets')}
      </button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-orbitron text-zrp-charcoal dark:text-white">{ticket.subject}</h1>
          <div className="flex gap-4 mt-2 text-sm text-zrp-charcoal/60 dark:text-white/60">
            <span>{t('adminTicket.fromLabel', { username: ticket.user.username })}</span>
            <span>{t('adminTicket.planLabel', { plan: ticket.user.plan })}</span>
            <span>{t('support.ticketDetail.categoryLabel')} {t(CATEGORY_LABEL_KEYS[ticket.category] ?? 'support.categoryOther')}</span>
            <span>{t('support.ticketDetail.createdLabel')} {new Date(ticket.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resolveTicket}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            {t('adminTicket.resolve')}
          </button>
        </div>
      </div>

      {/* Admin Controls */}
      <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-xl mb-6 border border-zrp-silver/30 dark:border-zrp-charcoal">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-zrp-charcoal/50 dark:text-white/50 block mb-1">{t('adminTicket.statusFieldLabel')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-1 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-sm"
            >
              <option value="OPEN">{t('support.tickets.statusOpen')}</option>
              <option value="IN_PROGRESS">{t('support.tickets.statusInProgress')}</option>
              <option value="AWAITING_REPLY">{t('support.tickets.statusAwaitingReply')}</option>
              <option value="RESOLVED">{t('support.tickets.statusResolved')}</option>
              <option value="CLOSED">{t('support.tickets.statusClosed')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zrp-charcoal/50 dark:text-white/50 block mb-1">{t('adminTicket.priorityFieldLabel')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="px-3 py-1 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-sm"
            >
              <option value="LOW">{t('support.ticketDetail.priorityLow')}</option>
              <option value="NORMAL">{t('support.ticketDetail.priorityNormal')}</option>
              <option value="HIGH">{t('support.ticketDetail.priorityHigh')}</option>
              <option value="URGENT">{t('support.ticketDetail.priorityUrgent')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zrp-charcoal/50 dark:text-white/50 block mb-1">{t('adminTicket.assignTo')}</label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder={t('adminTicket.adminIdPlaceholder')}
              className="px-3 py-1 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-sm"
            />
          </div>
          <button
            onClick={updateTicket}
            className="self-end px-4 py-1 bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition"
          >
            {t('adminTicket.update')}
          </button>
        </div>
      </div>

      {/* Original Message */}
      <div className="bg-white dark:bg-zrp-charcoal/50 p-4 rounded-xl mb-4 border border-zrp-silver/30 dark:border-zrp-charcoal">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-zrp-red/20 flex items-center justify-center text-zrp-red font-bold">
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
              {reply.user.role === 'ADMIN' && <span className="text-xs text-zrp-red font-medium">{t('adminTicket.adminBadge')}</span>}
              {reply.isInternal && <span className="text-xs bg-yellow-200 dark:bg-yellow-800 px-2 py-0.5 rounded">{t('support.ticketDetail.internalNote')}</span>}
              <span className="text-xs text-zrp-charcoal/50 dark:text-white/50">{new Date(reply.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-zrp-charcoal/80 dark:text-white/80 whitespace-pre-wrap">{reply.message}</p>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
        <textarea
          value={replyMessage}
          onChange={(e) => setReplyMessage(e.target.value)}
          placeholder={t('support.ticketDetail.replyPlaceholder')}
          className="w-full p-3 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal bg-white dark:bg-zrp-charcoal/50 text-zrp-charcoal dark:text-white resize-none min-h-[100px]"
        />
        <div className="flex justify-between items-center mt-3">
          <label className="flex items-center gap-2 text-sm text-zrp-charcoal/60 dark:text-white/60">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
            />
            {t('adminTicket.internalNoteCheckbox')}
          </label>
          <button
            onClick={sendReply}
            disabled={!replyMessage.trim()}
            className="px-6 py-2 bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('support.ticketDetail.sendReply')}
          </button>
        </div>
      </div>
    </div>
  );
}
