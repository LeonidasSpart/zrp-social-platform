"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

interface Payment {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  transactionId: string | null;
  status: string;
  createdAt: string;
  user: {
    username: string;
    name: string | null;
    email: string;
  };
}

export default function AdminPayments() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user?.role !== "ADMIN") {
      router.push("/");
      return;
    }
    fetchPayments();
  }, [status, session, router]);

  const fetchPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments");
      if (!res.ok) throw new Error("Failed to fetch payments");
      const data = await res.json();
      setPayments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const verifyPayment = async (paymentId: string) => {
    setProcessing(paymentId);
    try {
      const res = await fetch("/api/admin/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Verification failed");
      }
      // Remove from list or refresh
      await fetchPayments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to verify");
    } finally {
      setProcessing(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Payment Requests
        </h1>
        <span className="text-sm text-gray-500">
          {payments.length} pending
        </span>
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <p>No pending payment requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {payment.user.name || payment.user.username}
                    </span>
                    <span className="text-sm text-gray-500">@{payment.user.username}</span>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {payment.plan}
                    </span>
                    <span className="text-xs text-gray-500">
                      {payment.amount} {payment.currency}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Tx:</span>{" "}
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                      {payment.transactionId || "Not provided"}
                    </code>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(payment.createdAt).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">
                      pending
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => verifyPayment(payment.id)}
                  disabled={processing === payment.id}
                  className="flex-shrink-0 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {processing === payment.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Verify
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
