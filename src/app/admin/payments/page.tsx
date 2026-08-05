"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface Payment {
  id: string;
  plan: string;
  amount: number;
  transactionId: string;
  status: string;
  createdAt: string;
  user: { username: string; name: string; email: string };
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const res = await fetch("/api/admin/payments");
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
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
      if (res.ok) {
        fetchPayments();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to verify payment");
      }
    } catch (error) {
      alert("Something went wrong");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-zrp-red" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Payment Requests</h1>
      {payments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No payment requests.</div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <div key={p.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {p.user.name || p.user.username}
                    </span>
                    <span className="text-sm text-gray-500">@{p.user.username}</span>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {p.plan}
                    </span>
                    <span className="text-xs text-gray-500">{p.amount} USDC</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Tx: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{p.transactionId}</code>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  {p.status === "pending" && (
                    <button
                      onClick={() => verifyPayment(p.id)}
                      disabled={processing === p.id}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {processing === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                    </button>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    p.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                    p.status === "verified" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
