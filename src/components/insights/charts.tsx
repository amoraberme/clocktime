"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { label: string; scheduled: number; worked: number; overtime: number; cost: number; late: number };

const axis = { fontSize: 12, fill: "var(--muted-foreground)" };

export function HoursChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} unit="h" />
        <Tooltip
          formatter={(v) => `${Number(v).toFixed(1)}h`}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="scheduled" name="Scheduled" fill="var(--input)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="worked" name="Worked" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="overtime" name="Overtime" fill="var(--accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CostChart({ data }: { data: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis
          tick={axis}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `₱${Math.round(v / 1000)}k`}
        />
        <Tooltip
          formatter={(v) => `₱${Number(v).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
        />
        <Line
          type="monotone"
          dataKey="cost"
          name="Labor cost"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
