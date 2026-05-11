import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Wifi } from "lucide-react";
import { fetchCard, uploadOffice, uploadWFH, fetchOfficeData, fetchWFHData } from "../lib/api";
import UploadZone from "../components/UploadZone";
import ResultsTable from "../components/ResultsTable";
import EmployeeLookup from "../components/EmployeeLookup";

type Tab = "office" | "wfh";

interface Card {
  cardid: string;
  cardname: string;
  carddescription: string | null;
  createdby: string;
}

const OFFICE_COLS = ["employeeid", "checkindate", "checkintime"];
const WFH_COLS = ["employeeid", "employeename", "jobtitle", "department", "reportingmanager", "timestampclockin", "requesttype"];

export default function CardDetail() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("office");
  const [tableData, setTableData] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(null);
  const [tableLoading, setTableLoading] = useState(false);

  useEffect(() => {
    if (!cardId) return;
    fetchCard(cardId).then(setCard);
  }, [cardId]);

  const loadTable = useCallback(async (tab: Tab) => {
    if (!cardId) return;
    setTableLoading(true);
    setTableData(null);
    try {
      const data = tab === "office" ? await fetchOfficeData(cardId) : await fetchWFHData(cardId);
      setTableData(data);
    } finally {
      setTableLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    loadTable(activeTab);
  }, [activeTab, loadTable]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={() => navigate("/")}
            className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={15} />
            All Reports
          </button>
          {card && (
            <div>
              <h1 className="text-xl font-bold text-gray-900">{card.cardname}</h1>
              {card.carddescription && (
                <p className="text-sm text-gray-500 mt-0.5">{card.carddescription}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Created by {card.createdby}</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Upload */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Upload Data</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <UploadZone
              label="Office Check-in"
              description="All Transactions export — filters valid Personnel IDs only"
              onUpload={(file) => uploadOffice(cardId!, file).then((r) => { loadTable(activeTab); return r; })}
            />
            <UploadZone
              label="WFH Clock-in"
              description="Working Remotely clock-ins export (KSPL employee IDs)"
              onUpload={(file) => uploadWFH(cardId!, file).then((r) => { loadTable(activeTab); return r; })}
            />
          </div>
        </div>

        {/* Employee lookup */}
        {cardId && <EmployeeLookup cardId={cardId} />}

        {/* Data tabs */}
        <div>
          <div className="mb-3 flex items-center gap-1 border-b border-gray-200">
            <TabBtn active={activeTab === "office"} onClick={() => setActiveTab("office")} icon={<Building2 size={14} />} label="Office Check-in" count={activeTab === "office" ? tableData?.total : undefined} />
            <TabBtn active={activeTab === "wfh"} onClick={() => setActiveTab("wfh")} icon={<Wifi size={14} />} label="WFH Clock-in" count={activeTab === "wfh" ? tableData?.total : undefined} />
          </div>

          {tableLoading && (
            <div className="flex justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          )}

          {!tableLoading && tableData?.total === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
              <p className="text-sm text-gray-400">No data yet — upload a file above</p>
            </div>
          )}

          {!tableLoading && tableData && tableData.total > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Showing {tableData.rows.length} of {tableData.total.toLocaleString()} rows</p>
              <ResultsTable columns={activeTab === "office" ? OFFICE_COLS : WFH_COLS} rows={tableData.rows} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600">
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
