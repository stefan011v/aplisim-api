const prisma = require("../../config/prisma");

/**
 * Public contact form.
 *
 * This is the only unauthenticated write in the API, so it is deliberately
 * narrow: a fixed set of short string fields, no HTML, no client assignment,
 * and every submission lands as an ordinary Lead for someone to triage.
 */

const LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LIMIT_PER_WINDOW = 5;

// Single container, so an in-memory counter is enough and costs no dependency.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter((t) => now - t < LIMIT_WINDOW_MS);

  seen.push(now);
  hits.set(ip, seen);

  // Keep the map from growing without bound on a long-running process.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] > LIMIT_WINDOW_MS) hits.delete(key);
    }
  }

  return seen.length > LIMIT_PER_WINDOW;
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function submitContact(req, res) {
  const body = req.body || {};

  // Honeypot: a real person never sees this field, so anything in it is a bot.
  if (clean(body.website, 50)) {
    return res.status(201).json({ ok: true });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ message: "Too many messages. Try again later." });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const company = clean(body.company, 160);
  const phone = clean(body.phone, 40);
  const service = clean(body.service, 60);
  const message = clean(body.message, 4000);

  if (!name || !email || !message) {
    return res.status(400).json({ message: "Name, email and message are required." });
  }
  if (!EMAIL.test(email)) {
    return res.status(400).json({ message: "That email address does not look right." });
  }

  try {
    await prisma.lead.create({
      data: {
        title: service ? `${service} - ${name}` : `Website enquiry - ${name}`,
        contactName: name,
        companyName: company || null,
        email,
        phone: phone || null,
        source: "website",
        status: "new",
        notes: message,
      },
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("public contact failed:", err);
    return res.status(500).json({ message: "Could not send the message." });
  }
}

module.exports = { submitContact };
