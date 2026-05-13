import { useEffect, useState, useMemo } from "react";
import { Search, Download, CalendarRange, Plus, X } from "lucide-react";
import ExcelJS from "exceljs";
import { fetchConsolidatedReport, type ConsolidatedRow } from "../lib/api";

interface Props {
  cardId: string;
}

function generateDates(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const dates: string[] = [];
  let [y, m, d] = from.split("-").map(Number);
  const [ey, em, ed] = to.split("-").map(Number);
  while (y < ey || (y === ey && m < em) || (y === ey && m === em && d <= ed)) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    d++;
    const daysInMonth = new Date(y, m, 0).getDate();
    if (d > daysInMonth) { d = 1; m++; }
    if (m > 12) { m = 1; y++; }
  }
  return dates;
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ConsolidatedReport({ cardId }: Props) {
  const [rows, setRows] = useState<ConsolidatedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Holiday state
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayInput, setHolidayInput] = useState("");

  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  const addHoliday = () => {
    const val = holidayInput.trim();
    if (!val || holidaySet.has(val)) return;
    setHolidays((prev) => [...prev, val].sort());
    setHolidayInput("");
  };

  const removeHoliday = (date: string) =>
    setHolidays((prev) => prev.filter((d) => d !== date));

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchConsolidatedReport(cardId)
      .then(setRows)
      .catch(() => setError("Failed to load consolidated report"))
      .finally(() => setLoading(false));
  }, [cardId]);

  const { rowMap, empMeta, allEmps } = useMemo(() => {
    const rowMap: Record<string, Record<string, ConsolidatedRow>> = {};
    const empMeta: Record<string, { name: string; dept: string; manager: string }> = {};
    const seenEmps = new Set<string>();
    const allEmps: string[] = [];
    for (const r of rows) {
      if (!rowMap[r.employeeid]) rowMap[r.employeeid] = {};
      rowMap[r.employeeid][r.date] = r;
      if (!empMeta[r.employeeid])
        empMeta[r.employeeid] = { name: r.employeename, dept: r.department, manager: r.reportingmanager };
      if (!seenEmps.has(r.employeeid)) {
        seenEmps.add(r.employeeid);
        allEmps.push(r.employeeid);
      }
    }
    return { rowMap, empMeta, allEmps };
  }, [rows]);

  const expanded = useMemo((): ConsolidatedRow[] => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    const allDates = generateDates(dateFrom, dateTo);
    const result: ConsolidatedRow[] = [];
    for (const empId of allEmps) {
      const meta = empMeta[empId] ?? { name: "", dept: "", manager: "" };
      for (const date of allDates) {
        result.push(
          rowMap[empId]?.[date] ?? {
            employeeid: empId,
            employeename: meta.name,
            department: meta.dept,
            reportingmanager: meta.manager,
            date,
            officecheckin: "",
            wfhclockins: "",
            leavetype: "",
            leavestatus: "",
            wfhrequeststatus: "",
          }
        );
      }
    }
    return result;
  }, [allEmps, empMeta, rowMap, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return expanded;
    return expanded.filter(
      (r) => r.employeeid.toLowerCase().includes(q) || r.employeename.toLowerCase().includes(q)
    );
  }, [expanded, search]);

  const exportExcel = async () => {
    // ARGB fills (ExcelJS: AA RR GG BB)
    const FILL_HEADER  = "FFF3F4F6"; // gray-100
    const FILL_HOLIDAY = "FFEDE9FE"; // violet-100
    const FILL_SUN     = "FFFEE2E2"; // red-100
    const FILL_SAT     = "FFFFF8E1"; // amber-50
    const STATUS_FILL: Record<string, string> = {
      "On Leave":         "FFFFEDD5",
      "Office + WFH":     "FFF3E8FF",
      "Office":           "FFDBEAFE",
      "WFH":              "FFDCFCE7",
      "WFH (Requested)":  "FFE0E7FF",
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Consolidated Report");

    ws.columns = [
      { header: "Date",               key: "date",       width: 14 },
      { header: "Day",                key: "day",        width: 10 },
      { header: "Employee ID",        key: "empid",      width: 13 },
      { header: "Employee Name",      key: "name",       width: 24 },
      { header: "Department",         key: "dept",       width: 24 },
      { header: "Reporting Manager",  key: "manager",    width: 24 },
      { header: "Office Check-in",    key: "office",     width: 14 },
      { header: "WFH Clock-in(s)",    key: "wfh",        width: 22 },
      { header: "Leave Type",         key: "leave",      width: 20 },
      { header: "Leave Status",       key: "leavestatus",width: 14 },
      { header: "WFH Request Status", key: "wfhreq",     width: 20 },
      { header: "Status",             key: "status",     width: 18 },
    ];

    // Header row styling
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF374151" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } };
      cell.alignment = { vertical: "middle" };
    });
    ws.getRow(1).height = 20;

    for (const r of filtered) {
      const dow = dayOfWeek(r.date);
      const isHoliday = holidaySet.has(r.date);
      const isSun = dow === 0;
      const isSat = dow === 6;
      const status = rowStatus(r);

      // Day label — append "(Holiday)" if marked
      const dayLabel = isHoliday ? `${DAY_NAMES[dow]} (Holiday)` : DAY_NAMES[dow];

      const dataRow = ws.addRow({
        date: r.date,
        day: dayLabel,
        empid: r.employeeid,
        name: r.employeename || "",
        dept: r.department || "",
        manager: r.reportingmanager || "",
        office: r.officecheckin || "",
        wfh: r.wfhclockins || "",
        leave: r.leavetype || "",
        leavestatus: r.leavestatus || "",
        wfhreq: r.wfhrequeststatus || "",
        status,
      });
      dataRow.alignment = { vertical: "middle" };

      // Row background: holiday > Sunday > Saturday > none
      const rowFill = isHoliday ? FILL_HOLIDAY
        : isSun ? FILL_SUN
        : isSat ? FILL_SAT
        : null;
      if (rowFill) {
        dataRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowFill } };
        });
      }

      // Status cell color (overrides row bg on that cell)
      const sf = STATUS_FILL[status];
      if (sf) {
        dataRow.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: sf } };
      }
    }

    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "consolidated_report.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-red-500">{error}</p>;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
        <p className="text-sm text-gray-400">No data yet — upload files above to generate the report</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Date range + search + export */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="cr-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee ID or name…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <CalendarRange size={14} className="text-gray-400" />
          <input
            id="cr-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            id="cr-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          Export Excel
        </button>
      </div>

      {/* Holiday picker */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Holidays (non-weekend offs)</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            id="cr-holiday-input"
            type="date"
            value={holidayInput}
            onChange={(e) => setHolidayInput(e.target.value)}
            className="text-sm border border-violet-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <button
            onClick={addHoliday}
            disabled={!holidayInput}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={13} />
            Add Holiday
          </button>

          {holidays.length === 0 && (
            <span className="text-xs text-violet-400 italic">No holidays added — weekends are auto-highlighted</span>
          )}

          {/* Holiday chips */}
          {holidays.map((date) => {
            const dow = dayOfWeek(date);
            const [y, m, d] = date.split("-").map(Number);
            const label = new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            return (
              <span key={date} className="flex items-center gap-1 rounded-full bg-violet-100 border border-violet-300 pl-2.5 pr-1.5 py-0.5 text-xs font-medium text-violet-700">
                <span className="font-semibold">{DAY_NAMES[dow]}</span>
                <span>{label}</span>
                <button
                  onClick={() => removeHoliday(date)}
                  className="ml-0.5 rounded-full hover:bg-violet-200 p-0.5"
                  title="Remove"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {/* Prompt to pick date range */}
      {(!dateFrom || !dateTo) && (
        <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 py-8 text-center">
          <p className="text-sm text-blue-600 font-medium">Pick a date range above to view the full attendance grid</p>
          <p className="text-xs text-blue-400 mt-1">{allEmps.length} employees · {rows.length.toLocaleString()} records loaded</p>
        </div>
      )}

      {dateFrom && dateTo && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-gray-400">
              {filtered.length.toLocaleString()} rows · {[...new Set(filtered.map((r) => r.employeeid))].length} employees
            </p>
            <div className="flex items-center gap-2 ml-auto">
              {[
                { label: "Sunday",  bg: "bg-red-100",    text: "text-red-700"    },
                { label: "Saturday",bg: "bg-amber-100",  text: "text-amber-700"  },
                { label: "Holiday", bg: "bg-violet-100", text: "text-violet-700" },
              ].map(({ label, bg, text }) => (
                <span key={label} className={`rounded-full ${bg} ${text} px-2 py-0.5 text-xs font-medium`}>{label}</span>
              ))}
            </div>
          </div>

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
                  const dow = dayOfWeek(row.date);
                  const isSat = dow === 6;
                  const isSun = dow === 0;
                  const isHoliday = holidaySet.has(row.date);
                  const status = rowStatus(row);

                  const rowBg = isHoliday
                    ? "bg-violet-50 hover:bg-violet-100"
                    : isSun ? "bg-red-50 hover:bg-red-100"
                    : isSat ? "bg-amber-50 hover:bg-amber-100"
                    : "hover:bg-gray-50";

                  const dayColor = isHoliday ? "text-violet-600"
                    : isSun ? "text-red-500"
                    : isSat ? "text-amber-600"
                    : "text-gray-400";

                  const [y, m, d] = row.date.split("-").map(Number);
                  const dateObj = new Date(y, m - 1, d);

                  return (
                    <tr key={i} className={rowBg}>
                      <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-800">
                        <span className={`mr-1.5 text-xs font-semibold ${dayColor}`}>
                          {DAY_NAMES[dow]}
                        </span>
                        <span className={isSun || isSat ? "text-gray-500" : ""}>
                          {dateObj.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {isHoliday && (
                          <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-600">
                            Holiday
                          </span>
                        )}
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
        </>
      )}
    </div>
  );
}

function rowStatus(row: ConsolidatedRow): string {
  if (row.leavetype) return "On Leave";
  if (row.officecheckin && row.wfhclockins) return "Office + WFH";
  if (row.officecheckin) return "Office";
  if (row.wfhclockins) return "WFH";
  if (row.wfhrequeststatus) return "WFH (Requested)";
  return "—";
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    "On Leave":        "bg-orange-100 text-orange-700",
    "Office + WFH":    "bg-purple-100 text-purple-700",
    "Office":          "bg-blue-100 text-blue-700",
    "WFH":             "bg-green-100 text-green-700",
    "WFH (Requested)": "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
