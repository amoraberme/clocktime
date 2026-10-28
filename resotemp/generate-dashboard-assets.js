const { chromium } = require('../node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, 'dist', 'dashboard');

const COMMON_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #09090b;
    color: #f4f4f5;
    width: 1440px;
    height: 980px;
    overflow: hidden;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    -webkit-font-smoothing: antialiased;
  }
  
  .mono { font-family: 'JetBrains Mono', monospace; }
  
  /* Top App Shell */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #121215;
    border: 1px solid #27272a;
    border-radius: 14px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-logo {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #000;
    font-weight: 800;
    font-size: 16px;
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.35);
  }
  .brand-text {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .branch-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: #a1a1aa;
  }
  .pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .btn-outline {
    background: #18181b;
    border: 1px solid #27272a;
    color: #e4e4e7;
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-emerald {
    background: #10b981;
    color: #09090b;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
  }
  
  /* KPI Row */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }
  .kpi-card {
    background: #121215;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  .kpi-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.4), transparent);
  }
  .kpi-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #71717a;
    margin-bottom: 6px;
  }
  .kpi-val {
    font-size: 24px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.03em;
  }
  .kpi-sub {
    font-size: 11px;
    color: #a1a1aa;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tag-green { color: #10b981; font-weight: 600; }
  .tag-amber { color: #f59e0b; font-weight: 600; }
  
  /* Layout Grids */
  .grid-2 {
    display: grid;
    grid-template-columns: 1.8fr 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }
  .card {
    background: #121215;
    border: 1px solid #27272a;
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
  }
  .card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #1f1f23;
    padding-bottom: 12px;
  }
  .card-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-emerald { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
  .badge-zinc { background: #1f1f23; color: #a1a1aa; border: 1px solid #27272a; }
  .badge-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
  .badge-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  
  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    padding: 8px 10px;
    color: #71717a;
    font-weight: 600;
    font-size: 11px;
    border-bottom: 1px solid #27272a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td {
    padding: 10px;
    border-bottom: 1px solid #1c1c20;
    color: #e4e4e7;
  }
  tr:last-child td { border-bottom: none; }
  .emp-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #27272a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #a1a1aa;
    border: 1px solid #3f3f46;
  }
  .emp-name { font-weight: 600; color: #fff; font-size: 12px; }
  .emp-role { font-size: 10px; color: #71717a; }
`;

async function renderScreens() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 2 // 2880x1960 Retina crisp
  });

  // SCREEN 1: visitors.png -> Live Attendance & Cutoff Overview
  console.log('Rendering 1/5: visitors.png (Live Attendance Overview)...');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${COMMON_STYLES}
          .chart-area {
            display: flex;
            align-items: flex-end;
            gap: 12px;
            height: 160px;
            padding: 16px 0 6px 0;
            border-bottom: 1px solid #27272a;
          }
          .bar-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            height: 100%;
            justify-content: flex-end;
          }
          .bar {
            width: 100%;
            border-radius: 4px 4px 0 0;
            background: linear-gradient(180deg, #10b981 0%, rgba(16, 185, 129, 0.2) 100%);
            position: relative;
            transition: all 0.2s;
          }
          .bar-label { font-size: 10px; color: #71717a; }
          .branch-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 8px;
          }
          .feed-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            border-radius: 6px;
            background: rgba(255,255,255,0.02);
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <!-- Top Bar -->
        <div class="top-bar">
          <div class="brand">
            <div class="brand-logo">CT</div>
            <div>
              <div class="brand-text">ClockTime · Enterprise Portal</div>
              <div style="font-size: 10px; color: #71717a;">DOLE Rule 1070 Compliance Verified</div>
            </div>
          </div>
          <div class="branch-tag">
            <span class="pulse-dot"></span>
            <span>Makati HQ & 3 Remote Hubs · Active Cutoff: Oct 16 – 31, 2026</span>
          </div>
          <div class="actions">
            <button class="btn-outline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export DOLE DTR (CSV/XLS)
            </button>
            <button class="btn-emerald">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              1-Click Payroll Run
            </button>
          </div>
        </div>

        <!-- 5 KPI Cards -->
        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-header">
              <span>Present Today</span>
              <span class="badge badge-emerald">Live</span>
            </div>
            <div class="kpi-val mono">42 / 48</div>
            <div class="kpi-sub"><span class="tag-green">87.5%</span> on-site · 6 on approved leave</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <span>Cutoff Worked</span>
              <span class="badge badge-zinc">Semi-Monthly</span>
            </div>
            <div class="kpi-val mono">1,842.5 h</div>
            <div class="kpi-sub"><span class="tag-green">142.0 h</span> DOLE OT (1.25x)</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <span>Punctuality Rate</span>
              <span class="badge badge-emerald">98.4%</span>
            </div>
            <div class="kpi-val mono">98.4%</div>
            <div class="kpi-sub">45 on-time · 3 in grace period</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <span>Pending Exceptions</span>
              <span class="badge badge-amber">3 Actions</span>
            </div>
            <div class="kpi-val mono" style="color: #f59e0b;">3</div>
            <div class="kpi-sub">1 missing punch · 2 OT requests</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <span>Est. Net Payroll</span>
              <span class="badge badge-blue">PayMongo Ready</span>
            </div>
            <div class="kpi-val mono" style="color: #60a5fa;">₱348,250</div>
            <div class="kpi-sub">Gross: ₱392.4k · Tax/SSS: -₱44.1k</div>
          </div>
        </div>

        <!-- Main Workspace -->
        <div class="grid-2">
          <!-- Left: Hourly Punch Chart & Verification Breakdown -->
          <div class="card">
            <div class="card-title-row">
              <div class="card-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Punch Volume & Shift Adherence Trends
              </div>
              <div style="display: flex; gap: 8px;">
                <span class="badge badge-zinc">Morning Peak: 07:45 - 08:15 AM</span>
                <span class="badge badge-emerald">GPS Accurate (±4m)</span>
              </div>
            </div>

            <!-- CSS Bar Chart -->
            <div class="chart-area">
              <div class="bar-group"><div class="bar" style="height: 15%;"></div><span class="bar-label">06h</span></div>
              <div class="bar-group"><div class="bar" style="height: 45%;"></div><span class="bar-label">07h</span></div>
              <div class="bar-group"><div class="bar" style="height: 95%; background: linear-gradient(180deg, #10b981 0%, #059669 100%);"></div><span class="bar-label" style="color: #10b981; font-weight: 700;">08h</span></div>
              <div class="bar-group"><div class="bar" style="height: 40%;"></div><span class="bar-label">09h</span></div>
              <div class="bar-group"><div class="bar" style="height: 20%;"></div><span class="bar-label">10h</span></div>
              <div class="bar-group"><div class="bar" style="height: 10%;"></div><span class="bar-label">11h</span></div>
              <div class="bar-group"><div class="bar" style="height: 65%;"></div><span class="bar-label">12h</span></div>
              <div class="bar-group"><div class="bar" style="height: 30%;"></div><span class="bar-label">13h</span></div>
              <div class="bar-group"><div class="bar" style="height: 25%;"></div><span class="bar-label">14h</span></div>
              <div class="bar-group"><div class="bar" style="height: 35%;"></div><span class="bar-label">15h</span></div>
              <div class="bar-group"><div class="bar" style="height: 50%;"></div><span class="bar-label">16h</span></div>
              <div class="bar-group"><div class="bar" style="height: 90%; background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);"></div><span class="bar-label" style="color: #60a5fa; font-weight: 700;">17h</span></div>
              <div class="bar-group"><div class="bar" style="height: 70%;"></div><span class="bar-label">18h</span></div>
              <div class="bar-group"><div class="bar" style="height: 35%;"></div><span class="bar-label">19h</span></div>
            </div>

            <!-- Live Punch Activity Table -->
            <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
              <div style="font-size: 12px; font-weight: 700; color: #a1a1aa; margin-bottom: 8px;">LATEST VERIFIED TIME CLOCK ENTRIES</div>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Timestamp</th>
                    <th>Verification</th>
                    <th>Geofence / Location</th>
                    <th>DOLE Classification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div class="emp-cell">
                        <div class="avatar" style="background: #064e3b; color: #34d399;">MS</div>
                        <div>
                          <div class="emp-name">Maria Santos</div>
                          <div class="emp-role">Senior Shift Lead · Operations</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge badge-emerald">CLOCK IN</span></td>
                    <td class="mono">07:54:12 AM</td>
                    <td><span class="badge badge-zinc">GPS + Selfie Verified</span></td>
                    <td>Makati HQ (4m radius)</td>
                    <td><span class="tag-green">On-Time (Regular)</span></td>
                  </tr>
                  <tr>
                    <td>
                      <div class="emp-cell">
                        <div class="avatar" style="background: #1e3a8a; color: #93c5fd;">JD</div>
                        <div>
                          <div class="emp-name">Juan dela Cruz</div>
                          <div class="emp-role">Inventory Specialist · BGC Store</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge badge-emerald">CLOCK IN</span></td>
                    <td class="mono">08:02:45 AM</td>
                    <td><span class="badge badge-zinc">Tablet Kiosk PIN</span></td>
                    <td>BGC High Street Kiosk #1</td>
                    <td><span class="tag-green">On-Time (2m Grace)</span></td>
                  </tr>
                  <tr>
                    <td>
                      <div class="emp-cell">
                        <div class="avatar" style="background: #4c1d95; color: #c4b5fd;">SL</div>
                        <div>
                          <div class="emp-name">Sarah Lim</div>
                          <div class="emp-role">Branch Pharmacist · Ortigas</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge badge-amber">CLOCK OUT</span></td>
                    <td class="mono">05:32:10 PM</td>
                    <td><span class="badge badge-zinc">Biometric Face ID</span></td>
                    <td>Ortigas Branch Device #2</td>
                    <td><span class="tag-amber">DOLE OT 1.25x (+32m)</span></td>
                  </tr>
                  <tr>
                    <td>
                      <div class="emp-cell">
                        <div class="avatar" style="background: #78350f; color: #fde68a;">MT</div>
                        <div>
                          <div class="emp-name">Michael Tan</div>
                          <div class="emp-role">Logistics Dispatcher · Pasig</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge badge-emerald">CLOCK IN</span></td>
                    <td class="mono">08:14:02 AM</td>
                    <td><span class="badge badge-zinc">Mobile Geofence</span></td>
                    <td>Pasig Warehouse #4</td>
                    <td><span class="tag-green">Within 15m Grace</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right: Branch Breakdown & DOLE Statutory Summary -->
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div class="card" style="flex: 1;">
              <div class="card-title-row">
                <div class="card-title">Active Branches & Kiosks</div>
                <span class="badge badge-emerald">4 Online</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div class="branch-item">
                  <div>
                    <div style="font-weight: 700; font-size: 13px; color: #fff;">Makati Corporate HQ</div>
                    <div style="font-size: 11px; color: #71717a;">Radius: 75m · Kiosks: 2 · Geofence: Active</div>
                  </div>
                  <div style="text-align: right;">
                    <div class="mono" style="font-weight: 700; color: #10b981;">18 / 18</div>
                    <div style="font-size: 10px; color: #71717a;">100% On-Site</div>
                  </div>
                </div>

                <div class="branch-item">
                  <div>
                    <div style="font-weight: 700; font-size: 13px; color: #fff;">BGC Retail Flagship</div>
                    <div style="font-size: 11px; color: #71717a;">Radius: 50m · Kiosks: 1 · Geofence: Active</div>
                  </div>
                  <div style="text-align: right;">
                    <div class="mono" style="font-weight: 700; color: #10b981;">14 / 15</div>
                    <div style="font-size: 10px; color: #f59e0b;">1 Approved Rest</div>
                  </div>
                </div>

                <div class="branch-item">
                  <div>
                    <div style="font-weight: 700; font-size: 13px; color: #fff;">Ortigas Medical Hub</div>
                    <div style="font-size: 11px; color: #71717a;">Radius: 60m · Kiosks: 1 · Geofence: Active</div>
                  </div>
                  <div style="text-align: right;">
                    <div class="mono" style="font-weight: 700; color: #10b981;">6 / 8</div>
                    <div style="font-size: 10px; color: #71717a;">2 Night Shift (22h)</div>
                  </div>
                </div>

                <div class="branch-item">
                  <div>
                    <div style="font-weight: 700; font-size: 13px; color: #fff;">Cebu Regional Hub</div>
                    <div style="font-size: 11px; color: #71717a;">Radius: 100m · Mobile Clocking Only</div>
                  </div>
                  <div style="text-align: right;">
                    <div class="mono" style="font-weight: 700; color: #10b981;">4 / 7</div>
                    <div style="font-size: 10px; color: #71717a;">3 Field Dispatch</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Statutory & Tax Summary Card -->
            <div class="card" style="background: linear-gradient(145deg, #121215 0%, #1a1a24 100%);">
              <div class="card-title-row">
                <div class="card-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  DOLE Statutory Calculation
                </div>
                <span class="badge badge-blue">Auto-Withholding</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
                <div class="feed-item">
                  <span style="color: #a1a1aa;">DOLE Regular OT (1.25x · 112 hrs)</span>
                  <span class="mono" style="color: #10b981; font-weight: 600;">+₱18,250.00</span>
                </div>
                <div class="feed-item">
                  <span style="color: #a1a1aa;">DOLE Night Shift Diff (10% · 64 hrs)</span>
                  <span class="mono" style="color: #10b981; font-weight: 600;">+₱6,400.00</span>
                </div>
                <div class="feed-item">
                  <span style="color: #a1a1aa;">SSS Contribution (2026 Table Split)</span>
                  <span class="mono" style="color: #f87171; font-weight: 600;">-₱19,850.00</span>
                </div>
                <div class="feed-item">
                  <span style="color: #a1a1aa;">PhilHealth (5% Statutory Rate)</span>
                  <span class="mono" style="color: #f87171; font-weight: 600;">-₱11,400.00</span>
                </div>
                <div class="feed-item">
                  <span style="color: #a1a1aa;">Pag-IBIG HDMF (₱200/employee cap)</span>
                  <span class="mono" style="color: #f87171; font-weight: 600;">-₱9,600.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(OUT_DIR, 'visitors.png') });

  // SCREEN 2: journey.png -> Cutoff DTR Inspection & Audit
  console.log('Rendering 2/5: journey.png (Cutoff DTR Sheet)...');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${COMMON_STYLES}
          .dtr-row:hover { background: rgba(255,255,255,0.02); }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div class="brand">
            <div class="brand-logo">DTR</div>
            <div>
              <div class="brand-text">Daily Time Record (DTR) & Cutoff Audit</div>
              <div style="font-size: 10px; color: #71717a;">DOLE Prescribed Format Form 1 · Tamper-Evident GPS Logs</div>
            </div>
          </div>
          <div class="branch-tag">
            <span class="pulse-dot"></span>
            <span>Employee: Maria Santos (EMP-0294) · Shift Lead · Makati HQ</span>
          </div>
          <div class="actions">
            <button class="btn-outline">Download Form 1 PDF</button>
            <button class="btn-emerald">Approve Cutoff DTR</button>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-header">Total Regular Hours</div>
            <div class="kpi-val mono">88.00 h</div>
            <div class="kpi-sub">11 working days completed</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">DOLE Overtime (1.25x)</div>
            <div class="kpi-val mono tag-green">6.50 h</div>
            <div class="kpi-sub">+₱1,844.75 premium</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Night Diff (10%)</div>
            <div class="kpi-val mono">4.00 h</div>
            <div class="kpi-sub">10:00 PM - 06:00 AM</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Tardiness / Undertime</div>
            <div class="kpi-val mono" style="color: #10b981;">0 min</div>
            <div class="kpi-sub">100% on-time record</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Net Take-Home Pay</div>
            <div class="kpi-val mono" style="color: #60a5fa;">₱26,630.00</div>
            <div class="kpi-sub">Gross: ₱30,240 · Gov: -₱3,610</div>
          </div>
        </div>

        <div class="card" style="flex: 1;">
          <div class="card-title-row">
            <div class="card-title">Official Cutoff Log: Oct 16 to Oct 31, 2026</div>
            <div style="display: flex; gap: 8px;">
              <span class="badge badge-emerald">DOLE Audit Trail Verified</span>
              <span class="badge badge-zinc">11 Logs / 0 Missing</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Scheduled Shift</th>
                <th>Time In (AM)</th>
                <th>Time Out (PM)</th>
                <th>Regular</th>
                <th>Overtime (1.25x)</th>
                <th>Night Diff</th>
                <th>Verification Method</th>
                <th>Audit Status</th>
              </tr>
            </thead>
            <tbody>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 16, Mon</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:54 AM</td>
                <td class="mono">05:02 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono">0.00 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">GPS (4m) + Selfie</span></td>
                <td><span class="badge badge-emerald">Verified</span></td>
              </tr>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 17, Tue</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:51 AM</td>
                <td class="mono">07:15 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono" style="color: #10b981; font-weight: 700;">2.25 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">Kiosk PIN + Face</span></td>
                <td><span class="badge badge-emerald">OT Approved</span></td>
              </tr>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 18, Wed</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:58 AM</td>
                <td class="mono">05:05 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono">0.00 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">GPS (6m) + Selfie</span></td>
                <td><span class="badge badge-emerald">Verified</span></td>
              </tr>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 19, Thu</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:48 AM</td>
                <td class="mono">06:30 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono" style="color: #10b981; font-weight: 700;">1.50 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">GPS (5m) + Selfie</span></td>
                <td><span class="badge badge-emerald">OT Approved</span></td>
              </tr>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 20, Fri</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:55 AM</td>
                <td class="mono">05:00 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono">0.00 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">Kiosk PIN</span></td>
                <td><span class="badge badge-emerald">Verified</span></td>
              </tr>
              <tr class="dtr-row" style="background: rgba(245, 158, 11, 0.05);">
                <td class="mono font-bold" style="color: #f59e0b;">Oct 23, Mon (Holiday)</td>
                <td>Special Non-Working (1.30x)</td>
                <td class="mono text-green-400">08:00 AM</td>
                <td class="mono">05:00 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono">0.00 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">GPS (3m) + Selfie</span></td>
                <td><span class="badge badge-amber">DOLE 130% Applied</span></td>
              </tr>
              <tr class="dtr-row">
                <td class="mono font-bold">Oct 24, Tue</td>
                <td>08:00 - 17:00</td>
                <td class="mono text-green-400">07:50 AM</td>
                <td class="mono">07:45 PM</td>
                <td class="mono">8.00 h</td>
                <td class="mono" style="color: #10b981; font-weight: 700;">2.75 h</td>
                <td class="mono">0.00 h</td>
                <td><span class="badge badge-zinc">GPS (4m) + Selfie</span></td>
                <td><span class="badge badge-emerald">OT Approved</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(OUT_DIR, 'journey.png') });

  // SCREEN 3: funnels.png -> Shift Scheduling & Roster Planner
  console.log('Rendering 3/5: funnels.png (Shift Scheduling Grid)...');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${COMMON_STYLES}
          .cal-grid {
            display: grid;
            grid-template-columns: 200px repeat(7, 1fr);
            gap: 8px;
            flex: 1;
            overflow: hidden;
          }
          .cal-header {
            font-size: 11px;
            font-weight: 700;
            color: #71717a;
            padding: 8px;
            text-align: center;
            background: #18181b;
            border-radius: 6px;
            border: 1px solid #27272a;
          }
          .shift-cell {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 8px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 10px;
          }
          .shift-pill {
            padding: 4px 6px;
            border-radius: 4px;
            font-weight: 600;
          }
          .shift-morning { background: rgba(16, 185, 129, 0.15); color: #10b981; border-left: 3px solid #10b981; }
          .shift-mid { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-left: 3px solid #3b82f6; }
          .shift-night { background: rgba(168, 85, 247, 0.15); color: #c084fc; border-left: 3px solid #a855f7; }
          .shift-off { background: rgba(113, 113, 122, 0.1); color: #71717a; text-align: center; padding: 12px 0; }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div class="brand">
            <div class="brand-logo">SCH</div>
            <div>
              <div class="brand-text">Multi-Branch Shift Scheduler</div>
              <div style="font-size: 10px; color: #71717a;">DOLE Rest Day Compliance Engine · Conflict Prevention</div>
            </div>
          </div>
          <div class="branch-tag">
            <span class="pulse-dot"></span>
            <span>Week 44: Oct 26 – Nov 1, 2026 · Makati HQ & BGC Retail</span>
          </div>
          <div class="actions">
            <button class="btn-outline">Auto-Fill Shift Template</button>
            <button class="btn-emerald">Publish Roster (SMS & Email)</button>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-header">Scheduled Hours</div>
            <div class="kpi-val mono">1,280 h</div>
            <div class="kpi-sub">32 staff members scheduled</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Open / Unfilled Shifts</div>
            <div class="kpi-val mono tag-green">0 Unfilled</div>
            <div class="kpi-sub">100% roster coverage</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">DOLE Rest Compliance</div>
            <div class="kpi-val mono" style="color: #10b981;">100% Passed</div>
            <div class="kpi-sub">Min 24h rest guaranteed</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Projected Labor Cost</div>
            <div class="kpi-val mono" style="color: #60a5fa;">₱245,600</div>
            <div class="kpi-sub">Within monthly target budget</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">Shift Swaps</div>
            <div class="kpi-val mono">2 Pending</div>
            <div class="kpi-sub">Peer-to-peer manager approval</div>
          </div>
        </div>

        <div class="card" style="flex: 1;">
          <div class="card-title-row">
            <div class="card-title">Weekly Visual Shift Roster</div>
            <div style="display: flex; gap: 8px;">
              <span class="badge badge-emerald">Morning 07-16</span>
              <span class="badge badge-blue">Mid 10-19</span>
              <span class="badge badge-zinc">Night 14-23</span>
            </div>
          </div>

          <div class="cal-grid">
            <div class="cal-header" style="text-align: left;">Team Member</div>
            <div class="cal-header">Mon 26</div>
            <div class="cal-header">Tue 27</div>
            <div class="cal-header">Wed 28</div>
            <div class="cal-header">Thu 29</div>
            <div class="cal-header">Fri 30</div>
            <div class="cal-header">Sat 31</div>
            <div class="cal-header">Sun 01</div>

            <!-- Employee 1 -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar" style="background: #064e3b; color: #34d399;">MS</div>
              <div>
                <div style="font-weight: 700; font-size: 12px; color: #fff;">Maria Santos</div>
                <div style="font-size: 10px; color: #71717a;">Shift Lead</div>
              </div>
            </div>
            <div class="shift-cell"><div class="shift-pill shift-morning">07:00 - 16:00<br>Makati HQ</div></div>
            <div class="shift-cell"><div class="shift-pill shift-morning">07:00 - 16:00<br>Makati HQ</div></div>
            <div class="shift-cell"><div class="shift-pill shift-morning">07:00 - 16:00<br>Makati HQ</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>
            <div class="shift-cell"><div class="shift-pill shift-morning">07:00 - 16:00<br>Makati HQ</div></div>
            <div class="shift-cell"><div class="shift-pill shift-morning">07:00 - 16:00<br>Makati HQ</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>

            <!-- Employee 2 -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar" style="background: #1e3a8a; color: #93c5fd;">JD</div>
              <div>
                <div style="font-weight: 700; font-size: 12px; color: #fff;">Juan dela Cruz</div>
                <div style="font-size: 10px; color: #71717a;">Inventory Lead</div>
              </div>
            </div>
            <div class="shift-cell"><div class="shift-pill shift-mid">10:00 - 19:00<br>BGC Store</div></div>
            <div class="shift-cell"><div class="shift-pill shift-mid">10:00 - 19:00<br>BGC Store</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>
            <div class="shift-cell"><div class="shift-pill shift-mid">10:00 - 19:00<br>BGC Store</div></div>
            <div class="shift-cell"><div class="shift-pill shift-mid">10:00 - 19:00<br>BGC Store</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>
            <div class="shift-cell"><div class="shift-pill shift-mid">10:00 - 19:00<br>BGC Store</div></div>

            <!-- Employee 3 -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar" style="background: #4c1d95; color: #c4b5fd;">SL</div>
              <div>
                <div style="font-weight: 700; font-size: 12px; color: #fff;">Sarah Lim</div>
                <div style="font-size: 10px; color: #71717a;">Pharmacist</div>
              </div>
            </div>
            <div class="shift-cell"><div class="shift-pill shift-night">14:00 - 23:00<br>Ortigas</div></div>
            <div class="shift-cell"><div class="shift-pill shift-night">14:00 - 23:00<br>Ortigas</div></div>
            <div class="shift-cell"><div class="shift-pill shift-night">14:00 - 23:00<br>Ortigas</div></div>
            <div class="shift-cell"><div class="shift-pill shift-night">14:00 - 23:00<br>Ortigas</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>
            <div class="shift-cell"><div class="shift-pill shift-off">REST DAY</div></div>
            <div class="shift-cell"><div class="shift-pill shift-night">14:00 - 23:00<br>Ortigas</div></div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(OUT_DIR, 'funnels.png') });

  // SCREEN 4: realtime.png -> Live GPS Geofence Map
  console.log('Rendering 4/5: realtime.png (Live GPS Geofence Map)...');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${COMMON_STYLES}
          .map-canvas {
            flex: 1;
            background: radial-gradient(circle at 50% 50%, #16161d 0%, #0d0d11 100%);
            border: 1px solid #27272a;
            border-radius: 14px;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .map-grid-bg {
            position: absolute;
            inset: 0;
            background-image: 
              linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 40px 40px;
          }
          .geofence-circle {
            position: absolute;
            border-radius: 50%;
            border: 2px solid #10b981;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.02) 70%);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
          }
          .pin-badge {
            background: #18181b;
            border: 1px solid #10b981;
            border-radius: 8px;
            padding: 6px 12px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div class="brand">
            <div class="brand-logo">GPS</div>
            <div>
              <div class="brand-text">Live GPS Geofence & Device Radar</div>
              <div style="font-size: 10px; color: #71717a;">Hardware Mock-Location Blocker · 100% Anti-Spoofing Verified</div>
            </div>
          </div>
          <div class="branch-tag">
            <span class="pulse-dot"></span>
            <span>Real-time Polling: Metro Manila & Regional Hubs · 42 Devices Active</span>
          </div>
          <div class="actions">
            <button class="btn-outline">Add Geofence Zone</button>
            <button class="btn-emerald">Live Audit Feed</button>
          </div>
        </div>

        <div class="map-canvas">
          <div class="map-grid-bg"></div>

          <!-- Zone 1: Makati Ayala -->
          <div class="geofence-circle" style="width: 280px; height: 280px; top: 120px; left: 180px;">
            <div class="pin-badge">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="pulse-dot"></span>
                <span style="font-weight: 700; color: #fff; font-size: 12px;">Makati Ayala HQ</span>
              </div>
              <div style="font-size: 10px; color: #10b981; font-weight: 600;">18 Staff Verified Inside (50m)</div>
            </div>
          </div>

          <!-- Zone 2: BGC Taguig -->
          <div class="geofence-circle" style="width: 220px; height: 220px; top: 240px; left: 520px; border-color: #3b82f6;">
            <div class="pin-badge" style="border-color: #3b82f6;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="pulse-dot" style="background: #3b82f6; box-shadow: 0 0 8px #3b82f6;"></span>
                <span style="font-weight: 700; color: #fff; font-size: 12px;">BGC High Street</span>
              </div>
              <div style="font-size: 10px; color: #60a5fa; font-weight: 600;">14 Staff Verified Inside (40m)</div>
            </div>
          </div>

          <!-- Zone 3: Ortigas Pasig -->
          <div class="geofence-circle" style="width: 190px; height: 190px; top: 80px; left: 820px; border-color: #f59e0b;">
            <div class="pin-badge" style="border-color: #f59e0b;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="pulse-dot" style="background: #f59e0b; box-shadow: 0 0 8px #f59e0b;"></span>
                <span style="font-weight: 700; color: #fff; font-size: 12px;">Ortigas Medical Hub</span>
              </div>
              <div style="font-size: 10px; color: #fbbf24; font-weight: 600;">6 Staff Active (60m)</div>
            </div>
          </div>

          <!-- Radar Stats Card Bottom Right -->
          <div style="position: absolute; bottom: 20px; right: 20px; width: 340px; background: rgba(18, 18, 21, 0.95); backdrop-filter: blur(12px); border: 1px solid #27272a; border-radius: 12px; padding: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 8px;">GEOFENCE TELEMETRY & INTEGRITY</div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">Spoofed GPS Attempts Blocked:</span>
                <span class="mono" style="color: #10b981; font-weight: 700;">0 (100% Secure)</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">Average Satellite Accuracy:</span>
                <span class="mono" style="color: #60a5fa; font-weight: 700;">±3.8 meters</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">Offline Punches Cached:</span>
                <span class="mono" style="color: #a1a1aa; font-weight: 700;">2 (Auto-Syncing)</span>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(OUT_DIR, 'realtime.png') });

  // SCREEN 5: settings.png -> DOLE Statutory Payroll Settings
  console.log('Rendering 5/5: settings.png (DOLE Payroll Settings)...');
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${COMMON_STYLES}
          .settings-section {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: 10px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #222226;
          }
          .setting-row:last-child { border-bottom: none; }
          .toggle-active {
            width: 36px;
            height: 20px;
            background: #10b981;
            border-radius: 10px;
            position: relative;
          }
          .toggle-active::after {
            content: '';
            position: absolute;
            top: 2px;
            right: 2px;
            width: 16px;
            height: 16px;
            background: #09090b;
            border-radius: 50%;
          }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div class="brand">
            <div class="brand-logo">CFG</div>
            <div>
              <div class="brand-text">DOLE Labor Rules & Philippine Statutory Settings</div>
              <div style="font-size: 10px; color: #71717a;">Omnibus Rules Implementing the Labor Code of the Philippines</div>
            </div>
          </div>
          <div class="branch-tag">
            <span class="pulse-dot"></span>
            <span>Compliance Version: 2026.1 · All Statutory Tables Up-to-Date</span>
          </div>
          <div class="actions">
            <button class="btn-outline">Reset to DOLE Default</button>
            <button class="btn-emerald">Save Configuration</button>
          </div>
        </div>

        <div class="grid-2">
          <!-- Left: DOLE Overtime & Premium Rates -->
          <div class="card">
            <div class="card-title-row">
              <div class="card-title">DOLE Overtime Multipliers (Rule II, Book III)</div>
              <span class="badge badge-emerald">Enforced</span>
            </div>

            <div class="settings-section">
              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Regular Workday Overtime</div>
                  <div style="font-size: 11px; color: #71717a;">Hourly rate + 25% for excess hours over 8</div>
                </div>
                <div class="mono" style="font-weight: 700; color: #10b981; font-size: 14px;">125.0% (1.25x)</div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Scheduled Rest Day Work</div>
                  <div style="font-size: 11px; color: #71717a;">First 8 hours on designated rest day</div>
                </div>
                <div class="mono" style="font-weight: 700; color: #10b981; font-size: 14px;">130.0% (1.30x)</div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Special Non-Working Holiday</div>
                  <div style="font-size: 11px; color: #71717a;">Work performed on special national holidays</div>
                </div>
                <div class="mono" style="font-weight: 700; color: #10b981; font-size: 14px;">130.0% (1.30x)</div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Regular National Holiday</div>
                  <div style="font-size: 11px; color: #71717a;">Work performed on DOLE declared regular holidays</div>
                </div>
                <div class="mono" style="font-weight: 700; color: #10b981; font-size: 14px;">200.0% (2.00x)</div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Night Shift Differential</div>
                  <div style="font-size: 11px; color: #71717a;">Hours worked between 10:00 PM and 6:00 AM</div>
                </div>
                <div class="mono" style="font-weight: 700; color: #10b981; font-size: 14px;">+10.0% Premium</div>
              </div>
            </div>
          </div>

          <!-- Right: Statutory Deductions & TRAIN Law -->
          <div class="card">
            <div class="card-title-row">
              <div class="card-title">Government Contributions & Tax</div>
              <span class="badge badge-blue">Auto-Calculated</span>
            </div>

            <div class="settings-section">
              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">2026 SSS Contribution Schedule</div>
                  <div style="font-size: 11px; color: #71717a;">14% total (9.5% ER / 4.5% EE split)</div>
                </div>
                <div class="toggle-active"></div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">PhilHealth 5.0% Premium</div>
                  <div style="font-size: 11px; color: #71717a;">Equal 2.5% employer / employee sharing</div>
                </div>
                <div class="toggle-active"></div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">Pag-IBIG HDMF ₱200 Cap</div>
                  <div style="font-size: 11px; color: #71717a;">Mandatory statutory monthly cap applied</div>
                </div>
                <div class="toggle-active"></div>
              </div>

              <div class="setting-row">
                <div>
                  <div style="font-weight: 700; font-size: 13px; color: #fff;">BIR TRAIN Withholding Tax</div>
                  <div style="font-size: 11px; color: #71717a;">Semi-monthly revised tax brackets (Tax Code 2316)</div>
                </div>
                <div class="toggle-active"></div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(OUT_DIR, 'settings.png') });

  await browser.close();
  console.log('Successfully generated all 5 photorealistic ClockTime dashboard assets in dist/dashboard/!');
}

renderScreens().catch(err => {
  console.error('Error rendering screens:', err);
  process.exit(1);
});
