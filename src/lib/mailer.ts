// SMTP email sender.
// Configure via env vars (see .env.example).
// If SMTP_HOST / SMTP_USER / SMTP_PASS are absent the mail is logged to the
// console (useful in local development).

import nodemailer from "nodemailer";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // Development fallback — show the link in the server console.
    console.info(
      `[mailer] (SMTP not configured — logging to console)\n` +
        `  TO:      ${opts.to}\n` +
        `  SUBJECT: ${opts.subject}\n` +
        `  BODY:\n${opts.text ?? opts.html}`,
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const from =
    process.env.SMTP_FROM
      ? `"Thraive联盟营销系统" <${process.env.SMTP_FROM}>`
      : `"Thraive联盟营销系统" <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Prevent self-signed cert errors on some corporate SMTP servers
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
