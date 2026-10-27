import "server-only";
import webpush from "web-push";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { layout, sendEmail, escapeHtml } from "../email";

export type NotificationInput = { kind: string; title: string; body?: string; url?: string; email?: boolean };

let vapidReady: boolean | null = null;
function ensureVapid() {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  vapidReady = Boolean(pub && priv);
  if (vapidReady)
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@example.com", pub!, priv!);
  return vapidReady;
}

/**
 * In-app notification for an employee, plus Web Push (and optionally email) on plans with
 * notifications. Never throws: a failed push must not break the action that triggered it.
 */
export async function notify(companyId: string, employeeId: string, input: NotificationInput) {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId, status: { not: "ARCHIVED" } },
      include: { company: true, user: { include: { pushSubscriptions: true } } },
    });
    if (!employee) return;
    await prisma.notification.create({
      data: { companyId, employeeId, kind: input.kind, title: input.title, body: input.body, url: input.url },
    });
    if (!hasFeature(effectivePlan(employee.company), "notifications")) return;
    if (employee.user && ensureVapid()) {
      const payload = JSON.stringify({ title: input.title, body: input.body, url: input.url });
      for (const sub of employee.user.pushSubscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
    if (input.email && employee.email) {
      const url = input.url ? `${process.env.APP_URL ?? "http://localhost:3000"}${input.url}` : undefined;
      await sendEmail({
        to: employee.email,
        subject: `${input.title} · ${employee.company.name}`,
        html: layout(
          input.title,
          `<p>${escapeHtml(input.body ?? "")}</p>`,
          url ? { label: "Open ClockTime", url } : undefined,
        ),
        text: `${input.title}\n${input.body ?? ""}\n${url ?? ""}`,
      });
    }
  } catch (err) {
    console.error("notify failed", err);
  }
}

/**
 * Notify the people responsible for an employee: owners, admins, HR and supervisors, limited to
 * those whose branches include the employee. Pass `roles` to narrow it (e.g. HR for final approval).
 */
export async function notifyManagers(
  companyId: string,
  aboutEmployeeId: string | null,
  input: NotificationInput,
  roles: Role[] = ["OWNER", "ADMIN", "HR", "MANAGER"],
) {
  const managers = await prisma.employee.findMany({
    where: { companyId, status: "ACTIVE", role: { in: roles } },
    include: { locations: true },
  });
  let locationIds: string[] = [];
  if (aboutEmployeeId) {
    locationIds = (await prisma.employeeLocation.findMany({ where: { employeeId: aboutEmployeeId } })).map(
      (l) => l.locationId,
    );
  }
  for (const m of managers) {
    const scoped = (m.role === "MANAGER" || m.role === "TIMEKEEPER") && m.locations.length > 0;
    if (scoped && locationIds.length && !m.locations.some((l) => locationIds.includes(l.locationId)))
      continue;
    if (m.id === aboutEmployeeId) continue;
    await notify(companyId, m.id, input);
  }
}
