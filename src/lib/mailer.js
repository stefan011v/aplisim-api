const nodemailer = require("nodemailer");

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE).toLowerCase() === "true";
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;

if (!smtpHost) {
  throw new Error("SMTP_HOST is not set");
}

if (!smtpUser) {
  throw new Error("SMTP_USER is not set");
}

if (!smtpPass) {
  throw new Error("SMTP_PASS is not set");
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

async function sendSupportEmail({ to, subject, text, html }) {
  if (!to || !String(to).trim()) {
    throw new Error("Recipient email is required");
  }

  if (!subject || !String(subject).trim()) {
    throw new Error("Email subject is required");
  }

  if (!text && !html) {
    throw new Error("Email content is required");
  }

  const info = await transporter.sendMail({
    from: smtpFrom,
    to: String(to).trim(),
    subject: String(subject).trim(),
    text: text || undefined,
    html: html || undefined,
  });

  return info;
}

module.exports = {
  sendSupportEmail,
};