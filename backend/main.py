from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
import io
import os
import uuid
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="HR Attendance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

router = APIRouter(prefix="/api")


def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def clean_value(val):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    if isinstance(val, np.integer):
        return int(val)
    if isinstance(val, np.floating):
        return float(val)
    if isinstance(val, pd.Timestamp):
        return val.isoformat()
    return val


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Report Cards
# ---------------------------------------------------------------------------

class CardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    created_by: str


@router.get("/cards")
def list_cards():
    sb = get_supabase()
    return sb.table("REPORTCARDS_TB").select("*").execute().data


@router.post("/cards")
def create_card(payload: CardCreate):
    sb = get_supabase()
    card_id = str(uuid.uuid4())
    res = sb.table("REPORTCARDS_TB").insert({
        "cardid": card_id,
        "cardname": payload.name,
        "carddescription": payload.description,
        "createdby": payload.created_by,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create card")
    return res.data[0]


@router.get("/cards/{card_id}")
def get_card(card_id: str):
    sb = get_supabase()
    return sb.table("REPORTCARDS_TB").select("*").eq("cardid", card_id).single().execute().data


# ---------------------------------------------------------------------------
# Upload: Office Check-in
# ---------------------------------------------------------------------------

@router.post("/cards/{card_id}/upload/office")
async def upload_office_checkin(card_id: str, file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files accepted")

    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents), header=1)
    df["Personnel ID"] = pd.to_numeric(df["Personnel ID"], errors="coerce")
    df = df[df["Personnel ID"].notna()].copy()

    if df.empty:
        raise HTTPException(status_code=400, detail="No valid rows found (Personnel ID must be numeric)")

    records = []
    for _, row in df.iterrows():
        t = pd.to_datetime(row.get("Time"), errors="coerce")
        records.append({
            "cardid": card_id,
            "employeeid": f"KSPL{int(row['Personnel ID']):03d}",
            "checkindate": t.date().isoformat() if pd.notna(t) else None,
            "checkintime": t.strftime("%H:%M:%S") if pd.notna(t) else None,
        })

    sb = get_supabase()
    sb.table("OFFICE_CHECKIN_TB").delete().eq("cardid", card_id).execute()
    for i in range(0, len(records), 500):
        sb.table("OFFICE_CHECKIN_TB").insert(records[i:i + 500]).execute()

    return {"message": "Office check-in data uploaded", "rows_imported": len(records)}


# ---------------------------------------------------------------------------
# Upload: WFH Clock-in
# ---------------------------------------------------------------------------

@router.post("/cards/{card_id}/upload/wfh")
async def upload_wfh_clockin(card_id: str, file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files accepted")

    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents), header=2)
    df = df.dropna(how="all")

    records = []
    for _, row in df.iterrows():
        records.append({
            "cardid": card_id,
            "employeeid": clean_value(row.get("Employee Number")),
            "employeename": clean_value(row.get("Employee Name")),
            "jobtitle": clean_value(row.get("Job Title")),
            "department": clean_value(row.get("Department")),
            "reportingmanager": clean_value(row.get("Reporting Manager")),
            "timestampclockin": clean_value(row.get("Time Stamp")),
            "requesttype": clean_value(row.get("Request Type")),
            "latitude": clean_value(row.get("Latitude")),
            "longitude": clean_value(row.get("Longitude")),
            "address": clean_value(row.get("Address")),
            "note": clean_value(row.get("Note")),
        })

    sb = get_supabase()
    sb.table("WFH_CLOCKIN_TB").delete().eq("cardid", card_id).execute()
    for i in range(0, len(records), 500):
        sb.table("WFH_CLOCKIN_TB").insert(records[i:i + 500]).execute()

    return {"message": "WFH clock-in data uploaded", "rows_imported": len(records)}


# ---------------------------------------------------------------------------
# Get card data
# ---------------------------------------------------------------------------

@router.get("/cards/{card_id}/office")
def get_office_data(card_id: str, limit: int = 100, offset: int = 0):
    sb = get_supabase()
    res = sb.table("OFFICE_CHECKIN_TB").select("*").eq("cardid", card_id).range(offset, offset + limit - 1).execute()
    count_res = sb.table("OFFICE_CHECKIN_TB").select("*", count="exact").eq("cardid", card_id).execute()
    return {"rows": res.data, "total": count_res.count}


