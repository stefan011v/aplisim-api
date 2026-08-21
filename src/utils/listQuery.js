const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * Pagination is opt-in: a request that sends neither `page` nor `pageSize`
 * still receives a plain array, which keeps every existing caller working.
 */
function parsePagination(query = {}) {
  const wantsPagination =
    query.page !== undefined || query.pageSize !== undefined;

  if (!wantsPagination) {
    return { paginated: false };
  }

  const rawPage = Number(query.page);
  const rawPageSize = Number(query.pageSize);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    paginated: true,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function parseSort(query = {}, allowedFields = [], fallbackField = "createdAt") {
  const requested = String(query.sort || "").trim();
  const field = allowedFields.includes(requested) ? requested : fallbackField;
  const order = String(query.order || "").toLowerCase() === "asc" ? "asc" : "desc";

  return { [field]: order };
}

function buildSearchFilter(term, fields = []) {
  const trimmed = String(term || "").trim();

  if (!trimmed || !fields.length) return null;

  return {
    OR: fields.map((field) => ({
      [field]: { contains: trimmed, mode: "insensitive" },
    })),
  };
}

function parseEnumFilter(value, allowed = []) {
  const trimmed = String(value || "").trim();

  if (!trimmed || trimmed === "all" || !allowed.includes(trimmed)) {
    return null;
  }

  return trimmed;
}

function combineWhere(...clauses) {
  const parts = clauses.filter(Boolean);

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];

  return { AND: parts };
}

function buildListResponse(items, total, pagination) {
  if (!pagination.paginated) return items;

  return {
    data: items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePagination,
  parseSort,
  parseEnumFilter,
  buildSearchFilter,
  combineWhere,
  buildListResponse,
};
