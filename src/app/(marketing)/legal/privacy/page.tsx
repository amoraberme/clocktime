import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Notice" updated="October 27, 2026">
      <p>
        This notice explains how ClockTime processes personal data in line with the Data Privacy Act of 2012
        (Republic Act No. 10173), its Implementing Rules and Regulations, and issuances of the National
        Privacy Commission (NPC).
      </p>
      <h2>Who is responsible</h2>
      <p>
        For employee records, your <strong>employer</strong> is the personal information controller and
        ClockTime processes the data on its behalf. For account holders and website visitors, ClockTime is the
        controller.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, phone, password (stored as a one-way hash).</li>
        <li>
          Employment records entered by your employer: position, pay rate, schedule, leave, government ID
          numbers (TIN, SSS, PhilHealth, Pag-IBIG) and bank account.
        </li>
        <li>Time records: clock-in and clock-out times, breaks, and the device and network used.</li>
        <li>
          <strong>Location</strong>, only at the moment you punch (and, if your employer enables auto
          clock-out, while the Clock screen is open during your shift).
        </li>
        <li>
          <strong>Photos</strong>, only if your employer requires photo proof when punching.
        </li>
        <li>Payroll results and payslips.</li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>
          To record attendance, compute pay, contributions and taxes, and produce payslips (legal obligation
          and contract of employment).
        </li>
        <li>
          To prevent time fraud through geofences, device checks and photo proof (legitimate interest of the
          employer, limited to work hours and sites).
        </li>
        <li>To operate, secure and improve the Service, and to bill customers.</li>
      </ul>
      <h2>How we protect it</h2>
      <ul>
        <li>
          Encryption in transit (TLS) and at rest; government ID and bank numbers are additionally encrypted
          at the application level.
        </li>
        <li>
          Each company&apos;s data is isolated; access is limited by role, and changes to time and pay records
          are kept in an audit trail.
        </li>
        <li>
          Punch photos are deleted automatically after your employer&apos;s retention period (default 90
          days).
        </li>
      </ul>
      <h2>Who we share it with</h2>
      <p>
        Service providers that help us run ClockTime under data processing agreements: cloud hosting and
        database, email delivery, file storage, and PayMongo for subscription payments. We do not sell
        personal data. Your employer may export payroll files to submit to SSS, PhilHealth, Pag-IBIG, the BIR
        and banks.
      </p>
      <h2>How long we keep it</h2>
      <p>
        For as long as your employer&apos;s account is active and as required by law (employment and payroll
        records are generally kept for at least three years under the Labor Code and longer for tax purposes).
        Deleted company data is removed from active systems within 30 days and from backups within 90 days.
      </p>
      <h2>Your rights</h2>
      <p>
        You have the right to be informed, to access, to correct, to object, to erasure or blocking, to data
        portability, to damages, and to file a complaint with the NPC. Employees should first contact their
        employer; you can also reach us directly.
      </p>
      <h2>Contact our Data Protection Officer</h2>
      <p>dpo@clocktime.ph</p>
    </LegalPage>
  );
}
