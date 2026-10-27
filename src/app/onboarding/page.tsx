import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSession } from "@/server/context";
import { prisma } from "@/server/db";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");
  const existing = await prisma.employee.count({
    where: { userId: session.user.id, status: { not: "ARCHIVED" } },
  });
  return (
    <div className="from-primary-soft/60 to-background flex min-h-dvh flex-col items-center bg-gradient-to-b px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-xl">
        <OnboardingForm userName={session.user.name} />
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Joining an existing team instead?{" "}
          <Link href="/join" className="text-primary hover:underline">
            Enter a company code
          </Link>
          {existing > 0 ? (
            <>
              {" · "}
              <Link href="/home" className="text-primary hover:underline">
                Back to my company
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
