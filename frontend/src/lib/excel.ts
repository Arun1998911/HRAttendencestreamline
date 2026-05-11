import * as XLSX from "xlsx";

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
  const timeIdx = headers.indexOf("Time");
  const personnelIdx = headers.indexOf("Personnel ID");

  const records: Record<string, unknown>[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rawId = row[personnelIdx];
    const numId = Number(rawId);
    if (!rawId || isNaN(numId) || numId <= 0) continue;

    const dt = excelDateToISO(row[timeIdx]);
    records.push({
      cardid: cardId,
      employeeid: `KSPL${Math.floor(numId).toString().padStart(3, "0")}`,
      checkindate: dt?.date ?? null,
      checkintime: dt?.time ?? null,
    });
  }
  return records;
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
      timestampclockin = String(tsRaw);
    }

    records.push({
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
    });
  }
  return records;
}
