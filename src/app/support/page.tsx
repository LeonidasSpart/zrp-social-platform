'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SupportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    subject: '',
    category: 'GENERAL',
    message: '',
  });

  if (status === 'loading') return <div className="p-8 text-center">Loading...</div>;
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
      if (!res.ok) throw new Error(data.error || 'Failed to create ticket');
      router.push('/support/tickets');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-deep-black font-inter py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-orbitron text-charcoal dark:text-white mb-6">
          Contact Support
        </h1>
        <p className="text-charcoal/70 dark:text-white/70 mb-6">
          Have an issue or question? Submit a ticket and we'll get back to you.
        </p>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-charcoal dark:text-white/80 mb-1">
              Subject <span className="text-zrp-red">*</span>
            </label>
            <input
              type="text"
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full px-4 py-2 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
              placeholder="Brief summary of your issue"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal dark:text-white/80 mb-1">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-4 py-2 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            >
              <option value="GENERAL">General</option>
              <option value="ACCOUNT">Account</option>
              <option value="PRIVACY">Privacy</option>
              <option value="CONTENT">Content</option>
              <option value="MODERATION">Moderation</option>
              <option value="PAYMENT">Payment</option>
              <option value="MONETISATION">Monetisation</option>
              <option value="BUG">Bug</option>
              <option value="FEATURE_REQUEST">Feature Request</option>
              <option value="SECURITY">Security</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-charcoal dark:text-white/80 mb-1">
              Message <span className="text-zrp-red">*</span>
            </label>
            <textarea
              required
              rows={6}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-4 py-2 border border-silver/30 dark:border-charcoal rounded-lg bg-white dark:bg-charcoal/50 text-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
              placeholder="Describe your issue in detail..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-zrp-red text-white font-semibold rounded-lg hover:bg-dark-red transition disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </form>

        <p className="mt-4 text-sm text-charcoal/50 dark:text-white/50 text-center">
          Your ticket will be reviewed within 24-48 hours. You can track its status
          in the <a href="/support/tickets" className="text-zrp-red hover:underline">My Tickets</a> page.
        </p>
      </div>
    </div>
  );
}
