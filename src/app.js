const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./modules/auth/auth.routes");
const accessRequestRoutes = require("./modules/accessRequests/accessRequests.routes");
const clientRoutes = require("./modules/clients/clients.routes");
const leadRoutes = require("./modules/leads/leads.routes");
const ticketRoutes = require("./modules/tickets/tickets.routes");
const settingsRoutes = require("./modules/settings/settings.routes");
const userRoutes = require("./modules/users/users.routes");
const statsRoutes = require("./modules/stats/stats.routes");

const app = express();

const isProduction = process.env.NODE_ENV === "production";

const allowedOrigins = (process.env.CORS_ORIGIN || (isProduction ? "" : "http://localhost:5173"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGIN is not set");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (req, res) => {
  res.send("APLISIM API is running");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "APLISIM API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/access-requests", accessRequestRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stats", statsRoutes);

module.exports = app;