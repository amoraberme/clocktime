import "server-only";
import { cookies } from "next/headers";
import { randomToken, sha256 } from "./crypto";
import type { AppContext } from "./context";
import { prisma } from "./db";
import { UserError } from "./action";

export const DEVICE_COOKIE = "ct_device";

/**
 * Device lock (Pro): the first phone someone punches from becomes their registered device.
 * Later punches from other devices are flagged or blocked, per company setting.
 * Returns the device id and whether this punch should be flagged.
 */
export async function checkPersonalDevice(
  ctx: AppContext,
): Promise<{ deviceId: string | null; flag: boolean }> {
  const mode = ctx.can("deviceLock") ? ctx.settings.deviceLockMode : "off";
  const jar = await cookies();
  let token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) {
    token = randomToken(24);
    jar.set(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 730,
    });
  }
  if (mode === "off") return { deviceId: null, flag: false };
  const hash = sha256(`${ctx.company.id}:${ctx.employee.id}:${token}`);
  const devices = await prisma.device.findMany({
    where: { companyId: ctx.company.id, employeeId: ctx.employee.id, kind: "PERSONAL", revokedAt: null },
  });
  const match = devices.find((d) => d.tokenHash === hash);
  if (match) {
    await prisma.device.update({ where: { id: match.id }, data: { lastSeenAt: new Date() } });
    return { deviceId: match.id, flag: false };
  }
  if (devices.length === 0) {
    const d = await prisma.device.create({
      data: {
        companyId: ctx.company.id,
        employeeId: ctx.employee.id,
        kind: "PERSONAL",
        name: "Registered phone",
        tokenHash: hash,
        lastSeenAt: new Date(),
      },
    });
    return { deviceId: d.id, flag: false };
  }
  if (mode === "block")
    throw new UserError(
      "This isn't your registered phone. Ask your manager to reset your device, or use the kiosk.",
    );
  return { deviceId: null, flag: true };
}

export async function resetPersonalDevices(companyId: string, employeeId: string) {
  await prisma.device.updateMany({
    where: { companyId, employeeId, kind: "PERSONAL", revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
