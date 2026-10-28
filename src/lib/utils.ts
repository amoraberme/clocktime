import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function fullName(e: { firstName: string; lastName: string }) {
  return `${e.firstName} ${e.lastName}`.trim();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Group items by a key in one pass. Use it instead of filtering a company-wide list once per person
 * (which grows with headcount squared: seconds of CPU at 1,000+ employees).
 */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/**
 * Let other requests run during a long computation (a nationwide report or payroll for 1,000+
 * people): call it in the loop, and every `every` iterations it hands the event loop back once.
 */
export function yieldEvery(i: number, every = 50): Promise<void> | undefined {
  if (i > 0 && i % every === 0) return new Promise((resolve) => setImmediate(resolve));
}
