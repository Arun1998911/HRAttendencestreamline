import * as XLSX from "xlsx";

function toISODate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    // Darwinbox exports "date only" cells as timestamps ~10 seconds before midnight IST
    // (e.g. 2026-05-08 intended → stored as 2026-05-07T18:29:50Z = 2026-05-07T23:59:50 IST).
    // Both toISOString() and local getDate() return the wrong day.
    // Fix: shift +12 hours then read UTC date — this rounds any near-midnight
    // timestamp to the correct calendar day regardless of machine timezone.
    const shifted = new Date(val.getTime() + 12 * 60 * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const d = String(shifted.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function toISOTimestamp(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function excelDateToISO(val: unknown): { date: string; time: string } | null {
  if (!val) return null;
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === "number") {
    d = XLSX.SSF.parse_date_code(val) as unknown as Date;
    // XLSX.SSF.parse_date_code returns {y,m,d,H,M,S} not a Date
    const parsed = XLSX.SSF.parse_date_code(val) as { y: number; m: number; d: number; H: number; M: number; S: number };
    d = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  } else {
    d = new Date(String(val));
  }
  if (isNaN(d.getTime())) return null;
  const date = d.toISOString().split("T")[0];
  const time = d.toTimeString().slice(0, 8);
  return { date, time };
}

export function parseOfficeCheckin(buffer: ArrayBuffer, cardId: string) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Row index 1 is the actual header row
  const headers = (rows[1] as string[]) ?? [];
  const timeIdx = headers.indexOf("First in Time");
  const personnelIdx = headers.indexOf("Personnel ID");
  const firstNameIdx = headers.indexOf("First Name");
  const lastNameIdx = headers.indexOf("Last Name");
  const deptIdx = headers.indexOf("Department Name");

  const records: Record<string, unknown>[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawId = row[personnelIdx];
    const numId = Number(rawId);
    if (!rawId || isNaN(numId) || numId <= 0) continue;

    const firstName = String(row[firstNameIdx] ?? "").trim();
    const lastName = String(row[lastNameIdx] ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const dt = excelDateToISO(row[timeIdx]);
    records.push({
      cardid: cardId,
      employeeid: `KSPL${Math.floor(numId).toString().padStart(3, "0")}`,
      checkindate: dt?.date ?? null,
      checkintime: dt?.time ?? null,
      employeename: fullName,
      department: row[deptIdx] ? String(row[deptIdx]).trim() || null : null,
    });
  }
  return records;
}

// Converts "04-Apr-2026 09:48:00" → "2026-04-04T09:48:00" (new Remote clock-ins format).
// Returns null if the string doesn't match, so the caller can fall back.
const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
function parseDDMonYYYY(s: string): string | null {
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1]}T${m[4]}`;
}

export function parseWFHClockin(buffer: ArrayBuffer, cardId: string) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Row index 2 is the actual header row
  const headers = (rows[2] as string[]) ?? [];
  const col = (name: string) => headers.indexOf(name);

  const records: Record<string, unknown>[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((v) => v === null || v === undefined || v === "")) continue;

    const tsRaw = row[col("Time Stamp")];
    let timestampclockin: string | null = null;
    if (tsRaw instanceof Date) {
      timestampclockin = tsRaw.toISOString();
    } else if (tsRaw) {
      const str = String(tsRaw);
      // New format: "DD-Mon-YYYY HH:MM:SS" → convert to ISO so date extraction works
      timestampclockin = parseDDMonYYYY(str) ?? str;
    }

    const record: Record<string, unknown> = {
      cardid: cardId,
      employeeid: String(row[col("Employee Number")] ?? ""),
      employeename: row[col("Employee Name")] ?? null,
      jobtitle: row[col("Job Title")] ?? null,
      department: row[col("Department")] ?? null,
      reportingmanager: row[col("Reporting Manager")] ?? null,
      timestampclockin,
      requesttype: row[col("Request Type")] ?? null,
      latitude: row[col("Latitude")] ?? null,
      longitude: row[col("Longitude")] ?? null,
      address: row[col("Address")] ?? null,
      note: row[col("Note")] ?? null,
    };
    // Only include punchstatus when the column exists in the file and has a value.
    // Omitting the key entirely lets old-format uploads work without the DB column.
    const ps = row[col("Punch Status")];
    if (ps != null) record.punchstatus = ps;
    records.push(record);
  }
  return records;
}

export function parseLeaveRequests(buffer: ArrayBuffer, cardId: string) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  const headers = (rows[2] as string[]) ?? [];
  const col = (name: string) => headers.indexOf(name);

  const records: Record<string, unknown>[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((v) => v === null || v === undefined || v === "")) continue;
    records.push({
      cardid: cardId,
      employeeid: String(row[col("Employee Number")] ?? ""),
      employeename: row[col("Employee Name")] ?? null,
      jobtitle: row[col("Job Title")] ?? null,
      businessunit: row[col("Business Unit")] ?? null,
      department: row[col("Department")] ?? null,
      subdepartment: row[col("Sub Department")] ?? null,
      location: row[col("Location")] ?? null,
      costcenter: row[col("Cost Center")] ?? null,
      reportingmanager: row[col("Reporting Manager")] ?? null,
      leavetype: row[col("Leave Types")] ?? null,
      fromdate: toISODate(row[col("From Date")]),
      fromsession: row[col("From Session")] ?? null,
      todate: toISODate(row[col("To Date")]),
      tosession: row[col("To Session")] ?? null,
      totalduration: row[col("Total Duration")] != null ? String(row[col("Total Duration")]) : null,
      unit: row[col("Unit")] ?? null,
      requestedon: toISOTimestamp(row[col("Requested On")]),
      requestedby: row[col("Requested By")] ?? null,
      note: row[col("Note")] ?? null,
      reason: row[col("Reason")] ?? null,
      status: row[col("Status")] ?? null,
      lastactiontakenby: row[col("Last Action Taken by")] ?? null,
      lastactiontakenon: toISOTimestamp(row[col("Last Action Taken on")]),
      nextapprover: row[col("Next Approver")] ?? null,
    });
  }
  return records;
}

export function parseWFHRequests(buffer: ArrayBuffer, cardId: string) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  const headers = (rows[2] as string[]) ?? [];
  const col = (name: string) => headers.indexOf(name);

  const records: Record<string, unknown>[] = [];
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((v) => v === null || v === undefined || v === "")) continue;
    records.push({
      cardid: cardId,
      employeeid: String(row[col("Employee Number")] ?? ""),
      employeename: row[col("Employee Name")] ?? null,
      jobtitle: row[col("Job Title")] ?? null,
      businessunit: row[col("Business Unit")] ?? null,
      department: row[col("Department")] ?? null,
      subdepartment: row[col("Sub Department")] ?? null,
      location: row[col("Location")] ?? null,
      costcenter: row[col("Cost Center")] ?? null,
      reportingmanager: row[col("Reporting Manager")] ?? null,
      requesttype: row[col("Request Type")] ?? null,
      requeststatus: row[col("Request Status")] ?? null,
      rejectionreason: row[col("Rejection/Cancellation Reason")] ?? null,
      fromdate: toISODate(row[col("From Date")]),
      todate: toISODate(row[col("To Date")]),
      totalduration: row[col("Total Duration")] != null ? String(row[col("Total Duration")]) : null,
      requestedon: toISOTimestamp(row[col("Requested On")]),
      requester: row[col("Requester")] ?? null,
      note: row[col("Note")] ?? null,
      reason: row[col("Reason")] ?? null,
      actiontakenby: row[col("Action Taken By")] ?? null,
      actiontakenon: toISOTimestamp(row[col("Action Taken On")]),
      nextapprover: row[col("Next Approver")] ?? null,
    });
  }
  return records;
}
