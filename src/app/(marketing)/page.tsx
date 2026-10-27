import {
  BarChart3,
  CalendarDays,
  CloudOff,
  FileSpreadsheet,
  MapPin,
  QrCode,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "ClockTime: Time clock, scheduling & payroll for Philippine teams",
  description:
    "GPS and kiosk time clock, drag-and-drop schedules, and payroll with SSS, PhilHealth, Pag-IBIG and BIR tax built in. For teams of 2 to 50.",
};

const FEATURES = [
  {
    icon: Smartphone,
    title: "Clock in from any phone",
    body: "An app staff add to their home screen. No app store, works on cheap Androids, and keeps working offline.",
  },
  {
    icon: MapPin,
    title: "GPS & geofences",
    body: "Every punch is stamped with a location. Block or flag clock-ins outside the site, and clock people out when they leave.",
  },
  {
    icon: QrCode,
    title: "Shared tablet kiosk",
    body: "Mount a tablet at the door. Staff punch with a PIN or QR badge, with optional photo proof against buddy punching.",
  },
  {
    icon: CalendarDays,
    title: "Drag-and-drop schedules",
    body: "Build the week in minutes, repeat shifts, post open shifts, approve swaps, and see who confirmed.",
  },
  {
    icon: TriangleAlert,
    title: "Exception inbox",
    body: "Missed clock-outs, lateness, long breaks, no-shows and unapproved overtime, flagged before payday.",
  },
  {
    icon: BarChart3,
    title: "Live dashboard & insights",
    body: "Who's in right now, hours and labor cost today, and scheduled vs worked hours by week.",
  },
];

const PREMIUMS = [
  ["Ordinary day overtime", "125%"],
  ["Rest day / special day", "130%"],
  ["Special day on rest day", "150%"],
  ["Regular holiday", "200%"],
  ["Regular holiday on rest day", "260%"],
  ["Night differential (10 PM–6 AM)", "+10%"],
];

const FAQ = [
  [
    "Does it follow Philippine labor law?",
    "Pay rules follow the Labor Code and DOLE handbook: 8-hour days, overtime and night differential premiums, rest day and holiday pay, unworked regular holidays, Service Incentive Leave and 13th-month pay. Rates are versioned so they can be updated when agencies change them.",
  ],
  [
    "Do my staff need an app?",
    "No. They open ClockTime in their phone's browser and tap “Add to Home Screen”. It works like an app, even offline, and punches sync when the signal comes back.",
  ],
  [
    "Can it stop buddy punching?",
    "Yes. Use geofences, photo proof, device lock (each person's own phone) or a kiosk with PIN or QR badges. Every punch is logged with time, place and device.",
  ],
  [
    "What about SSS, PhilHealth, Pag-IBIG and BIR?",
    "Pro computes employee and employer shares and withholding tax every payday, produces payslips, and exports a payroll register, a bank upload file and contribution summaries.",
  ],
  [
    "How do I pay for ClockTime?",
    "Monthly or yearly through PayMongo with GCash, Maya, GrabPay or card. You can start with a 14-day free trial, no card needed.",
  ],
  [
    "Is our data safe?",
    "Data is encrypted in transit, government ID and bank numbers are encrypted at rest, every edit is in the audit trail, and you can export or delete your company's data anytime.",
  ],
];

