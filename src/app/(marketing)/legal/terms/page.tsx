import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 27, 2026">
      <p>
        These terms govern your use of ClockTime (the “Service”). By creating an account you agree to them on
        behalf of yourself and the business you represent (the “Customer”).
      </p>
      <h2>1. The Service</h2>
      <p>
        ClockTime provides time tracking, scheduling, leave management and payroll computation tools. Payroll
        results are computed from the data and settings you provide and the statutory tables in effect. You
        remain responsible for reviewing payroll before paying employees and for filing and remitting
        government contributions and taxes.
      </p>
      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate information and keep your password secure.</li>
        <li>Owners and admins are responsible for the people they invite and the permissions they grant.</li>
        <li>
          You must be authorized to enter employee information, including government ID numbers and bank
          details.
        </li>
      </ul>
      <h2>3. Plans, trials and billing</h2>
      <ul>
        <li>
          Paid plans are billed in advance, monthly or yearly, in Philippine pesos through our payment
          processor.
        </li>
        <li>Trials end automatically; your data is kept and you can continue on the Free plan.</li>
        <li>
          If a payment is overdue, paid features are paused after a grace period. Data is not deleted for
          non-payment.
        </li>
        <li>Fees are non-refundable except where required by law.</li>
      </ul>
      <h2>4. Acceptable use</h2>
      <p>
        Do not misuse the Service, attempt to access other customers&apos; data, interfere with its operation,
        or use it to track people without their knowledge.
      </p>
      <h2>5. Customer data</h2>
      <p>
        You own your data. For personal data of your employees, you are the personal information controller
        and ClockTime acts as your personal information processor under the Data Privacy Act of 2012. See our
        Privacy Notice. You can export or delete your company&apos;s data at any time from Settings.
      </p>
      <h2>6. Availability and changes</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted service. We may improve or change
        features; we will give notice of material changes to paid features.
      </p>
      <h2>7. Liability</h2>
      <p>
        To the extent permitted by law, ClockTime is not liable for indirect or consequential losses, and our
        total liability is limited to the fees you paid in the 12 months before the claim.
      </p>
      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of the Philippines.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: support@clocktime.ph</p>
    </LegalPage>
  );
}
