const express = require("express");
const router = express.Router();

const {
  getSettings,
  updateSettings,
  getMySettings,
  updateMySettings,
  changeMyPassword,
  listMyTeamUsers,
  inviteMyTeamUser,
  deleteMyTeamUser,
} = require("./settings.controller");
const {
  requireAuth,
  requireAdmin,
  requireRole,
} = require("../../middleware/auth");

router.get("/", requireAuth, requireAdmin, getSettings);
router.patch("/", requireAuth, requireAdmin, updateSettings);

router.get("/me", requireAuth, requireRole("client"), getMySettings);
router.patch("/me", requireAuth, requireRole("client"), updateMySettings);
router.patch("/change-password", requireAuth, changeMyPassword);

router.get("/team-users", requireAuth, requireRole("client"), listMyTeamUsers);
router.post(
  "/team-users/invite",
  requireAuth,
  requireRole("client"),
  inviteMyTeamUser
);
router.delete(
  "/team-users/:userId",
  requireAuth,
  requireRole("client"),
  deleteMyTeamUser
);

module.exports = router;