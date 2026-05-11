const prisma = require("../../config/prisma");

async function createClientContact(req, res) {
  try {
    const clientId = Number(req.params.clientId);

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

    const { fullName, email, phone, role, notes } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        message: "Full name is required",
      });
    }

    const contact = await prisma.clientContact.create({
      data: {
        clientId,
        fullName: fullName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        role: role?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return res.status(201).json(contact);
  } catch (error) {
    console.error("CREATE_CLIENT_CONTACT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to create client contact",
    });
  }
}

async function updateClientContact(req, res) {
  try {
    const clientId = Number(req.params.clientId);
    const contactId = Number(req.params.contactId);

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (!contactId || Number.isNaN(contactId)) {
      return res.status(400).json({
        message: "Invalid contact id",
      });
    }

    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        clientId,
      },
    });

    if (!existingContact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    const { fullName, email, phone, role, notes } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        message: "Full name is required",
      });
    }

    const updatedContact = await prisma.clientContact.update({
      where: {
        id: contactId,
      },
      data: {
        fullName: fullName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        role: role?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    return res.json(updatedContact);
  } catch (error) {
    console.error("UPDATE_CLIENT_CONTACT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to update client contact",
    });
  }
}

async function deleteClientContact(req, res) {
  try {
    const clientId = Number(req.params.clientId);
    const contactId = Number(req.params.contactId);

    if (!clientId || Number.isNaN(clientId)) {
      return res.status(400).json({
        message: "Invalid client id",
      });
    }

    if (!contactId || Number.isNaN(contactId)) {
      return res.status(400).json({
        message: "Invalid contact id",
      });
    }

    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        clientId,
      },
    });

    if (!existingContact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    await prisma.clientContact.delete({
      where: {
        id: contactId,
      },
    });

    return res.json({
      message: "Contact deleted successfully",
    });
  } catch (error) {
    console.error("DELETE_CLIENT_CONTACT_ERROR:", error);
    return res.status(500).json({
      message: "Failed to delete client contact",
    });
  }
}

module.exports = {
  createClientContact,
  updateClientContact,
  deleteClientContact,
};