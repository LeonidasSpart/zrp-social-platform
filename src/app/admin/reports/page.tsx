"use client";

import { useState, useEffect } from "react";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: { username: string; name: string };
  post: { id: string; content: string; author: { username: string } } | null;
  comment: { id: string; content: string; author: { username: string } } | null;
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${statusFilter}&page=${page}`);
      const data = await res.json();
      setReports(data.reports);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter]);

  const updateStatus = async (reportId: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchReports();
    } catch (error) {
      console.error("Error updating report:", error);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Reports</h1>

      <div className="flex gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
          <option value="actioned">Actioned</option>
        </select>
      </div>

      <div className="space-y-2">
        {reports.map((report) => (
          <div key={report.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">{report.reason}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    report.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                    report.status === 'dismissed' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                    report.status === 'actioned' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                    'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                  }`}>{report.status}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Reported by {report.reporter.name || report.reporter.username}
                </p>
                {report.post && (
                  <p className="text-sm text-gray-500 mt-1">Post: "{report.post.content.substring(0, 100)}..."</p>
                )}
                {report.comment && (
                  <p className="text-sm text-gray-500 mt-1">Comment: "{report.comment.content.substring(0, 100)}..."</p>
                )}
                {report.details && (
                  <p className="text-sm text-gray-400 mt-1">Details: {report.details}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{new Date(report.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2 ml-4">
                {report.status === 'pending' && (
                  <>
                    <button onClick={() => updateStatus(report.id, 'dismissed')} className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">Dismiss</button>
                    <button onClick={() => updateStatus(report.id, 'actioned')} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Action</button>
                    <button onClick={() => updateStatus(report.id, 'reviewed')} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Review</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-3 py-1 border rounded disabled:opacity-50">Previous</button>
          <span className="px-3 py-1">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
