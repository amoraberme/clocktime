/**
 * Normalization for the IDs that terminals and card readers send, so the same badge or user ID
 * matches no matter how a device formats it.
 */

/** Terminal user IDs: numeric IDs lose leading zeros ("0042" = "42"); others are upper-cased. */
export function normalizeUserId(raw: string) {
  const v = raw.trim();
  if (/^\d+$/.test(v)) return v.replace(/^0+(?=\d)/, "");
  return v.toUpperCase();
}

/**
 * RFID card numbers: decimal numbers lose leading zeros (keyboard-wedge readers pad to 10 digits);
 * hex serials (e.g. Web NFC "04:a2:3b:…") drop separators and are upper-cased.
 */
export function normalizeCard(raw: string) {
  const v = raw.trim().replace(/[\s:-]/g, "");
  if (/^\d+$/.test(v)) return v.replace(/^0+(?=\d)/, "");
  return v.toUpperCase();
}

export function isValidCard(raw: string) {
  const v = normalizeCard(raw);
  return v.length >= 4 && v.length <= 32 && /^[0-9A-F]+$/.test(v);
}
