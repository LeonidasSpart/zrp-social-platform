'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/lib/translations';

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
  const { t } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const statusLabels: Record<string, string> = {
    OPEN: t('support.tickets.statusOpen'),
    IN_PROGRESS: t('support.tickets.statusInProgress'),
    AWAITING_REPLY: t('support.tickets.statusAwaitingReply'),
    RESOLVED: t('support.tickets.statusResolved'),
    CLOSED: t('support.tickets.statusClosed'),
  };

  const categoryLabelKeys: Record<string, TranslationKey> = {
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

  const categoryLabel = (category: string) => {
    const key = categoryLabelKeys[category.toUpperCase()];
    return key ? t(key) : category.toLowerCase();
  };

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
    if (!confirm(t('support.tickets.confirmDelete'))) {
      return;
    }

    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTickets(tickets.filter((ticket) => ticket.id !== ticketId));
      } else {
        const data = await res.json();
        alert(data.error || t('support.tickets.errDeleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert(t('support.tickets.errDeleteFailed'));
    }
  };

  if (loading) return <div className="p-8 text-center">{t('support.tickets.loadingTickets')}</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-orbitron text-zrp-charcoal dark:text-white">
            {t('support.tickets.pageTitle')}
          </h1>
          <Link
            href="/support"
            className="px-4 py-2 bg-zrp-red text-white rounded-lg hover:bg-zrp-darkRed transition text-sm font-medium"
          >
            + {t('settings.newTicket')}
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="text-center py-12 text-zrp-charcoal/50 dark:text-white/50">
            <p className="text-lg">{t('support.tickets.noTickets')}</p>
            <Link href="/support" className="text-zrp-red hover:underline mt-2 inline-block">
              {t('support.tickets.createFirst')} →
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
                        {t('support.tickets.categoryPrefix')} {categoryLabel(ticket.category)} · {t('support.tickets.createdPrefix')}{' '}
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[ticket.status] || statusColors.OPEN}`}
                      >
                        {statusLabels[ticket.status] || ticket.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-zrp-charcoal/50 dark:text-white/50">
                        {ticket._count.replies} {t('support.tickets.repliesSuffix')}
                      </span>
                      {isDeletable && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            deleteTicket(ticket.id);
                          }}
                          className="text-red-500 hover:text-red-700 text-xs font-medium mt-1"
                        >
                          🗑️ {t('support.tickets.deleteButton')}
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
