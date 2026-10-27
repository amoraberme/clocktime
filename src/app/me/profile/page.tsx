import type { Metadata } from "next";
import { PhoneForm, PinForm, PushToggle } from "@/components/me/profile-forms";
import { NotificationsList } from "@/components/me/notifications-list";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Avatar } from "@/components/ui/misc";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireContext();
  const { welcome } = await searchParams;
  const notifications = await ctx.db.notification.findMany({
    where: { employeeId: ctx.employee.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <div className="space-y-5">
      {welcome ? (
        <Alert tone="success" title={`Welcome to ${ctx.company.name}!`}>
          You&apos;re all set. Add ClockTime to your home screen, then clock in from the Clock tab.
        </Alert>
      ) : null}
      <InstallPrompt />
      <div className="flex items-center gap-3">
        <Avatar
          firstName={ctx.employee.firstName}
          lastName={ctx.employee.lastName}
          color={ctx.employee.color}
          size="lg"
        />
        <div>
          <h1 className="text-xl font-semibold">{fullName(ctx.employee)}</h1>
          <p className="text-muted-foreground text-sm">
            {ctx.user.email} · #{ctx.employee.employeeNo}
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
          <NotificationsList
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              url: n.url,
              read: !!n.readAt,
              at: n.createdAt.toISOString(),
            }))}
            timezone={ctx.company.timezone}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PhoneForm phone={ctx.employee.phone ?? ""} />
          <PinForm hasPin={!!ctx.employee.pinHash} />
        </CardContent>
      </Card>
    </div>
  );
}
