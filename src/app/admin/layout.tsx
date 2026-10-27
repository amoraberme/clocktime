import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireSuperAdmin } from "@/server/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="bg-sidebar flex flex-wrap items-center gap-6 border-b px-6 py-3 text-white">
        <Logo inverted />
        <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-semibold text-black">Super admin</span>
        <nav className="flex gap-4 text-sm text-white/80">
          <Link href="/admin">Companies</Link>
          <Link href="/admin/statutory">Statutory tables</Link>
          <Link href="/admin/holidays">National holidays</Link>
        </nav>
        <span className="ml-auto text-sm text-white/60">{user.email}</span>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
