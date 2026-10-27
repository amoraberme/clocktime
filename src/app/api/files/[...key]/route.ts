import { getContextOrThrow } from "@/server/context";
import { storage } from "@/server/storage";

/** Serves locally stored files (dev / single-server installs). Keys are prefixed with the company id. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  let ctx;
  try {
    ctx = await getContextOrThrow();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!path.startsWith(`${ctx.company.id}/`)) return new Response("Not found", { status: 404 });
  // Employees may only fetch their own payslips; photos and other files are manager-only.
  const own = path.startsWith(`${ctx.company.id}/payslips/${ctx.employee.id}/`);
  if (!ctx.isManager && !own) return new Response("Not found", { status: 404 });
  const body = await storage().get(path);
  if (!body) return new Response("Not found", { status: 404 });
  const type = path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" },
  });
}
