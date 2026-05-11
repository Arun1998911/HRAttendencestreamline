import { supabase } from "./supabase";
import { parseOfficeCheckin, parseWFHClockin } from "./excel";
import { v4 as uuidv4 } from "uuid";

export interface ReportCard {
  cardid: string;
  cardname: string;
  carddescription: string | null;
  createdby: string;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function fetchCards(): Promise<ReportCard[]> {
  const { data, error } = await supabase.from("REPORTCARDS_TB").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCard(payload: { name: string; description: string; created_by: string }): Promise<ReportCard> {
  const { data, error } = await supabase.from("REPORTCARDS_TB").insert({
    cardid: uuidv4(),
    cardname: payload.name,
    carddescription: payload.description,
    createdby: payload.created_by,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCard(cardId: string): Promise<ReportCard> {
  const { data, error } = await supabase.from("REPORTCARDS_TB").select("*").eq("cardid", cardId).single();
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Uploads (Excel parsed in browser, then bulk inserted to Supabase)
// ---------------------------------------------------------------------------

async function batchInsert(table: string, records: Record<string, unknown>[]) {
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(records.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }
}

export async function uploadOffice(cardId: string, file: File): Promise<{ rows_imported: number }> {
  const buffer = await file.arrayBuffer();
  const records = parseOfficeCheckin(buffer, cardId);
  if (!records.length) throw new Error("No valid rows found (Personnel ID must be numeric)");
  await supabase.from("OFFICE_CHECKIN_TB").delete().eq("cardid", cardId);
  await batchInsert("OFFICE_CHECKIN_TB", records);
  return { rows_imported: records.length };
}

export async function uploadWFH(cardId: string, file: File): Promise<{ rows_imported: number }> {
  const buffer = await file.arrayBuffer();
  const records = parseWFHClockin(buffer, cardId);
  if (!records.length) throw new Error("No rows found in WFH file");
  await supabase.from("WFH_CLOCKIN_TB").delete().eq("cardid", cardId);
  await batchInsert("WFH_CLOCKIN_TB", records);
  return { rows_imported: records.length };
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

export async function fetchOfficeData(cardId: string, limit = 100, offset = 0) {
  const { data, error, count } = await supabase
    .from("OFFICE_CHECKIN_TB")
    .select("*", { count: "exact" })
    .eq("cardid", cardId)
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchWFHData(cardId: string, limit = 100, offset = 0) {
  const { data, error, count } = await supabase
    .from("WFH_CLOCKIN_TB")
    .select("*", { count: "exact" })
    .eq("cardid", cardId)
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Employee summary (computed client-side)
// ---------------------------------------------------------------------------

export interface EmployeeSummary {
  employeeid: string;
  employeename: string;
  department: string;
  reportingmanager: string;
  officedayscount: number;
  wfhdayscount: number;
  calendar: { checkindate: string; officefirstcheckin: string; wfhtimes: string }[];
}

export async function fetchEmployeeSummary(cardId: string, employeeId: string): Promise<EmployeeSummary> {
  const [{ data: officeRows }, { data: wfhRows }] = await Promise.all([
    supabase.from("OFFICE_CHECKIN_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
    supabase.from("WFH_CLOCKIN_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
  ]);

  // Office: first check-in per date
  const officeDateMap: Record<string, string> = {};
  for (const row of (officeRows ?? [])) {
    const d = row.checkindate as string;
    if (!d) continue;
    if (!officeDateMap[d] || row.checkintime < officeDateMap[d]) {
      officeDateMap[d] = row.checkintime as string;
    }
  }

  // WFH: all clock-in times per date
  const wfhDateMap: Record<string, string[]> = {};
  let employeename = "", department = "", reportingmanager = "";
  for (const row of (wfhRows ?? [])) {
    const ts = row.timestampclockin as string;
    if (!ts) continue;
    const d = ts.includes("T") ? ts.split("T")[0] : ts.split(" ")[0];
    const t = ts.includes("T") ? ts.split("T")[1]?.slice(0, 8) : ts.split(" ")[1]?.slice(0, 8);
    if (!wfhDateMap[d]) wfhDateMap[d] = [];
    if (t) wfhDateMap[d].push(t);
    if (!employeename) employeename = row.employeename ?? "";
    if (!department) department = row.department ?? "";
    if (!reportingmanager) reportingmanager = row.reportingmanager ?? "";
  }

  // Merge dates
  const allDates = [...new Set([...Object.keys(officeDateMap), ...Object.keys(wfhDateMap)])].sort();
  const calendar = allDates.map((d) => ({
    checkindate: d,
    officefirstcheckin: officeDateMap[d] ?? "",
    wfhtimes: (wfhDateMap[d] ?? []).sort().join(", "),
  }));

  return {
    employeeid: employeeId,
    employeename,
    department,
    reportingmanager,
    officedayscount: Object.keys(officeDateMap).length,
    wfhdayscount: Object.keys(wfhDateMap).length,
    calendar,
  };
}
