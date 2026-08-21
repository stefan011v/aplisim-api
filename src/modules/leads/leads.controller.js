const prisma = require("../../config/prisma");
const {
  parsePagination,
  parseSort,
  parseEnumFilter,
  buildSearchFilter,
  combineWhere,
  buildListResponse,
} = require("../../utils/listQuery");

const ALLOWED_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "won",
  "lost",
];

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const LEAD_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "status",
  "estimatedValue",
];

const LEAD_SEARCH_FIELDS = [
  "title",
  "companyName",
  "contactName",
  "email",
  "phone",
  "source",
];

async function getLeads(req, res) {
  try {
    const pagination = parsePagination(req.query);

    const where = combineWhere(
      buildSearchFilter(req.query.q, LEAD_SEARCH_FIELDS),
      parseEnumFilter(req.query.status, ALLOWED_LEAD_STATUSES)
        ? { status: req.query.status }
        : null
    );

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: parseSort(req.query, LEAD_SORT_FIELDS),
      }),
      prisma.lead.count({ where }),
    ]);

    return res.json(buildListResponse(leads, total, pagination));
  } catch (error) {
    console.error("GET_LEADS_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch leads",
    });
  }
}

async function getLeadById(req, res) {
  try {
    const leadId = Number(req.params.id);

    if (!leadId || Number.isNaN(leadId)) {
      return res.status(400).json({
        message: "Invalid lead id",
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    return res.json(lead);
  } catch (error) {
    console.error("GET_LEAD_BY_ID_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch lead",
    });
  }
}

async function getLeadsCount(req, res) {
  try {
    const count = await prisma.lead.count();
    return res.json({ count });
  } catch (error) {
    console.error("GET_LEADS_COUNT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch leads count",
    });
  }
}

async function createLead(req, res) {
  try {
    const {
      title,
      companyName,
      contactName,
      email,
      phone,
      source,
      status,
      estimatedValue,
      notes,
      clientId,
      proposalStatus,
      proposalSentAt,
      proposalAmount,
      proposalNotes,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Lead title is required",
      });
    }

    const parsedClientId =
      clientId === null || clientId === undefined || clientId === ""
        ? null
        : Number(clientId);

    if (parsedClientId !== null && Number.isNaN(parsedClientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (parsedClientId !== null) {
      const existingClient = await prisma.client.findUnique({
        where: { id: parsedClientId },
      });

      if (!existingClient) {
        return res.status(404).json({
          message: "Selected client not found",
        });
      }
    }

    const lead = await prisma.lead.create({
      data: {
        title: title.trim(),
        companyName: normalizeText(companyName),
        contactName: normalizeText(contactName),
        email: normalizeEmail(email),
        phone: normalizeText(phone),
        source: normalizeText(source) || "website",
        status: normalizeText(status) || "new",
        estimatedValue: normalizeNumber(estimatedValue),
        notes: normalizeText(notes),
        clientId: parsedClientId,
        convertedAt:
          (normalizeText(status) || "new") === "won" && parsedClientId
            ? new Date()
            : null,
        proposalStatus: normalizeText(proposalStatus),
        proposalSentAt: normalizeDate(proposalSentAt),
        proposalAmount: normalizeNumber(proposalAmount),
        proposalNotes: normalizeText(proposalNotes),
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    return res.status(201).json(lead);
  } catch (error) {
    console.error("CREATE_LEAD_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create lead",
    });
  }
}

async function updateLead(req, res) {
  try {
    const leadId = Number(req.params.id);

    if (!leadId || Number.isNaN(leadId)) {
      return res.status(400).json({
        message: "Invalid lead id",
      });
    }

    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!existingLead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    const {
      title,
      companyName,
      contactName,
      email,
      phone,
      source,
      status,
      estimatedValue,
      notes,
      clientId,
      proposalStatus,
      proposalSentAt,
      proposalAmount,
      proposalNotes,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: "Lead title is required",
      });
    }

    const parsedClientId =
      clientId === null || clientId === undefined || clientId === ""
        ? existingLead.clientId
        : Number(clientId);

    if (parsedClientId !== null && Number.isNaN(parsedClientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (parsedClientId !== null) {
      const existingClient = await prisma.client.findUnique({
        where: { id: parsedClientId },
      });

      if (!existingClient) {
        return res.status(404).json({
          message: "Selected client not found",
        });
      }
    }

    const nextStatus = normalizeText(status) || "new";
    const previousConvertedAt = existingLead.convertedAt;

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        title: title.trim(),
        companyName: normalizeText(companyName),
        contactName: normalizeText(contactName),
        email: normalizeEmail(email),
        phone: normalizeText(phone),
        source: normalizeText(source) || "website",
        status: nextStatus,
        estimatedValue: normalizeNumber(estimatedValue),
        notes: normalizeText(notes),
        clientId: parsedClientId,
        convertedAt:
          nextStatus === "won" && parsedClientId
            ? previousConvertedAt || new Date()
            : nextStatus !== "won"
            ? null
            : previousConvertedAt,
        proposalStatus: normalizeText(proposalStatus),
        proposalSentAt: normalizeDate(proposalSentAt),
        proposalAmount: normalizeNumber(proposalAmount),
        proposalNotes: normalizeText(proposalNotes),
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    return res.json(updatedLead);
  } catch (error) {
    console.error("UPDATE_LEAD_ERROR:", error);
    return res.status(500).json({
      message: "Failed to update lead",
    });
  }
}

async function convertLeadToClient(req, res) {
  try {
    const leadId = Number(req.params.id);

    if (!leadId || Number.isNaN(leadId)) {
      return res.status(400).json({
        message: "Invalid lead id",
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    if (lead.clientId) {
      return res.status(409).json({
        message: "Lead is already linked to a client",
        lead,
      });
    }

    const normalizedEmail = normalizeEmail(lead.email);
    const companyName =
      normalizeText(lead.companyName) ||
      normalizeText(lead.title) ||
      `Lead ${lead.id}`;

    if (normalizedEmail) {
      const existingClientByEmail = await prisma.client.findFirst({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingClientByEmail) {
        return res.status(409).json({
          message:
            "A client with this email already exists. Open the existing client instead of creating a duplicate.",
          client: existingClientByEmail,
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          companyName,
          contactName: normalizeText(lead.contactName),
          email: normalizedEmail,
          phone: normalizeText(lead.phone),
          notes: normalizeText(lead.notes),
          status: "active",
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: {
          clientId: client.id,
          convertedAt: new Date(),
          status: "won",
        },
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      });

      return {
        client,
        lead: updatedLead,
      };
    });

    return res.json({
      message: "Lead converted to client successfully",
      lead: result.lead,
      client: result.client,
    });
  } catch (error) {
    console.error("CONVERT_LEAD_ERROR:", error);
    return res.status(500).json({
      message: "Failed to convert lead to client",
    });
  }
}

async function deleteLead(req, res) {
  try {
    const leadId = Number(req.params.id);

    if (!leadId || Number.isNaN(leadId)) {
      return res.status(400).json({
        message: "Invalid lead id",
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    await prisma.lead.delete({
      where: { id: leadId },
    });

    return res.json({
      message: "Lead deleted successfully",
    });
  } catch (error) {
    console.error("DELETE_LEAD_ERROR:", error);
    return res.status(500).json({
      message: "Server error while deleting lead",
    });
  }
}

module.exports = {
  getLeads,
  getLeadById,
  getLeadsCount,
  createLead,
  updateLead,
  convertLeadToClient,
  deleteLead,
};