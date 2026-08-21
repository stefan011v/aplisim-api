const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const {
  parsePagination,
  parseSort,
  parseEnumFilter,
  buildSearchFilter,
  combineWhere,
  buildListResponse,
} = require("../../utils/listQuery");

const ALLOWED_CLIENT_STATUSES = ["prospect", "active", "paused", "closed"];

const ALLOWED_PRIMARY_SERVICES = [
  "web-app-development",
  "help-desk-it-ops",
  "crm-integrations",
  "ai-automation",
];

const CLIENT_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "companyName",
  "status",
  "city",
];

const CLIENT_SEARCH_FIELDS = [
  "companyName",
  "contactName",
  "email",
  "phone",
  "city",
  "packageName",
];

async function getClients(req, res) {
  try {
    const pagination = parsePagination(req.query);

    const where = combineWhere(
      buildSearchFilter(req.query.q, CLIENT_SEARCH_FIELDS),
      parseEnumFilter(req.query.status, ALLOWED_CLIENT_STATUSES)
        ? { status: req.query.status }
        : null,
      parseEnumFilter(req.query.primaryService, ALLOWED_PRIMARY_SERVICES)
        ? { primaryService: req.query.primaryService }
        : null
    );

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        include: {
          contacts: true,
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              clientPortalRole: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: parseSort(req.query, CLIENT_SORT_FIELDS),
      }),
      prisma.client.count({ where }),
    ]);

    return res.json(buildListResponse(clients, total, pagination));
  } catch (error) {
    console.error("GET_CLIENTS_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch clients",
    });
  }
}

async function getClientsCount(req, res) {
  try {
    const count = await prisma.client.count();
    return res.json({ count });
  } catch (error) {
    console.error("GET_CLIENTS_COUNT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch clients count",
    });
  }
}

async function getClientById(req, res) {
  try {
    const clientId = Number(req.params.id);

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (req.user.role === "client") {
      if (!req.user.clientId || Number(req.user.clientId) !== clientId) {
        return res.status(403).json({
          message: "Forbidden",
        });
      }
    }

    const client = await prisma.client.findUnique({
      where: {
        id: clientId,
      },
      include: {
        leads: {
          orderBy: {
            createdAt: "desc",
          },
        },
        contacts: {
          orderBy: {
            createdAt: "desc",
          },
        },
        tickets: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            clientId: true,
            clientPortalRole: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    return res.json(client);
  } catch (error) {
    console.error("GET_CLIENT_BY_ID_ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch client",
    });
  }
}

async function createClient(req, res) {
  try {
    const {
      companyName,
      contactName,
      email,
      phone,
      website,
      city,
      status,
      primaryService,
      packageName,
      notes,
    } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        message: "Company name is required",
      });
    }

    const client = await prisma.client.create({
      data: {
        companyName: companyName.trim(),
        contactName: contactName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        city: city?.trim() || null,
        status: status?.trim() || "prospect",
        primaryService: primaryService?.trim() || null,
        packageName: packageName?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return res.status(201).json(client);
  } catch (error) {
    console.error("CREATE_CLIENT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create client",
    });
  }
}

async function updateClient(req, res) {
  try {
    const clientId = Number(req.params.id);

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    const existingClient = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!existingClient) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const {
      companyName,
      contactName,
      email,
      phone,
      website,
      city,
      status,
      primaryService,
      packageName,
      notes,
    } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        message: "Company name is required",
      });
    }

    const updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: {
        companyName: companyName.trim(),
        contactName: contactName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        city: city?.trim() || null,
        status: status?.trim() || "prospect",
        primaryService: primaryService?.trim() || null,
        packageName: packageName?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return res.json(updatedClient);
  } catch (error) {
    console.error("UPDATE_CLIENT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to update client",
    });
  }
}

async function updateClientPortalUserRole(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    const clientId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const { clientPortalRole } = req.body;

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (!["admin", "member"].includes(clientPortalRole)) {
      return res.status(400).json({
        message: "clientPortalRole must be admin or member",
      });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const portalUser = await prisma.user.findFirst({
      where: {
        id: userId,
        clientId,
        role: "client",
      },
      select: {
        id: true,
        clientId: true,
        role: true,
        clientPortalRole: true,
      },
    });

    if (!portalUser) {
      return res.status(404).json({
        message: "Portal user not found for this client",
      });
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        clientPortalRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clientId: true,
        clientPortalRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json(updatedUser);
  } catch (error) {
    console.error("UPDATE_CLIENT_PORTAL_USER_ROLE_ERROR:", error);
    return res.status(500).json({
      message: "Failed to update portal user role",
    });
  }
}

async function deleteClient(req, res) {
  try {
    const clientId = Number(req.params.id);

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    const existingClient = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        companyName: true,
      },
    });

    if (!existingClient) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    await prisma.client.delete({
      where: { id: clientId },
    });

    return res.json({
      message: "Client deleted successfully",
      deletedClient: {
        id: existingClient.id,
        companyName: existingClient.companyName,
      },
    });
  } catch (error) {
    console.error("DELETE_CLIENT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to delete client",
    });
  }
}

async function createClientPortalUser(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    const clientId = Number(req.params.id);
    const { name, email, password, clientPortalRole } = req.body;

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Name is required",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    if (!["admin", "member"].includes(clientPortalRole)) {
      return res.status(400).json({
        message: "clientPortalRole must be admin or member",
      });
    }

    const existingClient = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!existingClient) {
      return res.status(404).json({
        message: "Client not found",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: email.trim().toLowerCase(),
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: "client",
        clientId,
        clientPortalRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clientId: true,
        clientPortalRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json(user);
  } catch (error) {
    console.error("CREATE_CLIENT_PORTAL_USER_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create portal user",
    });
  }
}

module.exports = {
  getClients,
  getClientsCount,
  getClientById,
  createClient,
  updateClient,
  createClientPortalUser,
  updateClientPortalUserRole,
  deleteClient,
};