const express = require("express");
const router = express.Router();

const { submitContact } = require("./public.controller");

// Unauthenticated on purpose: this is the marketing site's contact form.
// The controller holds the rate limit, the honeypot and the field caps.
router.post("/contact", submitContact);

module.exports = router;
