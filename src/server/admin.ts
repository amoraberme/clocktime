import "server-only";
import { notFound } from "next/navigation";
import { getSession, isSuperAdmin } from "./context";

/** ClockTime staff only (SUPER_ADMIN_EMAILS). Others get a 404 so the console isn't discoverable. */
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.user.email)) notFound();
  return session.user;
}
