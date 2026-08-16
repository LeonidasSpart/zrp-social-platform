"use client";

import { useEffect, useState } from "react";

interface ActivityHeatmapProps {
  username: string;
}

interface DayCell {
  date: string;
  count: number;
  inRange: boolean;
}

const WEEKS = 53;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildGrid(counts: Record<string, number>): DayCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  const endDay = end.getDay();
  end.setDate(end.getDate() + (6 - endDay)); // pad forward to end of week (Saturday)

  const start = new Date(end);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));

  const weeks: DayCell[][] = [];
  const cursor = new Date(start);

  for (let w = 0; w < WEEKS; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10);
      week.push({
        date: key,
        count: counts[key] || 0,
        inRange: cursor <= today,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function getColorClass(count: number) {
  // Empty cells were bg-gray-100 (#f3f4f6) against a white page - nearly
  // invisible, especially on a phone screen. For any account younger than
  // a year, most of the 53-week grid is legitimately empty (before the
  // account existed), so with that little contrast only the last handful
  // of populated columns were visible at all - making the whole grid look
  // lopsided/broken rather than like a complete, evenly-shaped calendar.
  // gray-200 + a subtle border keeps every cell visible so the full
  // structure always reads correctly, regardless of how sparse the
  // actual activity is.
  if (count === 0) return "bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600";
  if (count <= 1) return "bg-zrp-red/25";
  if (count <= 3) return "bg-zrp-red/50";
  if (count <= 6) return "bg-zrp-red/75";
  return "bg-zrp-red";
}

export default function ActivityHeatmap({ username }: ActivityHeatmapProps) {
  const [weeks, setWeeks] = useState<DayCell[][]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchActivity = async () => {
      try {
        const res = await fetch(`/api/users/${username}/activity`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        const counts: Record<string, number> = {};
        (json.data || []).forEach((d: { date: string; count: number }) => {
          counts[d.date] = d.count;
        });

        setWeeks(buildGrid(counts));
        setTotal(json.totalContributions || 0);
      } catch (error) {
        console.error("Error fetching activity heatmap:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActivity();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return <div className="h-20" />;
  }

  if (weeks.length === 0 || total === 0) return null;

  const monthLabels: { index: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const d = new Date(week[0].date);
    const month = d.getMonth();
    if (month !== lastMonth) {
      monthLabels.push({ index: i, label: MONTH_LABELS[month] });
      lastMonth = month;
    }
  });

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Activity</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {total} post{total === 1 ? "" : "s"} in the last year
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-block min-w-full">
          <div className="flex mb-1 relative h-4">
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-gray-400 dark:text-gray-500"
                style={{ left: `${m.index * 13}px` }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className={`w-[10px] h-[10px] rounded-sm ${
                      day.inRange ? getColorClass(day.count) : "bg-transparent"
                    }`}
                    title={day.inRange ? `${day.count} post${day.count === 1 ? "" : "s"} on ${day.date}` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Less</span>
        <div className="w-[10px] h-[10px] rounded-sm bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600" />
        <div className="w-[10px] h-[10px] rounded-sm bg-zrp-red/25" />
        <div className="w-[10px] h-[10px] rounded-sm bg-zrp-red/50" />
        <div className="w-[10px] h-[10px] rounded-sm bg-zrp-red/75" />
        <div className="w-[10px] h-[10px] rounded-sm bg-zrp-red" />
        <span className="text-[10px] text-gray-400 dark:text-gray-500">More</span>
      </div>
    </div>
  );
}
