import { useEffect, useState, useMemo } from "react";
import { Search, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { fetchConsolidatedReport, type ConsolidatedRow } from "../lib/api";

interface Props {
  cardId: string;
}

export default function ConsolidatedReport({ cardId }: Props) {
  const [rows, setRows] = useState<ConsolidatedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchConsolidatedReport(cardId)
      .then(setRows)
      .catch(() => setError("Failed to load consolidated report"))
      .finally(() => setLoading(false));
  }, [cardId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (q && !r.employeeid.toLowerCase().includes(q) && !r.employeename.toLowerCase().includes(q)) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
  }, [rows, search, dateFrom, dateTo]);

  const exportExcel = () => {
    const data = filtered.map((r) => ({
      "Date": r.date,
      "Employee ID": r.employeeid,
      "Employee Name": r.employeename,
      "Department": r.department,
      "Reporting Manager": r.reportingmanager,
      "Office Check-in": r.officecheckin,
      "WFH Clock-in(s)": r.wfhclockins,
      "Leave Type": r.leavetype,
      "Leave Status": r.leavestatus,
      "WFH Request Status": r.wfhrequeststatus,
      "Status": rowStatus(r),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidated Report");
    XLSX.writeFile(wb, "consolidated_report.xlsx");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
        <p className="text-sm text-gray-400">No data yet — upload files above to generate the report</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee ID or name…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <Download size={14} />
          Export Excel
        </button>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length.toLocaleString()} rows · {[...new Set(filtered.map((r) => r.employeeid))].length} employees
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Date", "Employee ID", "Name", "Department", "Office Check-in", "WFH Clock-in(s)", "Leave", "WFH Request", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filtered.map((row, i) => {
              const status = rowStatus(row);
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-800">
                    {new Date(row.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{row.employeeid}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{row.employeename || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500 max-w-36 truncate" title={row.department}>{row.department || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600 font-mono text-xs">{row.officecheckin || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600 font-mono text-xs">{row.wfhclockins || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.leavetype ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700" title={row.leavestatus}>
                        {row.leavetype}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.wfhrequeststatus ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.wfhrequeststatus === "Approved" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {row.wfhrequeststatus}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No rows match your filters</div>
        )}
      </div>
    </div>
  );
}

function rowStatus(row: ConsolidatedRow): string {
  const hasOffice = !!row.officecheckin;
  const hasWFHClockin = !!row.wfhclockins;
  const hasLeave = !!row.leavetype;
  const hasWFHReq = !!row.wfhrequeststatus;

  if (hasLeave) return "On Leave";
  if (hasOffice && hasWFHClockin) return "Office + WFH";
  if (hasOffice) return "Office";
  if (hasWFHClockin) return "WFH";
  if (hasWFHReq) return "WFH (Requested)";
  return "—";
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    "On Leave": "bg-orange-100 text-orange-700",
    "Office + WFH": "bg-purple-100 text-purple-700",
    "Office": "bg-blue-100 text-blue-700",
    "WFH": "bg-green-100 text-green-700",
    "WFH (Requested)": "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
