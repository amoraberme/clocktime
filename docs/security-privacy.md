# ClockTime: security, data privacy and integration

_Answer to RFP item 7, integration and security. Applies to the ClockTime Enterprise plan._

## 1. Integration with your IT and payroll systems

| Need                    | How ClockTime covers it                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payroll import**      | Cutoff attendance report per employee per day: in/out, hours, approved OT, OT pending review, late, undertime, absences, leave and remarks. Exported as Excel or CSV per sheet. The same rows are available from `GET /api/v1/attendance`.          |
| **REST API**            | Key-based (`Authorization: Bearer ct_…`), with scopes `read`, `punch`, `write` and `reports`. OpenAPI 3 spec at `/api/v1/openapi.json`. Key usage is logged.                                                                                        |
| **HRIS → ClockTime**    | `PUT /api/v1/employees/{employeeNo}` upserts people, including branch codes, terminal ID and archiving. A CSV import handles up to 2,000 rows at a time.                                                                                            |
| **Schedules**           | CSV import with one row per person per day. It handles overnight and 24-hour duties and rest days. Re-uploading replaces those days, and attendance is re-matched to the latest schedule automatically.                                             |
| **Biometric terminals** | ZKTeco-compatible cloud push (ADMS) with no on-site server. Attendance-log file import (`attlog.dat` / CSV) covers older devices. `POST /api/v1/attendance-logs` serves site bridges and other systems. Duplicate and re-uploaded logs are ignored. |
| **Real-time feeds**     | Signed webhooks (HMAC-SHA256) for `punch.created`, `attendance.updated`, `request.approved`/`declined`, `payrun.finalized` and `employee.updated`. Failed deliveries are retried automatically for about a day.                                     |

## 2. Access control

**Roles**

| Role              | Access                                                                           |
| ----------------- | -------------------------------------------------------------------------------- |
| Owner, Admin      | Everything                                                                       |
| HR                | Nationwide people, attendance, final approvals, reports and payroll. No billing. |
| Timekeeper        | Attendance review, corrections and reports. No pay rates.                        |
| Branch supervisor | Assigned branches and departments only.                                          |
| Employee          | Own records only.                                                                |

**Scope enforcement.** Every list, report, export and approval checks the user's branch and department scope on the server. A supervisor cannot approve requests outside their scope, or their own.

**Approvals.** One or two levels (supervisor → HR), configurable per request type. Every step is recorded.

**Two-step verification.** Authenticator apps (TOTP) with backup codes.

- The company can require it for owners, admins and HR.
- Admin accounts with 2FA cannot sign in with email links.

**Tenant isolation.** Every database query is scoped to your company.

## 3. Audit trail

- Every change to time, schedules, requests, pay, settings, API keys and webhooks is logged, along with every export of sensitive data. Each entry records who, when, the before and after values, the reason and the IP address.
- The log is **hash-chained**: each entry includes a SHA-256 of the previous one. **Settings → Audit log → Verify integrity** detects any edited, deleted or reordered entry.
- It can be filtered by person, record type, action and date, and exported to CSV (the export includes the hashes).

## 4. Attendance integrity (anti-buddy-punching)

- **No duplicates across methods.** A fingerprint tap followed by a phone punch within the duplicate window (3 minutes by default) is recorded once.
- **Field staff (drivers, sales):**
  - GPS accuracy limits
  - selfie proof
  - punches allowed from their own phone only
  - flags for stale GPS fixes, impossible travel and one phone used by several people
- **Offline punches** are encrypted on the device and keep their original time. They are checked against the phone's clock offset and order, and flagged for HR if anything looks off.
- **Long duties and missing punches** go to HR for review. They are never auto-paid as overtime.
- **Locked payroll periods** can't be changed by late punches. HR gets an exception to resolve instead.

## 5. Data privacy (Republic Act 10173)

**Biometrics**

- Fingerprint and face templates stay **on the terminal**. ClockTime receives only the terminal user ID, the time and the method.
- Employees see a privacy notice and give consent in the app. Their consent date is visible to HR.
- Employees can be offered a PIN, RFID card or phone instead.

**Location**

- Location is recorded only at the moment of clock-in or clock-out, never continuously.
- Coordinates are deleted automatically after the company's retention period (365 days by default). Punch times and branches are kept for payroll.

**Photos** are deleted after the photo retention period (90 days by default).

**Encryption**

- TLS 1.2+ in transit.
- Encrypted at rest by the database and storage providers.
- Government ID numbers, bank accounts, RFID card numbers and webhook secrets are additionally AES-256-GCM encrypted in the application.

**Data subject requests.** Employee records and attendance can be exported on request. A company can delete its account, which removes its data from the live database immediately.

**Breach response.** If personal data is compromised, the NPC and affected clients are notified within 72 hours. The audit trail helps establish the scope.

## 6. Backups and continuity

- **Point-in-time recovery** on the managed Postgres database (Neon).
- **Nightly encrypted (AES-256) logical backup** to separate object storage (Cloudflare R2). Each night's archive is checked automatically to confirm it decrypts and is complete. Backups expire after 35 days.
- **Documented restore runbook:**
  - target recovery time: 4 hours
  - data loss: seconds with point-in-time recovery, or up to 24 hours from the nightly dump
  - restore drills every quarter
- **Terminals and phones keep working offline** and upload when the connection returns, so a network or service outage doesn't lose punches.

## 7. Items to confirm during onboarding

- **Terminal model and firmware.** Some older ZKTeco firmware only pushes over plain HTTP. A preview deployment is tested with one of your units before rollout; an HTTPS relay or site bridge is available if needed.
- **Your payroll system's import format.** Export columns can be mapped to it.
- **Retention periods.** Location, photos and records can be aligned with your data retention policy.
- **SSO (Google / Microsoft).** On the roadmap. Ask if it's required.
