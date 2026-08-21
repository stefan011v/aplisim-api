const express = require("express");
const router = express.Router();

const { requireAuth, requireRole } = require("../../middleware/auth");
const {
  getLeads,
  getLeadById,
  getLeadsCount,
  createLead,
  updateLead,
  convertLeadToClient,
  deleteLead,
} = require("./leads.controller");

router.get(
  "/count",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getLeadsCount
);

router.get(
  "/:id",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getLeadById
);

router.get(
  "/",
  requireAuth,
  requireRole("admin", "staff", "viewer"),
  getLeads
);

router.post(
  "/",
  requireAuth,
  requireRole("admin", "staff"),
  createLead
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("admin", "staff"),
  updateLead
);

router.post(
  "/:id/convert",
  requireAuth,
  requireRole("admin"),
  convertLeadToClient
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  deleteLead
);

module.exports = router;