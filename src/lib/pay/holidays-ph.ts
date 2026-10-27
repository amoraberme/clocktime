import type { HolidayKind } from "./premiums";

export type HolidaySeed = { date: string; name: string; type: HolidayKind };

/**
 * Philippine national holidays for 2026. Islamic holidays (Eid'l Fitr, Eid'l Adha) are set by
 * separate proclamations; dates here are estimates. Companies and super-admins can edit them.
 */
export const PH_HOLIDAYS_2026: HolidaySeed[] = [
  { date: "2026-01-01", name: "New Year's Day", type: "REGULAR" },
  { date: "2026-02-17", name: "Chinese New Year", type: "SPECIAL_NON_WORKING" },
  { date: "2026-02-25", name: "EDSA People Power Revolution Anniversary", type: "SPECIAL_WORKING" },
  { date: "2026-03-20", name: "Eid'l Fitr (estimated)", type: "REGULAR" },
  { date: "2026-04-02", name: "Maundy Thursday", type: "REGULAR" },
  { date: "2026-04-03", name: "Good Friday", type: "REGULAR" },
  { date: "2026-04-04", name: "Black Saturday", type: "SPECIAL_NON_WORKING" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: "REGULAR" },
  { date: "2026-05-01", name: "Labor Day", type: "REGULAR" },
  { date: "2026-05-27", name: "Eid'l Adha (estimated)", type: "REGULAR" },
  { date: "2026-06-12", name: "Independence Day", type: "REGULAR" },
  { date: "2026-08-21", name: "Ninoy Aquino Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-08-31", name: "National Heroes Day", type: "REGULAR" },
  { date: "2026-11-01", name: "All Saints' Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-11-02", name: "All Souls' Day", type: "SPECIAL_NON_WORKING" },
  { date: "2026-11-30", name: "Bonifacio Day", type: "REGULAR" },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception", type: "SPECIAL_NON_WORKING" },
  { date: "2026-12-24", name: "Christmas Eve", type: "SPECIAL_NON_WORKING" },
  { date: "2026-12-25", name: "Christmas Day", type: "REGULAR" },
  { date: "2026-12-30", name: "Rizal Day", type: "REGULAR" },
  { date: "2026-12-31", name: "Last Day of the Year", type: "SPECIAL_NON_WORKING" },
];

/** Fixed-date holidays, used to pre-fill a new year before its proclamation is out. */
export function fixedHolidaysFor(year: number): HolidaySeed[] {
  const d = (md: string) => `${year}-${md}`;
  const lastMondayOfAugust = (() => {
    const last = new Date(Date.UTC(year, 7, 31));
    const back = (last.getUTCDay() + 6) % 7;
    return `${year}-08-${String(31 - back).padStart(2, "0")}`;
  })();
  return [
    { date: d("01-01"), name: "New Year's Day", type: "REGULAR" },
    { date: d("04-09"), name: "Araw ng Kagitingan", type: "REGULAR" },
    { date: d("05-01"), name: "Labor Day", type: "REGULAR" },
    { date: d("06-12"), name: "Independence Day", type: "REGULAR" },
    { date: d("08-21"), name: "Ninoy Aquino Day", type: "SPECIAL_NON_WORKING" },
    { date: lastMondayOfAugust, name: "National Heroes Day", type: "REGULAR" },
    { date: d("11-01"), name: "All Saints' Day", type: "SPECIAL_NON_WORKING" },
    { date: d("11-30"), name: "Bonifacio Day", type: "REGULAR" },
    { date: d("12-08"), name: "Feast of the Immaculate Conception", type: "SPECIAL_NON_WORKING" },
    { date: d("12-24"), name: "Christmas Eve", type: "SPECIAL_NON_WORKING" },
    { date: d("12-25"), name: "Christmas Day", type: "REGULAR" },
    { date: d("12-30"), name: "Rizal Day", type: "REGULAR" },
    { date: d("12-31"), name: "Last Day of the Year", type: "SPECIAL_NON_WORKING" },
  ];
}