@router.get("/cards/{card_id}/wfh")
def get_wfh_data(card_id: str, limit: int = 100, offset: int = 0):
    sb = get_supabase()
    res = sb.table("WFH_CLOCKIN_TB").select("*").eq("cardid", card_id).range(offset, offset + limit - 1).execute()
    count_res = sb.table("WFH_CLOCKIN_TB").select("*", count="exact").eq("cardid", card_id).execute()
    return {"rows": res.data, "total": count_res.count}


# ---------------------------------------------------------------------------
# Employee summary
# ---------------------------------------------------------------------------

@router.get("/cards/{card_id}/employee/{employee_id}")
def get_employee_summary(card_id: str, employee_id: str):
    sb = get_supabase()

    office_res = sb.table("OFFICE_CHECKIN_TB").select("*").eq("cardid", card_id).eq("employeeid", employee_id).execute()
    wfh_res = sb.table("WFH_CLOCKIN_TB").select("*").eq("cardid", card_id).eq("employeeid", employee_id).execute()

    office_df = pd.DataFrame(office_res.data) if office_res.data else pd.DataFrame(columns=["employeeid", "checkindate", "checkintime"])
    wfh_df = pd.DataFrame(wfh_res.data) if wfh_res.data else pd.DataFrame(columns=["employeeid", "timestampclockin", "employeename", "department", "reportingmanager"])

    if not office_df.empty:
        office_df = office_df.sort_values("checkintime")
        office_by_date = office_df.groupby("checkindate")["checkintime"].first().reset_index().rename(columns={"checkintime": "officefirstcheckin"})
    else:
        office_by_date = pd.DataFrame(columns=["checkindate", "officefirstcheckin"])

    if not wfh_df.empty:
        wfh_df["wfhdate"] = pd.to_datetime(wfh_df["timestampclockin"], errors="coerce").dt.date.astype(str)
        wfh_df["wfhtime"] = pd.to_datetime(wfh_df["timestampclockin"], errors="coerce").dt.strftime("%H:%M:%S")
        wfh_by_date = wfh_df.groupby("wfhdate")["wfhtime"].apply(lambda x: ", ".join(sorted(x.dropna().astype(str).tolist()))).reset_index().rename(columns={"wfhdate": "checkindate", "wfhtime": "wfhtimes"})
        employee_name = wfh_df["employeename"].iloc[0] if "employeename" in wfh_df.columns else ""
        department = wfh_df["department"].iloc[0] if "department" in wfh_df.columns else ""
        reporting_manager = wfh_df["reportingmanager"].iloc[0] if "reportingmanager" in wfh_df.columns else ""
    else:
        wfh_by_date = pd.DataFrame(columns=["checkindate", "wfhtimes"])
        employee_name = department = reporting_manager = ""

    calendar = pd.merge(office_by_date, wfh_by_date, on="checkindate", how="outer").sort_values("checkindate").fillna("")
    calendar["officefirstcheckin"] = calendar["officefirstcheckin"].astype(str).replace("nan", "")
    calendar["wfhtimes"] = calendar["wfhtimes"].astype(str).replace("nan", "")

    return {
        "employeeid": employee_id,
        "employeename": employee_name,
        "department": department,
        "reportingmanager": reporting_manager,
        "officedayscount": int((calendar["officefirstcheckin"] != "").sum()),
        "wfhdayscount": int((calendar["wfhtimes"] != "").sum()),
        "calendar": calendar.to_dict(orient="records"),
    }


# ---------------------------------------------------------------------------
# Register router then serve React SPA (production)
# ---------------------------------------------------------------------------

app.include_router(router)

# Resolve from repo root (works both locally and on Railway)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend", "dist"))
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

print(f"[static] STATIC_DIR={STATIC_DIR} exists={os.path.exists(STATIC_DIR)}")

if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if os.path.exists(INDEX_FILE):
        return FileResponse(INDEX_FILE)
    return {"error": f"Frontend not built. STATIC_DIR={STATIC_DIR}"}
