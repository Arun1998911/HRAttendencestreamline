import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});

export interface ReportCard {
  cardid: string;
  cardname: string;
  carddescription: string | null;
  createdby: string;
}

export async function fetchCards(): Promise<ReportCard[]> {
  const { data } = await api.get("/cards");
  return data;
}

export async function createCard(payload: {
  name: string;
  description: string;
  created_by: string;
}): Promise<ReportCard> {
  const { data } = await api.post("/cards", payload);
  return data;
}

export async function uploadOffice(cardId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post(`/cards/${cardId}/upload/office`, fd);
  return data;
}

export async function uploadWFH(cardId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post(`/cards/${cardId}/upload/wfh`, fd);
  return data;
}

export async function fetchOfficeData(cardId: string, limit = 100, offset = 0) {
  const { data } = await api.get(`/cards/${cardId}/office`, { params: { limit, offset } });
  return data as { rows: Record<string, unknown>[]; total: number };
}

export async function fetchWFHData(cardId: string, limit = 100, offset = 0) {
  const { data } = await api.get(`/cards/${cardId}/wfh`, { params: { limit, offset } });
  return data as { rows: Record<string, unknown>[]; total: number };
}

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
  const { data } = await api.get(`/cards/${cardId}/employee/${employeeId}`);
  return data;
}
