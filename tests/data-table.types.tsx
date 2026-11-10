import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableProps } from "../src/components/data-table";

interface PersonRow {
  id: string;
  name: string;
  score: number;
}

const people: PersonRow[] = [
  { id: "person-1", name: "Ada", score: 12 },
];

const mixedColumns: ColumnDef<PersonRow, unknown>[] = [
  { accessorKey: "name", header: "Name", cell: ({ getValue }) => String(getValue()) },
  { accessorKey: "score", header: "Score", cell: ({ getValue }) => String(getValue()) },
];

const nameColumn: ColumnDef<PersonRow, string> = {
  accessorKey: "name",
  header: "Name",
  cell: ({ getValue }) => getValue().toUpperCase(),
};

const nameTableProps: DataTableProps<PersonRow, string> = {
  columns: [nameColumn],
  data: people,
  getRowId: (person) => person.id,
};

export function InferredDataTableTypes() {
  return (
    <DataTable
      columns={mixedColumns}
      data={people}
      getRowId={(person) => person.id}
      emptyState={<span>No people</span>}
    />
  );
}

export function ExplicitDataTableValueType() {
  return <DataTable {...nameTableProps} />;
}