export default function LandingPage() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="from-primary-soft/70 via-background to-background absolute inset-0 -z-10 bg-gradient-to-b" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="bg-card text-primary mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
              🇵🇭 Built for Philippine businesses
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Clock in, schedule and pay your team,{" "}
              <span className="text-primary">without the spreadsheets.</span>
            </h1>
            <p className="text-muted-foreground mt-5 max-w-xl text-lg">
              A GPS and kiosk time clock, drag-and-drop schedules, and payroll with SSS, PhilHealth, Pag-IBIG
              and BIR tax built in. For cafés, clinics, shops, security agencies and crews of 2 to 50.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Start 14-day free trial</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-3 text-sm">No credit card. Free forever for 2 people.</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Everything between “clock in” and “payday”
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-center">
          One app replaces the bundy clock, the paper schedule and the payroll spreadsheet.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card rounded-2xl border p-6">
              <div className="bg-primary-soft text-primary mb-4 inline-flex rounded-lg p-2.5">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="payroll" className="bg-sidebar border-y text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-amber-300">ClockTime Pro</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Philippine payroll, done right every cut-off
            </h2>
            <p className="mt-4 text-white/75">
              Approved timesheets flow straight into payroll. ClockTime applies DOLE premium rates, deducts
              SSS, PhilHealth and Pag-IBIG, withholds tax with the BIR TRAIN table, and produces payslips, all
              in one click.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                [Wallet, "Semi-monthly, weekly or monthly payroll with contribution true-ups"],
                [FileSpreadsheet, "Payroll register, bank upload file and contribution reports"],
                [ShieldCheck, "13th-month pay, SIL conversion, loans and cash advances"],
                [CloudOff, "Minimum wage earner exemptions and de minimis allowances"],
              ].map(([Icon, text]) => {
                const I = Icon as typeof Wallet;
                return (
                  <li key={text as string} className="flex gap-3">
                    <I className="size-5 shrink-0 text-amber-300" /> {text as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <p className="mb-4 text-sm font-medium text-white/80">Premiums applied automatically</p>
            <div className="divide-y divide-white/10">
              {PREMIUMS.map(([label, rate]) => (
                <div key={label} className="flex justify-between py-2.5 text-sm">
                  <span>{label}</span>
                  <span className="font-semibold text-amber-300">{rate}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-white/60">
              Holiday calendar pre-loaded every year and editable for local holidays.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          Up and running before your next shift
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["1", "Create your company", "Add your sites and drop a pin for each geofence."],
            ["2", "Invite your team", "Send email invites, import a spreadsheet, or share a join code."],
            [
              "3",
              "Clock in & publish",
              "Staff punch from their phones or the kiosk; you publish the schedule.",
            ],
          ].map(([n, t, b]) => (
            <div key={n} className="bg-card rounded-2xl border p-6">
              <span className="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                {n}
              </span>
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Simple pricing, one price for every location
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 mb-12 max-w-xl text-center">
            Start free. Upgrade when you need scheduling, the kiosk or payroll.
          </p>
          <PricingCards />
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
        <div className="bg-card mt-10 divide-y rounded-2xl border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-4">
              <summary className="cursor-pointer list-none font-medium">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="text-muted-foreground mt-3 text-sm">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="bg-primary text-primary-foreground rounded-3xl px-6 py-12 text-center">
          <h2 className="text-3xl font-bold">Ready for an easier payday?</h2>
          <p className="mt-2 opacity-90">Try every Pro feature free for 14 days.</p>
          <Button asChild size="lg" className="mt-6 bg-amber-400 text-black hover:bg-amber-300">
            <Link href="/signup">Start free trial</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

/** A lightweight product mock (phone clock + dashboard card) drawn with HTML, no images. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="bg-card rounded-2xl border p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-xs">Kape Kanto Café · today</p>
            <p className="font-semibold">Who&apos;s working</p>
          </div>
          <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-xs">
            5 on the clock
          </span>
        </div>
        {(
          [
            ["Ana Cruz", "Barista · since 7:02 AM", "#ec4899", "4h 31m"],
            ["Jose Reyes", "Manager · since 6:55 AM", "#8b5cf6", "4h 38m"],
            ["Liza Garcia", "Cashier · on break", "#10b981", "3h 12m"],
          ] as const
        ).map(([n, s, c, h]) => (
          <div key={n} className="flex items-center gap-3 border-t py-2.5">
            <span
              className="inline-flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: c }}
            >
              {n.split(" ").map((x) => x[0])}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{n}</span>
              <span className="text-muted-foreground block text-xs">{s}</span>
            </span>
            <span className="tabular text-sm font-medium">{h}</span>
          </div>
        ))}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-muted-foreground text-xs">Labor cost today</p>
            <p className="font-semibold">₱4,812</p>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <p className="text-muted-foreground text-xs">Exceptions</p>
            <p className="font-semibold">2 to review</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-10 -left-4 w-44 rounded-[1.75rem] border-4 border-slate-800 bg-slate-800 shadow-2xl sm:-left-10">
        <div className="bg-card overflow-hidden rounded-[1.4rem]">
          <div className="bg-primary px-3 pt-5 pb-4 text-center text-white">
            <p className="text-[9px] opacity-80">Tuesday, Oct 27</p>
            <p className="text-2xl font-semibold">7:02 AM</p>
            <p className="text-[10px]">You&apos;re on the clock</p>
          </div>
          <div className="space-y-2 p-3">
            <div className="bg-danger rounded-lg py-2 text-center text-xs font-semibold text-white">
              Clock out
            </div>
            <p className="text-muted-foreground flex items-center justify-center gap-1 text-[9px]">
              <MapPin className="size-2.5" /> Maginhawa · you&apos;re on site
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
