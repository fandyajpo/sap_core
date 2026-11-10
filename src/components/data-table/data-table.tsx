"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, RowData, SortingState } from "@tanstack/react-table";
import { DataTablePagination } from "./data-table-pagination";
import styles from "./data-table.module.css";

export interface DataTableProps<TData extends RowData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId: (row: TData) => string;
  ariaLabel?: string;
  emptyState?: ReactNode;
  filterPlaceholder?: string;
  isLoading?: boolean;
  loadingState?: ReactNode;
  toolbar?: ReactNode;
}

export function DataTable<TData extends RowData, TValue = unknown>({
  columns,
  data,
  getRowId,
  ariaLabel = "Data table",
  emptyState,
  filterPlaceholder = "Filter rows…",
  isLoading = false,
  loadingState,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    columns,
    data,
    getRowId,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const rows = table.getRowModel().rows;
  const columnCount = Math.max(table.getVisibleLeafColumns().length, 1);

  return (
    <section className={styles.root}>
      <div className={styles.toolbar}>
        <label className={styles.filterField}>
          <span>Filter rows</span>
          <input
            aria-label="Filter rows"
            className={styles.filterInput}
            onChange={(event) => setGlobalFilter(event.currentTarget.value)}
            placeholder={filterPlaceholder}
            type="search"
            value={globalFilter}
          />
        </label>
        {toolbar ? <div className={styles.toolbarContent}>{toolbar}</div> : null}
      </div>

      <div className={styles.tableViewport}>
        <table aria-busy={isLoading} aria-label={ariaLabel} className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={styles.headerCell}
                      colSpan={header.colSpan}
                      key={header.id}
                    >
                      {header.isPlaceholder
                        ? null
                        : header.column.getCanSort()
                          ? (
                            <button
                              className={styles.sortButton}
                              onClick={header.column.getToggleSortingHandler()}
                              type="button"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span aria-hidden="true">
                                {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
                              </span>
                            </button>
                          )
                          : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td aria-live="polite" className={styles.stateCell} colSpan={columnCount} role="status">
                  {loadingState ?? "Loading…"}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td aria-live="polite" className={styles.stateCell} colSpan={columnCount} role="status">
                  {emptyState ?? "No results."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className={styles.cell} key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination table={table} />
    </section>
  );
}
