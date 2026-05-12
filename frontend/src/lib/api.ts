import { supabase } from "./supabase";
import { parseOfficeCheckin, parseWFHClockin, parseLeaveRequests, parseWFHRequests } from "./excel";
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
// Data fetch — paginated to retrieve every row regardless of table size
// ---------------------------------------------------------------------------

async function fetchAllRows(table: string, cardId: string): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("cardid", cardId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export async function fetchOfficeData(cardId: string) {
  const rows = await fetchAllRows("OFFICE_CHECKIN_TB", cardId);
  return { rows, total: rows.length };
}

export async function fetchWFHData(cardId: string) {
  const rows = await fetchAllRows("WFH_CLOCKIN_TB", cardId);
  return { rows, total: rows.length };
}

export async function uploadLeaveRequests(cardId: string, file: File): Promise<{ rows_imported: number }> {
  const buffer = await file.arrayBuffer();
  const records = parseLeaveRequests(buffer, cardId);
  if (!records.length) throw new Error("No rows found in Leave Requests file");
  await supabase.from("LEAVE_REQUESTS_TB").delete().eq("cardid", cardId);
  await batchInsert("LEAVE_REQUESTS_TB", records);
  return { rows_imported: records.length };
}

export async function uploadWFHRequests(cardId: string, file: File): Promise<{ rows_imported: number }> {
  const buffer = await file.arrayBuffer();
  const records = parseWFHRequests(buffer, cardId);
  if (!records.length) throw new Error("No rows found in WFH Requests file");
  await supabase.from("WFH_REQUESTS_TB").delete().eq("cardid", cardId);
  await batchInsert("WFH_REQUESTS_TB", records);
  return { rows_imported: records.length };
}

export async function fetchLeaveRequestsData(cardId: string) {
  const rows = await fetchAllRows("LEAVE_REQUESTS_TB", cardId);
  return { rows, total: rows.length };
}

export async function fetchWFHRequestsData(cardId: string) {
  const rows = await fetchAllRows("WFH_REQUESTS_TB", cardId);
  return { rows, total: rows.length };
}

// ---------------------------------------------------------------------------
// Consolidated report (all 4 sources merged per employee × date)
// ---------------------------------------------------------------------------

export interface ConsolidatedRow {
  employeeid: string;
  employeename: string;
  department: string;
  reportingmanager: string;
  date: string;
  officecheckin: string;
  wfhclockins: string;
  leavetype: string;
  leavestatus: string;
  wfhrequeststatus: string;
}

export async function fetchConsolidatedReport(cardId: string): Promise<ConsolidatedRow[]> {
  const [officeRows, wfhRows, leaveRows, wfhReqRows] = await Promise.all([
    fetchAllRows("OFFICE_CHECKIN_TB", cardId),
    fetchAllRows("WFH_CLOCKIN_TB", cardId),
    fetchAllRows("LEAVE_REQUESTS_TB", cardId),
    fetchAllRows("WFH_REQUESTS_TB", cardId),
  ]);

  type Cell = { officecheckin: string; wfhclockinsArr: string[]; leavetype: string; leavestatus: string; wfhrequeststatus: string };
  const dataMap: Record<string, Record<string, Cell>> = {};
  const empInfo: Record<string, { name: string; dept: string; manager: string }> = {};

  const cell = (empId: string, date: string): Cell => {
    if (!dataMap[empId]) dataMap[empId] = {};
    if (!dataMap[empId][date]) dataMap[empId][date] = { officecheckin: "", wfhclockinsArr: [], leavetype: "", leavestatus: "", wfhrequeststatus: "" };
    return dataMap[empId][date];
  };

  const s = (v: unknown): string => (v as string) ?? "";

  // Fill employee info field-by-field: each field updates independently as
  // soon as a non-empty value is found across any table and any row.
  const mergeEmpInfo = (id: string, name: string, dept: string, manager: string) => {
    if (!empInfo[id]) empInfo[id] = { name: "", dept: "", manager: "" };
    if (!empInfo[id].name && name) empInfo[id].name = name;
    if (!empInfo[id].dept && dept) empInfo[id].dept = dept;
    if (!empInfo[id].manager && manager) empInfo[id].manager = manager;
  };

  for (const row of officeRows) {
    const id = s(row.employeeid);
    const d = s(row.checkindate);
    if (!id || !d) continue;
    const c = cell(id, d);
    const t = s(row.checkintime);
    if (!c.officecheckin || t < c.officecheckin) c.officecheckin = t;
    // OFFICE_CHECKIN_TB has no name columns — empInfo filled from other tables
  }

  for (const row of wfhRows) {
    const id = s(row.employeeid);
    const ts = s(row.timestampclockin);
    if (!id || !ts) continue;
    const d = ts.includes("T") ? ts.split("T")[0] : ts.split(" ")[0];
    const t = ts.includes("T") ? ts.split("T")[1]?.slice(0, 8) : ts.split(" ")[1]?.slice(0, 8);
    const c = cell(id, d);
    if (t) c.wfhclockinsArr.push(t);
    mergeEmpInfo(id, s(row.employeename), s(row.department), s(row.reportingmanager));
  }

  for (const row of leaveRows) {
    const id = s(row.employeeid);
    const from = s(row.fromdate);
    const to = s(row.todate);
    if (!id || !from || !to) continue;
    for (const d of expandDateRange(from, to)) {
      const c = cell(id, d);
      c.leavetype = s(row.leavetype);
      c.leavestatus = s(row.status);
    }
    mergeEmpInfo(id, s(row.employeename), s(row.department), s(row.reportingmanager));
  }

  for (const row of wfhReqRows) {
    const id = s(row.employeeid);
    const from = s(row.fromdate);
    const to = s(row.todate);
    if (!id || !from || !to) continue;
    for (const d of expandDateRange(from, to)) {
      cell(id, d).wfhrequeststatus = s(row.requeststatus);
    }
    mergeEmpInfo(id, s(row.employeename), s(row.department), s(row.reportingmanager));
  }

  const result: ConsolidatedRow[] = [];
  for (const [empId, dates] of Object.entries(dataMap)) {
    const info = empInfo[empId] ?? { name: "", dept: "", manager: "" };
    for (const [date, c] of Object.entries(dates)) {
      result.push({
        employeeid: empId,
        employeename: info.name,
        department: info.dept,
        reportingmanager: info.manager,
        date,
        officecheckin: c.officecheckin,
        wfhclockins: c.wfhclockinsArr.sort().join(", "),
        leavetype: c.leavetype,
        leavestatus: c.leavestatus,
        wfhrequeststatus: c.wfhrequeststatus,
      });
    }
  }

  result.sort((a, b) => a.employeeid.localeCompare(b.employeeid) || a.date.localeCompare(b.date));
  return result;
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
  leavedayscount: number;
  wfhrequestdayscount: number;
  calendar: {
    checkindate: string;
    officefirstcheckin: string;
    wfhtimes: string;
    leavetype: string;
    leavestatus: string;
    wfhrequeststatus: string;
  }[];
}

function expandDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to);
  const cur = new Date(from);
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export async function fetchEmployeeSummary(cardId: string, employeeId: string): Promise<EmployeeSummary> {
  const [{ data: officeRows }, { data: wfhRows }, { data: leaveRows }, { data: wfhReqRows }] = await Promise.all([
    supabase.from("OFFICE_CHECKIN_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
    supabase.from("WFH_CLOCKIN_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
    supabase.from("LEAVE_REQUESTS_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
    supabase.from("WFH_REQUESTS_TB").select("*").eq("cardid", cardId).eq("employeeid", employeeId),
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

  // WFH clock-ins: all times per date
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

  // Leave requests: expand date ranges
  const leaveDateMap: Record<string, { leavetype: string; status: string }> = {};
  for (const row of (leaveRows ?? [])) {
    if (!row.fromdate || !row.todate) continue;
    for (const d of expandDateRange(row.fromdate, row.todate)) {
      leaveDateMap[d] = { leavetype: row.leavetype ?? "", status: row.status ?? "" };
    }
    if (!employeename) employeename = row.employeename ?? "";
    if (!department) department = row.department ?? "";
    if (!reportingmanager) reportingmanager = row.reportingmanager ?? "";
  }

  // WFH requests: expand date ranges
  const wfhReqDateMap: Record<string, string> = {};
  for (const row of (wfhReqRows ?? [])) {
    if (!row.fromdate || !row.todate) continue;
    for (const d of expandDateRange(row.fromdate, row.todate)) {
      wfhReqDateMap[d] = row.requeststatus ?? "";
    }
    if (!employeename) employeename = row.employeename ?? "";
    if (!department) department = row.department ?? "";
    if (!reportingmanager) reportingmanager = row.reportingmanager ?? "";
  }

  const allDates = [...new Set([
    ...Object.keys(officeDateMap),
    ...Object.keys(wfhDateMap),
    ...Object.keys(leaveDateMap),
    ...Object.keys(wfhReqDateMap),
  ])].sort();

  const calendar = allDates.map((d) => ({
    checkindate: d,
    officefirstcheckin: officeDateMap[d] ?? "",
    wfhtimes: (wfhDateMap[d] ?? []).sort().join(", "),
    leavetype: leaveDateMap[d]?.leavetype ?? "",
    leavestatus: leaveDateMap[d]?.status ?? "",
    wfhrequeststatus: wfhReqDateMap[d] ?? "",
  }));

  return {
    employeeid: employeeId,
    employeename,
    department,
    reportingmanager,
    officedayscount: Object.keys(officeDateMap).length,
    wfhdayscount: Object.keys(wfhDateMap).length,
    leavedayscount: Object.keys(leaveDateMap).length,
    wfhrequestdayscount: Object.keys(wfhReqDateMap).length,
    calendar,
  };
}
