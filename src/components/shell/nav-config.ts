import type { Feature } from "@/config/plans";

/** `minRole: "HR"` items show for HR, admins and owners; `"ADMIN"` for admins and owners. */
export type NavItem = {
  href: string;
  label: string;
  icon: string;
  feature?: Feature;
  minRole?: "HR" | "ADMIN";
  /** Hidden from timekeepers, who don't see pay. */
  pay?: boolean;
};

export const MANAGER_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/app/schedule", label: "Schedule", icon: "CalendarDays" },
  { href: "/app/timesheets", label: "Timesheets", icon: "ClipboardCheck" },
  { href: "/app/exceptions", label: "Exceptions", icon: "TriangleAlert", feature: "exceptions" },
  { href: "/app/leave", label: "Time off", icon: "Palmtree", feature: "leave" },
  { href: "/app/team", label: "Team", icon: "Users" },
  { href: "/app/approvals", label: "Approvals", icon: "Inbox", feature: "approvals" },
  { href: "/app/reports", label: "Reports", icon: "FileSpreadsheet", feature: "attendanceReports" },
  { href: "/app/payroll", label: "Payroll", icon: "Wallet", feature: "payroll", minRole: "HR", pay: true },
  { href: "/app/insights", label: "Insights", icon: "ChartColumn", feature: "insights" },
  { href: "/app/locations", label: "Locations", icon: "MapPin", minRole: "ADMIN" },
  { href: "/app/settings", label: "Settings", icon: "Settings", minRole: "HR" },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/me", label: "Clock", icon: "Clock" },
  { href: "/me/schedule", label: "Schedule", icon: "CalendarDays" },
  { href: "/me/timesheet", label: "Hours", icon: "ClipboardList" },
  { href: "/me/leave", label: "Time off", icon: "Palmtree", feature: "leave" },
  { href: "/me/requests", label: "Requests", icon: "Inbox", feature: "approvals" },
  { href: "/me/payslips", label: "Payslips", icon: "Receipt", feature: "payroll" },
];
