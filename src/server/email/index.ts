import "server-only";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
};

/** Messages sent through the console provider, kept for tests and the dev outbox. */
export const devOutbox: EmailMessage[] = [];

export async function sendEmail(message: EmailMessage) {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend" && e.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: e.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
        })),
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    return;
  }
  devOutbox.push(message);
  if (devOutbox.length > 50) devOutbox.shift();
  console.info(
    `[email] to=${message.to} subject="${message.subject}"\n${message.text ?? stripTags(message.html)}`,
  );
}

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimal branded layout shared by every transactional email. */
export function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p><p style="color:#64748b;font-size:12px">Or paste this link into your browser:<br>${cta.url}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<div style="font-weight:700;font-size:18px;color:#0f766e;margin-bottom:16px">ClockTime</div>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
<div style="font-size:15px;line-height:1.6">${body}</div>${button}
</div></body></html>`;
}

export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
