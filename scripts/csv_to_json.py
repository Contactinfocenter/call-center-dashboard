import pandas as pd
import json
import os
from datetime import datetime

# ── DYNAMIC PATHING ──────────────────────────────────────────────────────
# Get the absolute path of the scripts folder
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Get the project root (one level up from scripts)
ROOT_DIR = os.path.dirname(SCRIPT_DIR)

ANSWERED_FOLDER  = os.path.join(ROOT_DIR, "dist/data/call_logs")
DROPS_FOLDER     = os.path.join(ROOT_DIR, "dist/data/drops")
OUTPUT_DIR       = os.path.join(ROOT_DIR, "dist/data/calls")
OUTPUT_JSON      = os.path.join(OUTPUT_DIR, "all_calls.json")
DATE_FORMAT_IN_CSV = "%m/%d/%Y %H:%M"

# Create output dir if needed
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Final structure
final_calls = {"calls": {}}

# ── 1. Process answered calls CSVs ──────────────────────────────────────
if not os.path.exists(ANSWERED_FOLDER):
    print(f"Directory not found: {ANSWERED_FOLDER}")
    answered_files = []
else:
    answered_files = [f for f in os.listdir(ANSWERED_FOLDER) if f.lower().endswith(".csv")]

answered_files.sort()
print("Answered CSV files found:", answered_files)

for filename in answered_files:
    file_path = os.path.join(ANSWERED_FOLDER, filename)
    print(f"\nProcessing answered: {filename}...")
    try:
        df = pd.read_csv(file_path, encoding="cp1252")
        df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    except Exception as e:
        print(f"ERROR reading {filename}: {e}")
        continue

    date_key = filename.replace(".csv", "")
    if date_key not in final_calls["calls"]:
        final_calls["calls"][date_key] = {}

    for index, row in df.iterrows():
        phone = row.get("phone_number")
        raw_dt = row.get("call_date")
        
        # Default ID
        call_id = f"{date_key}_{index}"

        if raw_dt and phone:
            try:
                dt = datetime.strptime(str(raw_dt).strip(), DATE_FORMAT_IN_CSV)
                timestamp_ms = int(dt.timestamp() * 1000)
                call_id = f"{int(float(phone))}_{timestamp_ms}"
            except:
                pass

        call_data = {k: (None if pd.isna(v) else v) for k, v in row.to_dict().items()}

        formatted = {}
        for k, v in call_data.items():
            if k == "call_reason":
                formatted["Call Reason"] = v
            elif k == "client_type":
                formatted["Client type"] = v
            else:
                formatted[k] = v

        if "call_date" in formatted and isinstance(formatted["call_date"], str):
            try:
                dt = datetime.strptime(formatted["call_date"].strip(), DATE_FORMAT_IN_CSV)
                formatted["call_date"] = dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                pass

        formatted["is_drop"] = False
        final_calls["calls"][date_key][call_id] = formatted

# ── 2. Process dropped calls CSVs ───────────────────────────────────────
if not os.path.exists(DROPS_FOLDER):
    print(f"Directory not found: {DROPS_FOLDER}")
    drops_files = []
else:
    drops_files = [f for f in os.listdir(DROPS_FOLDER) if f.lower().endswith(".csv")]

drops_files.sort()
print("Dropped CSV files found:", drops_files)

for filename in drops_files:
    file_path = os.path.join(DROPS_FOLDER, filename)
    print(f"\nProcessing dropped: {filename}...")
    try:
        df = pd.read_csv(file_path)
        df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")
    except Exception as e:
        print(f"ERROR reading {filename}: {e}")
        continue

    # Extract date from filename (e.g., "2026-01-01.csv" → "2026-01-01")
    date_key = filename.replace("Drop_", "").replace(".csv", "").strip()

    if date_key not in final_calls["calls"]:
        final_calls["calls"][date_key] = {}

    for index, row in df.iterrows():
        date_str = str(row.get("date", ""))
        time_str = str(row.get("time", "00:00:00"))
        phone = str(row.get("phone_number", "")).strip()
        campaign = row.get("campaign_name", "")

        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%Y %H:%M:%S")
            call_date_str = dt.strftime("%Y-%m-%d %H:%M:%S")
        except:
            print(f"Skipping invalid date/time in {filename}: {date_str} {time_str}")
            continue

        call_id = f"drop_{phone}_{int(dt.timestamp())}" if phone else f"drop_{date_key}_{index}"

        formatted = {
            "call_date":     call_date_str,
            "phone_number":  phone,
            "status":        "DROP",
            "full_name":     None,
            "direction":     "inbound",
            "acht":          0,
            "campaign_id":   campaign,
            "comments":      "",
            "is_drop":       True
        }

        final_calls["calls"][date_key][call_id] = formatted

# ── Final stats & save ──────────────────────────────────────────────────
total_days = len(final_calls["calls"])
total_records = sum(len(final_calls["calls"][d]) for d in final_calls["calls"])
print(f"\nTotal records merged: {total_records} across {total_days} days.")

if total_records > 0:
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(final_calls, f, indent=2, ensure_ascii=False)
    print(f"Saved unified file: {OUTPUT_JSON}")
else:
    print("No records found! JSON not created.")