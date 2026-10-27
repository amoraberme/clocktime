import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { effectivePlan, hasFeature } from "@/lib/entitlements";
import { parseSettings } from "@/lib/settings";
import { UserError } from "./action";
import { normalizeCard } from "@/lib/identifiers";
import { cardLookup, pinLookup, randomCode, randomToken, sha256, verifySecret } from "./crypto";
import { prisma } from "./db";
import { clear, hit } from "./rate-limit";
import { storage } from "./storage";
import type { PunchActor } from "./services/timeclock";

export const KIOSK_COOKIE = "ct_kiosk";
const PAIRING_MINUTES = 15;

export async function createKioskPairing(companyId: string, name: string, locationId: string) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, companyId, archivedAt: null },
  });
  if (!location) throw new UserError("Choose a location for this kiosk.");
  let code = randomCode(6);
  while (await prisma.device.findUnique({ where: { pairingCode: code } })) code = randomCode(6);
  return prisma.device.create({
    data: {
      companyId,
      kind: "KIOSK",
      name: name.trim() || "Kiosk",
      locationId,
      pairingCode: code,
      pairingExpiresAt: new Date(Date.now() + PAIRING_MINUTES * 60000),
    },
  });
}

/** Exchange a pairing code for a long-lived device token (stored hashed; sent as an httpOnly cookie). */
export async function pairKiosk(code: string, ip: string | null) {
  const limit = await hit(`kiosk-pair:${ip ?? "unknown"}`, 10, 600);
  if (!limit.ok) throw new UserError("Too many attempts. Try again in a few minutes.");
  const device = await prisma.device.findUnique({ where: { pairingCode: code.trim().toUpperCase() } });
  if (!device || device.revokedAt || !device.pairingExpiresAt || device.pairingExpiresAt < new Date()) {
    throw new UserError("That code is invalid or expired. Create a new one in Settings → Kiosks.");
  }
  const token = randomToken(32);
  await prisma.device.update({
    where: { id: device.id },
    data: { tokenHash: sha256(token), pairingCode: null, pairingExpiresAt: null, lastSeenAt: new Date() },
  });
  return token;
}

export async function currentKiosk() {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!token) return null;
  const device = await prisma.device.findUnique({
    where: { tokenHash: sha256(token) },
    include: { company: true, location: true },
  });
  if (
    !device ||
    device.kind !== "KIOSK" ||
    device.revokedAt ||
    !device.location ||
    device.location.archivedAt
  )
    return null;
  const plan = effectivePlan(device.company);
  return {
    device,
    company: device.company,
    location: device.location,
    plan,
    settings: parseSettings(device.company.settings),
    enabled: hasFeature(plan, "kiosk"),
  };
}

export type Kiosk = NonNullable<Awaited<ReturnType<typeof currentKiosk>>>;

export async function requireKiosk() {
  const k = await currentKiosk();
  if (!k) throw new KioskAuthError();
  if (!k.enabled) throw new UserError("Kiosk mode needs the Starter plan. Ask your admin to upgrade.");
  if (!k.device.lastSeenAt || Date.now() - k.device.lastSeenAt.getTime() > 60_000) {
    await prisma.device.update({ where: { id: k.device.id }, data: { lastSeenAt: new Date() } });
  }
  return k;
}

export class KioskAuthError extends Error {
  constructor() {
    super("This device isn't paired as a kiosk.");
  }
}

export const identifySchema = z.union([
  z.object({ pin: z.string().regex(/^\d{4,6}$/, "Enter your 4–6 digit PIN") }),
  z.object({ qr: z.string().min(8).max(200) }),
  z.object({ card: z.string().min(4).max(40) }),
]);

/** How the person identified themselves, recorded on the punch. */
export function methodOf(input: { pin?: unknown; qr?: unknown; card?: unknown }) {
  return input.card ? "CARD" : input.qr ? "QR" : "PIN";
}

/** Find the employee for a PIN or QR badge, with brute-force protection per kiosk. */
export async function identify(k: Kiosk, raw: unknown) {
  const input = identifySchema.parse(raw);
  const key = `kiosk-pin:${k.device.id}`;
  const limit = await hit(key, 8, 60);
  if (!limit.ok) throw new UserError(`Too many tries. Wait ${limit.retryAfter} seconds.`);
  let employee;
  if ("pin" in input) {
    employee = await prisma.employee.findFirst({
      where: {
        companyId: k.company.id,
        pinLookup: pinLookup(k.company.id, input.pin),
        status: { not: "ARCHIVED" },
      },
    });
    if (employee && !(await verifySecret(input.pin, employee.pinHash))) employee = null;
  } else if ("card" in input) {
    if (!hasFeature(k.plan, "rfid")) throw new UserError("RFID cards need the Enterprise plan.");
    employee = await prisma.employee.findFirst({
      where: {
        companyId: k.company.id,
        cardLookup: cardLookup(k.company.id, normalizeCard(input.card)),
        status: { not: "ARCHIVED" },
      },
    });
  } else {
    const token = input.qr.startsWith("clocktime:") ? input.qr.slice("clocktime:".length) : input.qr;
    employee = await prisma.employee.findFirst({
      where: { companyId: k.company.id, qrToken: token, status: { not: "ARCHIVED" } },
    });
  }
  if (!employee)
    throw new UserError("card" in input ? "Card not recognized." : "PIN or badge not recognized.");
  await clear(key);
  return employee;
}

export function kioskActor(k: Kiosk, employee: PunchActor["employee"]): PunchActor {
  return {
    companyId: k.company.id,
    timezone: k.company.timezone,
    plan: k.plan,
    settings: k.settings,
    employee,
  };
}

const MAX_PHOTO_BYTES = 600_000;

/** Store a JPEG data URL captured by the kiosk or phone camera. Returns the storage key. */
export async function savePunchPhoto(companyId: string, dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new UserError("The photo couldn't be read.");
  const buf = Buffer.from(m[2]!, "base64");
  if (buf.length > MAX_PHOTO_BYTES) throw new UserError("The photo is too large.");
  const key = `${companyId}/photos/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${m[1] === "png" ? "png" : "jpg"}`;
  await storage().put(key, buf, `image/${m[1]}`);
  return key;
}
