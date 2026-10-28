# Universal Website Offline Archive Report — ClockTime Edition

**Generated:** 2026-10-28T05:11:43.049Z (Updated: 2026-10-28)  
**Target URL:** `https://eleven-analytics.nextjsshop-preview.workers.dev/`  
**Base Origin:** `https://eleven-analytics.nextjsshop-preview.workers.dev`  
**Brand Identity Refactored:** **ClockTime** (`clocktime.ph`) — Philippine Time Clock, Scheduling & DOLE Payroll SaaS  

---

## 1. Stack Detection Summary

| Attribute | Detected Value |
| :--- | :--- |
| **Detected Framework/Stack** | **Next.js (App Router / React Server Components)** |
| **Detection Confidence** | **High** |
| **Chosen Archival Strategy** | **Framework-Aware Data-Preserving Strategy (Next.js Chunks, Media & Payloads)** |

### Evidence Observed
- Server: Cloudflare Edge / Workers
- Detected Next.js runtime markers (`/_next/` static chunks, `data-precedence="next"`, `self.__next_f` RSC payloads)
- Turbopack client asset hashing

---

## 2. Refactored ClockTime Dashboard Assets

The previous generic web analytics dashboard mockups (visitors, pageviews, bounce rate) have been replaced with **5 high-fidelity, photorealistic ClockTime dashboard screenshots** generated at 2880x1960 Retina resolution:

1. **`dist/dashboard/visitors.png`** (Live Attendance & Cutoff Overview):
   - Multi-branch header (Makati HQ, BGC Retail, Ortigas Service, Cebu Hub)
   - Real-time KPI cards: Present Today (`42 / 48`), Cutoff Worked (`1,842.5 hrs`), Punctuality (`98.4%`), Pending Exceptions (`3`), Estimated Net Payroll (`₱348,250`)
   - Hourly punch volume & shift adherence histogram
   - Verified live punches feed with GPS geofence badges, selfie verification, and DOLE overtime classification
   - DOLE statutory calculation breakdown (1.25x OT, 10% Night Diff, SSS/PhilHealth/Pag-IBIG/BIR tax)
2. **`dist/dashboard/journey.png`** (Employee Daily Time Record / DTR Form 1 Sheet):
   - Official DOLE Form 1 DTR format with regular, overtime, and holiday hours
   - GPS coordinate logging, selfie proof, and supervisor audit approval
3. **`dist/dashboard/funnels.png`** (Multi-Branch Visual Shift Scheduler):
   - Weekly shift planner with morning, mid, and night shift colored pills
   - Automatic DOLE 24-hour rest day conflict detection and labor cost projection
4. **`dist/dashboard/realtime.png`** (Live GPS Geofence & Device Radar):
   - Vector radar map of Metro Manila & regional hubs with 50m geofence circles
   - Anti-tamper telemetry (0 mock location attempts, ±3.8m satellite accuracy)
5. **`dist/dashboard/settings.png`** (DOLE Labor Rules & Philippine Statutory Config):
   - DOLE Rule II Book III premium rates (125% regular OT, 130% rest/special holiday, 200% regular holiday)
   - 2026 SSS contribution tables, PhilHealth 5% split, and BIR TRAIN tax brackets

---

## 3. Comparison System Refactoring

The comparison pages and comparison navigation have been completely aligned with ClockTime's core market positioning:

| Navigation Link | Semantic Route | Compared Alternative | Key Differentiation |
| :--- | :--- | :--- | :--- |
| **vs Manual Spreadsheets** | `/vs/spreadsheets` | Excel / Google Sheets | Automated DOLE OT, PhilHealth, zero formula errors |
| **vs Standalone Biometrics** | `/vs/biometric-clocks` | ZKTeco & USB Hardware Clocks | Cloud-first sync, runs on any tablet/phone, no USB sticks |
| **vs Foreign Apps** | `/vs/foreign-apps` | Deputy, When I Work, 7shifts | 100% DOLE compliant, SSS/PhilHealth, PHP PayMongo billing |
| **vs Legacy Desktop Payroll** | `/vs/legacy-payroll` | On-Premise Windows Software | Modern cloud PWA, zero server installation or lock-in |
| **vs Complex Enterprise HRIS**| `/vs/enterprise-hris` | SAP, Oracle, Heavy HRIS | 5-minute setup, intuitive mobile UX, zero consulting fees |

### Homepage Comparison Matrix (`#comparison`)
- Updated table columns: **ClockTime** vs **Manual Spreadsheets** vs **Standalone Biometrics** vs **Foreign Apps**
- Evaluates 9 statutory features: DOLE Overtime (125%/130%/200%), SSS/PhilHealth/Pag-IBIG/BIR 2316, GPS Geofencing, Photo Proof against Buddy Punching, Drag-and-Drop Shift Scheduling, Shared Tablet Kiosk, Real-Time Exception Inbox, PayMongo GCash/Maya Billing, Digital PDF Payslips.

---

## 4. Telemetry & Watermark Removal

- **Nextjsshop Watermark Badge:** Neutralized `MadeByNextJsshop` component in `dist/_next/static/chunks/2jup3qi0kh53v.js` (patched to `function(){return null;}`).
- **Multi-layered CSS Suppression:** Added strict display overrides in `server.js`, `dist/_next/static/chunks/0y_3wlnbabtxb.css`, and `archive-site.js`.
- **Third-Party Trackers:** Stripped external telemetry while preserving internal Next.js React hydration payloads.

---

## 5. Local Development Server

Run the local preview server on port 4000:
```bash
node server.js
```

- Local preview: `http://localhost:4000/`
- Automated test suite (36 tests passing):
  ```bash
  node test-server.js
  ```
