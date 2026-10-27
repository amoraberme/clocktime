import type { Feature } from "@/config/plans";

export type NavItem = { href: string; label: string; icon: string; feature?: Feature; adminOnly?: boolean };

export const MANAGER_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/app/schedule", label: "Schedule", icon: "CalendarDays" },
  { href: "/app/timesheets", label: "Timesheets", icon: "ClipboardCheck" },
  { href: "/app/exceptions", label: "Exceptions", icon: "TriangleAlert", feature: "exceptions" },
  { href: "/app/leave", label: "Time off", icon: "Palmtree", feature: "leave" },
  { href: "/app/team", label: "Team", icon: "Users" },
  { href: "/app/payroll", label: "Payroll", icon: "Wallet", feature: "payroll", adminOnly: true },
  { href: "/app/insights", label: "Insights", icon: "ChartColumn", feature: "insights" },
  { href: "/app/locations", label: "Locations", icon: "MapPin", adminOnly: true },
  { href: "/app/settings", label: "Settings", icon: "Settings", adminOnly: true },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/me", label: "Clock", icon: "Clock" },
  { href: "/me/schedule", label: "Schedule", icon: "CalendarDays" },
  { href: "/me/timesheet", label: "Hours", icon: "ClipboardList" },
  { href: "/me/leave", label: "Time off", icon: "Palmtree", feature: "leave" },
  { href: "/me/payslips", label: "Payslips", icon: "Receipt", feature: "payroll" },
];
