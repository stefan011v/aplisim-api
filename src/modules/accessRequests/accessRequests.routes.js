const express = require("express");
const router = express.Router();

const {
  createAccessRequest,
  listAccessRequests,
  updateAccessRequestStatus,
  convertAccessRequestToClient,
  deleteAccessRequest,
} = require("./accessRequests.controller");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

router.post("/", createAccessRequest);
router.get("/", requireAuth, requireAdmin, listAccessRequests);
router.patch("/:id/status", requireAuth, requireAdmin, updateAccessRequestStatus);
router.post(
  "/:id/convert-to-client",
  requireAuth,
  requireAdmin,
  convertAccessRequestToClient
);
router.delete("/:id", requireAuth, requireAdmin, deleteAccessRequest);

module.exports = router;