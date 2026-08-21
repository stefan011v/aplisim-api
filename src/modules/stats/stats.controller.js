const prisma = require("../../config/prisma");

const OPEN_TICKET_STATUSES = ["new", "in_progress", "waiting_client"];

/**
 * Counts for the app shell (sidebar badges and the attention popover).
 * Replaces four full-table list fetches with one batch of count queries.
 */
async function getShellStats(req, res) {
  try {
    const isClientUser = req.user.role === "client";
    const isAdminUser = req.user.role === "admin";

    if (isClientUser) {
      const clientId = req.user.clientId || -1;

      const [tickets, urgentTickets, waitingClientTickets] = await Promise.all([
        prisma.ticket.count({ where: { clientId } }),
        prisma.ticket.count({
          where: {
            clientId,
            priority: "urgent",
            status: { in: OPEN_TICKET_STATUSES },
          },
        }),
        prisma.ticket.count({
          where: { clientId, status: "waiting_client" },
        }),
      ]);

      return res.json({
        clients: req.user.clientId ? 1 : 0,
        leads: 0,
        tickets,
        accessRequests: 0,
        urgentTickets,
        newAccessRequests: 0,
        proposalLeads: 0,
        waitingClientTickets,
      });
    }

    const [
      clients,
      leads,
      tickets,
      urgentTickets,
      waitingClientTickets,
      proposalLeads,
      accessRequests,
      newAccessRequests,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.lead.count(),
      prisma.ticket.count(),
      prisma.ticket.count({
        where: {
          priority: "urgent",
          status: { in: OPEN_TICKET_STATUSES },
        },
      }),
      prisma.ticket.count({ where: { status: "waiting_client" } }),
      prisma.lead.count({ where: { status: "proposal_sent" } }),
      isAdminUser ? prisma.accessRequest.count() : Promise.resolve(0),
      isAdminUser
        ? prisma.accessRequest.count({ where: { status: "new" } })
        : Promise.resolve(0),
    ]);

    return res.json({
      clients,
      leads,
      tickets,
      accessRequests,
      urgentTickets,
      newAccessRequests,
      proposalLeads,
      waitingClientTickets,
    });
  } catch (error) {
    console.error("GET_SHELL_STATS_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch workspace stats",
    });
  }
}

module.exports = {
  getShellStats,
};
