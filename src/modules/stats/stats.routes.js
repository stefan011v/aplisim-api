const express = require("express");
const router = express.Router();

const { requireAuth } = require("../../middleware/auth");
const { getShellStats } = require("./stats.controller");

router.get("/shell", requireAuth, getShellStats);

module.exports = router;
