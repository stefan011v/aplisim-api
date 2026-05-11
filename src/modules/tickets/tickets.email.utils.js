function extractTicketIdFromSubject(subject = "") {
  const patterns = [
    /\[Ticket\s*#(\d+)\]/i,
    /Ticket\s*#(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function stripTicketTagFromSubject(subject = "") {
  return subject
    .replace(/\[Ticket\s*#\d+\]\s*/i, "")
    .replace(/Ticket\s*#\d+\s*[-:]?\s*/i, "")
    .trim();
}

module.exports = {
  extractTicketIdFromSubject,
  stripTicketTagFromSubject,
};