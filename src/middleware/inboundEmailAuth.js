const inboundEmailSecret = process.env.INBOUND_EMAIL_SECRET;

if (!inboundEmailSecret) {
  throw new Error("INBOUND_EMAIL_SECRET is not set");
}

function requireInboundEmailSecret(req, res, next) {
  const providedHeader = req.headers["x-inbound-secret"];
  const provided =
    typeof providedHeader === "string"
      ? providedHeader.trim()
      : Array.isArray(providedHeader)
      ? String(providedHeader[0] || "").trim()
      : "";

  if (!provided || provided !== inboundEmailSecret) {
    return res.status(401).json({
      message: "Unauthorized inbound email request",
    });
  }

  return next();
}

module.exports = {
  requireInboundEmailSecret,
};