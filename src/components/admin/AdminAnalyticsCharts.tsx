"use client";

// Split out of admin/analytics/page.tsx so recharts (a genuinely heavy
// charting lib) loads in its own on-demand chunk via next/dynamic, instead
// of bundling into the admin analytics route's initial client JS
// unconditionally.
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type DailyPoint = { date: string; posts: number; comments: number; likes: number };
type SignupPoint = { date: string; signups: number };
type PieSlice = { name: string; value: number };
type CountryBar = { label: string; count: number };

export function DailyActivityChart({
  chartData,
  labels,
}: {
  chartData: DailyPoint[];
  labels: { posts: string; comments: string; likes: string };
}) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="posts" stroke="#FF2D2D" name={labels.posts} />
        <Line type="monotone" dataKey="comments" stroke="#8B5CF6" name={labels.comments} />
        <Line type="monotone" dataKey="likes" stroke="#EC4899" name={labels.likes} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function UserGrowthChart({
  chartData,
  newUsersLabel,
}: {
  chartData: SignupPoint[];
  newUsersLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="signups" fill="#FF2D2D" name={newUsersLabel} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EngagementPieChart({ pieData, colors }: { pieData: PieSlice[]; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" dataKey="value" label>
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CountryBarChart({ data, usersLabel }: { data: CountryBar[]; usersLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#FF2D2D" name={usersLabel} />
      </BarChart>
    </ResponsiveContainer>
  );
}
