import pandas as pd
import json
import glob
import os
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
CALLS_DIR = os.path.join(REPO_ROOT, "dist", "data", "call_logs")
DROPS_DIR = os.path.join(REPO_ROOT, "dist", "data", "drops")

OUTPUT_CALLS = os.path.join(REPO_ROOT, "data", "detailed_call_logs.json")
OUTPUT_DROPS = os.path.join(REPO_ROOT, "data", "detailed_drop_calls.json")

os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)

print("Repo root:", REPO_ROOT)
print("Call logs dir:", CALLS_DIR, "exists?", os.path.isdir(CALLS_DIR))
print("Drops dir:", DROPS_DIR, "exists?", os.path.isdir(DROPS_DIR))

# === Detailed Call Logs ===
call_records = {"records": {}}
call_files = sorted(glob.glob(os.path.join(CALLS_DIR, "*.csv")))

print(f"Found {len(call_files)} call log files")

for file in call_files:
    fname = os.path.basename(file)
    print(f"Processing call log: {fname}")
    try:
        df = pd.read_csv(file, encoding='latin1')  # your working encoding
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]

        # Parse datetime
        df["call_date"] = pd.to_datetime(df["call_date"], errors='coerce')
        df = df.dropna(subset=["call_date"])

        df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")

        # Direction
        df["campaign_id"] = df["campaign_id"].astype(str).str.upper().str.strip()
        df["direction"] = "inbound"
        df.loc[df["campaign_id"].isin(["CARNIVAL", "SYLHET"]), "direction"] = "outbound"

        # Answer status
        df["answer_status"] = "Not Answered"
        df.loc[df["status"].str.upper() == "FCR", "answer_status"] = "FCR"
        # If you want to mark other statuses as "Answered (non-FCR)":
        # answered_codes = ["A", "B", "SWITCH", "DISPO"]  # add your known codes
        # df.loc[df["status"].str.upper().isin(answered_codes), "answer_status"] = "Answered (non-FCR)"

        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in call_records["records"]:
                call_records["records"][date_str] = {}

            # Unique key: phone + millisecond timestamp
            timestamp_ms = int(row["call_date"].timestamp() * 1000)
            key = f"{row['phone_number']}_{timestamp_ms}"

            call_records["records"][date_str][key] = {
                "call_date": row["call_date"].isoformat(),
                "phone_number": int(row["phone_number"]),
                "status": row["status"],
                "full_name": row["full_name"],
                "campaign_id": row["campaign_id"],
                "direction": row["direction"],
                "answer_status": row["answer_status"],
                "address3": row.get("address3", ""),
                "email": row.get("email", ""),
                "comments": row.get("comments", ""),
                "acht": float(row["acht"]) if pd.notna(row["acht"]) else None,
                "acr": row.get("acr", ""),
                "zone": row.get("zone", ""),
                "region": row.get("region", ""),
                "call_reason": row.get("call_reason", row.get("comments", "")),
                "client_type": row.get("client_type", "")
            }
    except Exception as e:
        print(f"Error in {fname}: {str(e)}")

with open(OUTPUT_CALLS, "w", encoding="utf-8") as f:
    json.dump(call_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed call logs → {OUTPUT_CALLS} ({sum(len(v) for v in call_records['records'].values())} calls)")

# === Detailed Drop Calls ===
drop_records = {"records": {}}
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))

print(f"Found {len(drop_files)} drop files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"Processing drop: {fname}")
    try:
        # Drop files have space delimiter, no header
        df = pd.read_csv(file, sep=r'\s+', header=None, on_bad_lines='skip', encoding='utf-8', encoding_errors='replace')
        df.columns = ['campaign_name', 'date', 'time', 'status', 'phone_number']

        df['datetime'] = pd.to_datetime(df['date'] + ' ' + df['time'], format='%m/%d/%Y %H:%M:%S', errors='coerce')
        df = df.dropna(subset=['datetime'])

        df['date'] = df['datetime'].dt.strftime("%Y-%m-%d")

        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in drop_records["records"]:
                drop_records["records"][date_str] = {}

            timestamp_ms = int(row["datetime"].timestamp() * 1000)
            key = f"{row['phone_number']}_{timestamp_ms}"

            drop_records["records"][date_str][key] = {
                "datetime": row["datetime"].isoformat(),
                "phone_number": int(row["phone_number"]),
                "status": row["status"],           # "DROP" or "TIMEOT"
                "campaign_name": row["campaign_name"],
                "date": row["date"],
                "time": row["time"]
            }
    except Exception as e:
        print(f"Error in {fname}: {str(e)}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed drop logs → {OUTPUT_DROPS} ({sum(len(v) for v in drop_records['records'].values())} drops)")