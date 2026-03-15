import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: keyof T | string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  rowClassName?: string;
};

export function DataTable<T>({ columns, data, getRowKey, rowClassName }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/30">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.24em] text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={String(column.key)} className={cn("px-4 py-4 font-semibold", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/6">
            {data.map((row) => (
              <tr
                key={getRowKey(row)}
                className={cn(
                  "cursor-pointer bg-transparent transition hover:bg-cyan-400/[0.05]",
                  rowClassName,
                )}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className={cn("px-4 py-4 align-middle text-sm text-slate-300", column.className)}>
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
