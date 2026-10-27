import type { Metadata } from "next";
import QRCode from "qrcode";
import { LogoMark } from "@/components/logo";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print badges" };

/** Printable QR badges (credit-card sized) for kiosk punching. */
export default async function BadgesPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const ctx = await requireContext("MANAGER");
  const { ids } = await searchParams;
  const employees = await ctx.db.employee.findMany({
    where: { status: { not: "ARCHIVED" }, ...(ids ? { id: { in: ids.split(",") } } : {}) },
    include: { position: { select: { name: true } } },
    orderBy: [{ firstName: "asc" }],
  });
  const badges = await Promise.all(
    employees.map(async (e) => ({
      e,
      qr: await QRCode.toDataURL(`clocktime:${e.qrToken}`, { margin: 0, width: 300 }),
    })),
  );
  return (
    <main className="bg-white p-6 text-black">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm">{badges.length} badge(s). Print on card stock and cut along the borders.</p>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {badges.map(({ e, qr }) => (
          <div
            key={e.id}
            className="flex break-inside-avoid flex-col items-center rounded-xl border-2 border-dashed border-slate-300 p-4 text-center"
          >
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-800">
              <LogoMark className="size-5" /> {ctx.company.name}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" className="size-32" />
            <p className="mt-2 font-semibold">{fullName(e)}</p>
            <p className="text-xs text-slate-500">
              #{e.employeeNo} {e.position ? `· ${e.position.name}` : ""}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
