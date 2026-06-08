import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileSpreadsheet, ChevronRight, User } from "lucide-react";
import { fetchCards, type ReportCard } from "../lib/api";
import CreateCardModal from "../components/CreateCardModal";
import BrandBadge from "../components/BrandBadge";

export default function Home() {
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCards()
      .then(setCards)
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (card: ReportCard) => {
    setShowCreate(false);
    navigate(`/cards/${card.cardid}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HR Attendance</h1>
            <p className="text-xs text-gray-500">Attendance consolidation reports</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              New Report
            </button>
            <BrandBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 rounded-2xl bg-blue-50 p-5">
              <FileSpreadsheet size={40} className="text-blue-400" />
            </div>
            <h2 className="mb-1 text-lg font-semibold text-gray-800">No reports yet</h2>
            <p className="mb-6 text-sm text-gray-500">Create your first report to start consolidating attendance data</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              Create your first report
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">{cards.length} report{cards.length !== 1 ? "s" : ""}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <button
                  key={card.cardid}
                  onClick={() => navigate(`/cards/${card.cardid}`)}
                  className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="rounded-lg bg-blue-50 p-2">
                      <FileSpreadsheet size={20} className="text-blue-600" />
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors mt-1" />
                  </div>
                  <h3 className="mb-1 font-semibold text-gray-900 leading-tight">{card.cardname}</h3>
                  {card.carddescription && (
                    <p className="mb-3 text-xs text-gray-500 line-clamp-2">{card.carddescription}</p>
                  )}
                  <div className="mt-auto flex flex-col gap-1 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <User size={11} />
                      <span>{card.createdby}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {showCreate && (
        <CreateCardModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
