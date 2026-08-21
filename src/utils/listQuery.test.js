const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_PAGE_SIZE,
  parsePagination,
  parseSort,
  parseEnumFilter,
  buildSearchFilter,
  combineWhere,
  buildListResponse,
} = require("./listQuery");

test("parsePagination stays off unless the caller asks for it", () => {
  assert.equal(parsePagination({}).paginated, false);
  assert.equal(parsePagination({ q: "acme" }).paginated, false);
});

test("parsePagination computes skip and take from page and size", () => {
  const result = parsePagination({ page: "3", pageSize: "10" });

  assert.equal(result.paginated, true);
  assert.equal(result.page, 3);
  assert.equal(result.skip, 20);
  assert.equal(result.take, 10);
});

test("parsePagination falls back to sane values for junk input", () => {
  const result = parsePagination({ page: "-4", pageSize: "abc" });

  assert.equal(result.page, 1);
  assert.equal(result.skip, 0);
  assert.equal(result.take, 25);
});

test("parsePagination caps the page size so one request cannot drain a table", () => {
  assert.equal(parsePagination({ pageSize: "100000" }).take, MAX_PAGE_SIZE);
});

test("parseSort only accepts whitelisted columns", () => {
  const allowed = ["createdAt", "companyName"];

  assert.deepEqual(parseSort({ sort: "companyName", order: "asc" }, allowed), {
    companyName: "asc",
  });

  assert.deepEqual(parseSort({ sort: "passwordHash" }, allowed), {
    createdAt: "desc",
  });
});

test("parseEnumFilter rejects unknown and wildcard values", () => {
  const allowed = ["new", "closed"];

  assert.equal(parseEnumFilter("new", allowed), "new");
  assert.equal(parseEnumFilter("all", allowed), null);
  assert.equal(parseEnumFilter("deleted", allowed), null);
  assert.equal(parseEnumFilter("", allowed), null);
});

test("buildSearchFilter spreads the term across every searchable column", () => {
  const filter = buildSearchFilter("acme", ["companyName", "email"]);

  assert.deepEqual(filter, {
    OR: [
      { companyName: { contains: "acme", mode: "insensitive" } },
      { email: { contains: "acme", mode: "insensitive" } },
    ],
  });
});

test("buildSearchFilter returns nothing for a blank term", () => {
  assert.equal(buildSearchFilter("   ", ["companyName"]), null);
  assert.equal(buildSearchFilter("acme", []), null);
});

test("combineWhere drops empty clauses and only nests when needed", () => {
  assert.deepEqual(combineWhere(null, undefined), {});
  assert.deepEqual(combineWhere({ status: "new" }, null), { status: "new" });
  assert.deepEqual(combineWhere({ status: "new" }, { clientId: 3 }), {
    AND: [{ status: "new" }, { clientId: 3 }],
  });
});

test("buildListResponse keeps the bare array when pagination is off", () => {
  const items = [{ id: 1 }];

  assert.deepEqual(buildListResponse(items, 1, { paginated: false }), items);
});

test("buildListResponse wraps the page with its totals", () => {
  const response = buildListResponse([{ id: 1 }], 41, {
    paginated: true,
    page: 2,
    pageSize: 10,
  });

  assert.equal(response.total, 41);
  assert.equal(response.totalPages, 5);
  assert.equal(response.page, 2);
});

test("buildListResponse always reports at least one page", () => {
  const response = buildListResponse([], 0, {
    paginated: true,
    page: 1,
    pageSize: 25,
  });

  assert.equal(response.totalPages, 1);
});
