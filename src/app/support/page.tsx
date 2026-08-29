'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SupportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    subject: '',
    category: 'GENERAL',
    message: '',
  });

  if (status === 'loading') return <div className="p-8 text-center">{t('support.loading')}</div>;

  if (!session) {
    router.push('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('support.errCreateFailed'));
      }

      router.push('/support/tickets');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-orbitron text-zrp-charcoal dark:text-white mb-6">
          {t('support.pageTitle')}
        </h1>

        <p className="text-zrp-charcoal/70 dark:text-white/70 mb-6">
          {t('support.pageSubtitle')}
        </p>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zrp-charcoal dark:text-white/80 mb-1">
              {t('support.subjectLabel')} <span className="text-zrp-red">*</span>
            </label>

            <input
              type="text"
              required
              value={form.subject}
              onChange={(e) =>
                setForm({ ...form, subject: e.target.value })
              }
              className="w-full px-4 py-2 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-zrp-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
              placeholder={t('support.subjectPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zrp-charcoal dark:text-white/80 mb-1">
              {t('support.categoryLabel')}
            </label>

            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
              className="w-full px-4 py-2 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-zrp-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            >
              <option value="GENERAL">{t('support.categoryGeneral')}</option>
              <option value="ACCOUNT">{t('support.categoryAccount')}</option>
              <option value="PRIVACY">{t('support.categoryPrivacy')}</option>
              <option value="CONTENT">{t('support.categoryContent')}</option>
              <option value="MODERATION">{t('support.categoryModeration')}</option>
              <option value="PAYMENT">{t('support.categoryPayment')}</option>
              <option value="MONETISATION">{t('support.categoryMonetisation')}</option>
              <option value="BUG">{t('support.categoryBug')}</option>
              <option value="FEATURE_REQUEST">{t('support.categoryFeatureRequest')}</option>
              <option value="SECURITY">{t('support.categorySecurity')}</option>
              <option value="OTHER">{t('support.categoryOther')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zrp-charcoal dark:text-white/80 mb-1">
              {t('support.messageLabel')} <span className="text-zrp-red">*</span>
            </label>

            <textarea
              required
              rows={6}
              value={form.message}
              onChange={(e) =>
                setForm({ ...form, message: e.target.value })
              }
              className="w-full px-4 py-2 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-lg bg-white dark:bg-zrp-charcoal/50 text-zrp-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
              placeholder={t('support.messagePlaceholder')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-zrp-red text-white font-semibold rounded-lg hover:bg-zrp-darkRed transition disabled:opacity-50"
          >
            {loading ? t('support.submitting') : t('support.submitTicket')}
          </button>
        </form>

        <p className="mt-4 text-sm text-zrp-charcoal/50 dark:text-white/50 text-center">
          {t('support.footerNoteP1')}{' '}
          <Link
            href="/support/tickets"
            className="text-zrp-red hover:underline"
          >
            {t('support.footerNoteLink')}
          </Link>{' '}
          {t('support.footerNoteP2')}
        </p>
      </div>
    </div>
  );
}
