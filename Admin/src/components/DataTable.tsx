import React, { useState, useMemo } from "react";
import { AlertCircle, ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T | string;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  rowsPerPage?: number;
}

export default function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchKey,
  isLoading,
  error,
  emptyMessage = "No records found.",
  rowsPerPage = 10
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter
  const filteredData = useMemo(() => {
    if (!searchQuery || !searchKey) return data;
    return data.filter((row) => {
      const val = row[searchKey];
      if (val === undefined || val === null) return false;
      return String(val).toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data, searchQuery, searchKey]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortOrder]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / rowsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(startIdx, startIdx + rowsPerPage);
  }, [sortedData, currentPage, rowsPerPage]);

  const handleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
      {/* Top Filter Bar */}
      {searchKey && (
        <div className="p-4 border-b border-slate-100 bg-slate-55/10 flex items-center justify-between">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Filter by ${String(searchKey)}...`}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64 shadow-inner"
          />
          <span className="text-xs font-semibold text-slate-400 select-none">
            Total: {sortedData.length} records
          </span>
        </div>
      )}

      {/* Main Table Grid */}
      <div className="flex-1 overflow-x-auto min-h-[250px] relative">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-55/30 border-b border-slate-100 text-slate-500 uppercase font-semibold select-none">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key, col.sortable)}
                  className={cn(
                    "px-6 py-3.5 tracking-wider",
                    col.sortable ? "cursor-pointer hover:bg-slate-50 hover:text-slate-700 transition-all" : ""
                  )}
                >
                  <div className="flex items-center space-x-1.5">
                    <span>{col.header}</span>
                    {col.sortable && sortKey === col.key && (
                      sortOrder === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
            {/* Loading state */}
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                    <span className="text-xs font-medium text-slate-400 animate-pulse">Loading compliance data...</span>
                  </div>
                </td>
              </tr>
            )}

            {/* Error state */}
            {!isLoading && error && (
              <tr>
                <td colSpan={columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-2 text-rose-500 max-w-sm mx-auto">
                    <AlertCircle size={32} className="stroke-[1.5]" />
                    <h3 className="font-semibold text-slate-800">Connection Failed</h3>
                    <p className="text-slate-400 text-[10px] leading-relaxed">{error}</p>
                  </div>
                </td>
              </tr>
            )}

            {/* Empty state */}
            {!isLoading && !error && paginatedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center space-y-2 text-slate-400 max-w-sm mx-auto">
                    <Inbox size={32} className="stroke-[1.5] text-slate-300" />
                    <h3 className="font-semibold text-slate-700">No telemetry recorded</h3>
                    <p className="text-slate-400 text-[10px] leading-relaxed">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}

            {/* Render rows */}
            {!isLoading && !error && paginatedData.length > 0 && paginatedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-6 py-3.5 whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {!isLoading && !error && sortedData.length > rowsPerPage && (
        <div className="p-4 border-t border-slate-100 bg-slate-55/10 flex items-center justify-between select-none">
          <span className="text-[10px] font-semibold text-slate-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all text-slate-500"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all text-slate-500"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all text-slate-500"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all text-slate-500"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
