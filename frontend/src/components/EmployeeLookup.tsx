import { useState } from "react";
import { Search, Building2, Wifi, User, Briefcase, UserCheck, CalendarX, CalendarCheck } from "lucide-react";
import { fetchEmployeeSummary, type EmployeeSummary } from "../lib/api";

interface Props {
  cardId: string;
}

export default function EmployeeLookup({ cardId }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim().toUpperCase();
    if (!id) return;
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const data = await fetchEmployeeSummary(cardId, id);
      if (!data.officedayscount && !data.wfhdayscount && !data.leavedayscount && !data.wfhrequestdayscount) {
        setError(`No data found for ${id}`);
      } else {
        setSummary(data);
      }
    } catch {
      setError("Failed to fetch employee data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <h2 className="text-base font-semibold text-gray-800">Employee Lookup</h2>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter Employee ID e.g. KSPL130"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search size={14} />
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {summary && (
        <div className="space-y-4">
          {/* Employee info */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InfoChip icon={<User size={13} />} label="Employee ID" value={summary.employeeid} />
            <InfoChip icon={<UserCheck size={13} />} label="Name" value={summary.employeename || "—"} />
            <InfoChip icon={<Briefcase size={13} />} label="Department" value={summary.department || "—"} />
            <InfoChip icon={<User size={13} />} label="Reporting Manager" value={summary.reportingmanager || "—"} />
          </div>

          {/* Summary counts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="rounded-lg bg-blue-600 p-2">
                <Building2 size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Office Days</p>
                <p className="text-2xl font-bold text-blue-700">{summary.officedayscount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-4 py-3">
              <div className="rounded-lg bg-green-600 p-2">
                <Wifi size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-green-600 font-medium">WFH Days</p>
                <p className="text-2xl font-bold text-green-700">{summary.wfhdayscount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
              <div className="rounded-lg bg-orange-500 p-2">
                <CalendarX size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-orange-600 font-medium">Leave Days</p>
                <p className="text-2xl font-bold text-orange-700">{summary.leavedayscount}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-purple-100 bg-purple-50 px-4 py-3">
              <div className="rounded-lg bg-purple-600 p-2">
                <CalendarCheck size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-purple-600 font-medium">WFH Requests</p>
                <p className="text-2xl font-bold text-purple-700">{summary.wfhrequestdayscount}</p>
              </div>
            </div>
          </div>

          {/* Calendar table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Office (first check-in)</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">WFH clock-ins</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Leave</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">WFH Request</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {summary.calendar.map((row) => {
                  const isOffice = !!row.officefirstcheckin;
                  const isWFH = !!row.wfhtimes;
                  const isLeave = !!row.leavetype;
                  const isWFHReq = !!row.wfhrequeststatus;
                  return (
                    <tr key={row.checkindate} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {new Date(row.checkindate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{row.officefirstcheckin || "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{row.wfhtimes || "—"}</td>
                      <td className="px-4 py-2">
                        {isLeave ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700" title={row.leavestatus}>
                            {row.leavetype}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {isWFHReq ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.wfhrequeststatus === "Approved"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {row.wfhrequeststatus}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {isLeave ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Leave</span>
                        ) : isOffice && isWFH ? (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Both</span>
                        ) : isOffice ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Office</span>
                        ) : isWFH ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">WFH</span>
                        ) : isWFHReq ? (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">WFH Req</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5 text-gray-400">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-medium text-gray-800 truncate">{value}</p>
    </div>
  );
}
