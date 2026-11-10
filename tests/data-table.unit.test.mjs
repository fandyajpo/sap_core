import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const people = [
  { id: "person-ada", name: "Ada", score: 3 },
  { id: "person-ben", name: "Ben", score: 1 },
  { id: "person-alex", name: "Alex", score: 4 },
  { id: "person-mia", name: "Mia", score: 2 },
];
const columns = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "score", header: "Score" },
];

function createTableInstance({
  data = people,
  globalFilter = "",
  pageIndex = 0,
  pageSize = 2,
  sorting = [],
} = {}) {
  let table;
  let state;
  table = createTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (person) => person.id,
    getSortedRowModel: getSortedRowModel(),
    onStateChange: (updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
      table.setOptions((previous) => ({ ...previous, state }));
    },
    renderFallbackValue: null,
    state: {},
  });
  state = {
    ...table.initialState,
    globalFilter,
    pagination: { ...table.initialState.pagination, pageIndex, pageSize },
    sorting,
  };
  table.setOptions((previous) => ({ ...previous, state }));
  return table;
}

test("core row model uses the supplied rows and stable row identifiers", () => {
  const table = createTableInstance();
  const coreRows = table.getCoreRowModel().rows;
  assert.deepEqual(coreRows.map((row) => row.id), people.map((person) => person.id));
  assert.equal(coreRows[0].original, people[0]);
});

test("client-side sorting applies the requested column order", () => {
  const table = createTableInstance({ sorting: [{ id: "score", desc: false }] });
  assert.deepEqual(
    table.getSortedRowModel().rows.map((row) => row.original.id),
    ["person-ben", "person-mia", "person-ada", "person-alex"],
  );
});

test("client-side global filtering narrows rows without changing source data", () => {
  const table = createTableInstance({ globalFilter: "al" });
  assert.deepEqual(
    table.getFilteredRowModel().rows.map((row) => row.original.id),
    ["person-alex"],
  );
  assert.equal(people.length, 4);
});

test("client-side pagination selects the correct page and updates navigation state", () => {
  const table = createTableInstance({ pageSize: 2 });
  assert.equal(table.getPageCount(), 2);
  table.nextPage();
  assert.deepEqual(
    table.getRowModel().rows.map((row) => row.original.id),
    ["person-alex", "person-mia"],
  );
  assert.equal(table.getCanPreviousPage(), true);
  assert.equal(table.getCanNextPage(), false);
});

test("empty datasets produce empty core and paginated row models", () => {
  const table = createTableInstance({ data: [] });
  assert.deepEqual(table.getCoreRowModel().rows, []);
  assert.deepEqual(table.getRowModel().rows, []);
  assert.equal(table.getPageCount(), 0);
});

test("row identity remains tied to the caller-provided key when input order changes", () => {
  const table = createTableInstance();
  const reorderedPeople = [...people].reverse();
  table.setOptions((previous) => ({ ...previous, data: reorderedPeople }));
  assert.deepEqual(
    table.getCoreRowModel().rows.map((row) => row.id),
    reorderedPeople.map((person) => person.id),
  );
  assert.equal(table.getCoreRowModel().rowsById["person-ada"].original, people[0]);
});

test("DataTable wires client-side models and remains a generic presentation primitive", async () => {
  const component = await readFile(
    path.join(repositoryRoot, "src/components/data-table/data-table.tsx"),
    "utf8",
  );
  const pagination = await readFile(
    path.join(repositoryRoot, "src/components/data-table/data-table-pagination.tsx"),
    "utf8",
  );
  const modules = `${component}\n${pagination}`;

  assert.match(component, /ColumnDef<TData, TValue>/);
  assert.match(component, /getRowId,/);
  assert.match(component, /getCoreRowModel\(\)/);
  assert.match(component, /getSortedRowModel\(\)/);
  assert.match(component, /getFilteredRowModel\(\)/);
  assert.match(component, /getPaginationRowModel\(\)/);
  assert.match(component, /flexRender\(/);
  assert.match(component, /emptyState \?\? "No results\."/);
  assert.match(component, /loadingState \?\? "Loading…"/);
  assert.match(pagination, /table\.nextPage\(\)/);
  assert.doesNotMatch(modules, /manual(?:Sorting|Filtering|Pagination)/);
  assert.doesNotMatch(
    modules,
    /(?:from\s*["'][^"']*(?:client-data|\/api\/|server-only|@prisma\/)|fetch\s*\()/,
  );
});
