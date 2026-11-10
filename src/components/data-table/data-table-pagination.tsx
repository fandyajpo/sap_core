"use client";

import type { RowData, Table } from "@tanstack/react-table";
import styles from "./data-table.module.css";

export interface DataTablePaginationProps<TData extends RowData> {
  table: Table<TData>;
}

const pageSizeOptions = [10, 20, 30, 50];

export function DataTablePagination<TData extends RowData>({
  table,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <nav aria-label="Table pagination" className={styles.pagination}>
      <span aria-live="polite" className={styles.paginationSummary} role="status">
        {table.getFilteredRowModel().rows.length} rows · Page {pageIndex + 1} of {Math.max(pageCount, 1)}
      </span>
      <div className={styles.paginationControls}>
        <label className={styles.pageSizeLabel}>
          Rows per page
          <select
            className={styles.pageSizeSelect}
            onChange={(event) => table.setPageSize(Number(event.currentTarget.value))}
            value={pageSize}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <button
          aria-label="First page"
          className={styles.paginationButton}
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.firstPage()}
          type="button"
        >
          First
        </button>
        <button
          aria-label="Previous page"
          className={styles.paginationButton}
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          type="button"
        >
          Previous
        </button>
        <button
          aria-label="Next page"
          className={styles.paginationButton}
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          type="button"
        >
          Next
        </button>
        <button
          aria-label="Last page"
          className={styles.paginationButton}
          disabled={!table.getCanNextPage()}
          onClick={() => table.lastPage()}
          type="button"
        >
          Last
        </button>
      </div>
    </nav>
  );
}
