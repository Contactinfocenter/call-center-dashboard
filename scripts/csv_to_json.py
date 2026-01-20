import pandas as pd
import json
import glob
import os
import numpy as np

REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
CALLS_DIR = os.path.join(REPO_ROOT, "dist", "data", "call_logs")
DROPS_DIR = os.path.join(REPO_ROOT, "dist", "data", "drops")

OUTPUT_CALLS = os.path.join(REPO_ROOT, "data", "detailed_call_logs.json")
OUTPUT_DROPS = os.path.join(REPO_ROOT, "data", "detailed_drop_calls.json")

os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)

print("Repo root:", REPO_ROOT)
print("Call logs dir:", CALLS_DIR, "exists?", os.path.isdir(CALLS_DIR))
print("Drops dir:", DROPS_DIR, "exists?", os.path.isdir(DROPS_DIR))

# ────────────────────────────────────────────────
# DETAILED CALL LOGS
# ────────────────────────────────────────────────

call_records = {"records": {}}
call_files = sorted(glob.glob(os.path.join(CALLS_DIR, "*.csv")))

print(f"Found {len(call_files)} call log CSV files")

for file in call_files:
    fname = os.path.basename(file)
    print(f"Processing call log: {fname}")
    try:
        df = pd.read_csv(file, encoding='latin1')
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]

        df["call_date"] = pd.to_datetime(df["call_date"], errors='coerce')
        df = df.dropna(subset=["call_date"])

        df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")

        df["campaign_id"] = df["campaign_id"].astype(str).str.upper().str.strip()
        df["direction"] = "inbound"
        df.loc[df["campaign_id"].isin(["CARNIVAL", "SYLHET"]), "direction"] = "outbound"

        df["answer_status"] = "Not Answered"
        df.loc[df["status"].str.upper() == "FCR", "answer_status"] = "FCR"

        # Clean NaN
        df = df.replace([pd.NA, np.nan], None)

        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in call_records["records"]:
                call_records["records"][date_str] = {}

            phone = int(row["phone_number"]) if pd.notna(row["phone_number"]) else None
            timestamp_ms = int(row["call_date"].timestamp() * 1000)
            key = f"{phone}_{timestamp_ms}"

            entry = {}
            for col, val in row.items():
                if pd.isna(val):
                    entry[col] = None
                elif isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                elif isinstance(val, float) and val.is_integer():
                    entry[col] = int(val)
                else:
                    entry[col] = val

            entry["direction"] = row["direction"]
            entry["answer_status"] = row["answer_status"]

            call_records["records"][date_str][key] = entry

        print(f"  Added {len(df)} call records from {fname}")

    except Exception as e:
        print(f"Error in {fname}: {str(e)}")

with open(OUTPUT_CALLS, "w", encoding="utf-8") as f:
    json.dump(call_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed call logs → {OUTPUT_CALLS}")
print(f"Total call records: {sum(len(day.values()) for day in call_records['records'].values())}")

# ────────────────────────────────────────────────
# DETAILED DROP CALLS – FIXED FOR COMMA-SEPARATED + HEADER
# ────────────────────────────────────────────────

drop_records = {"records": {}}
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))

print(f"Found {len(drop_files)} drop CSV files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"Processing drop file: {fname}")
    try:
        # Read as proper CSV with header
        df = pd.read_csv(
            file,
            encoding='utf-8',
            encoding_errors='replace',
            on_bad_lines='skip'
        )

        # Normalize columns
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]

        print(f"  Parsed rows: {len(df)}")
        if len(df) > 0:
            print(f"  Columns: {list(df.columns)}")
            print(f"  First 3 rows:\n{df.head(3).to_string(index=False)}")

        # If 'date' and 'time' exist, parse datetime
        if 'date' in df.columns and 'time' in df.columns:
            df['datetime_str'] = df['date'] + ' ' + df['time']
            df['datetime'] = pd.to_datetime(df['datetime_str'], errors='coerce')

            invalid = df['datetime'].isna().sum()
            if invalid > 0:
                print(f"  {invalid} invalid datetimes")
            df = df.dropna(subset=['datetime'])

        df['date'] = df['datetime'].dt.strftime("%Y-%m-%d") if 'datetime' in df.columns else 'unknown'

        for _, row in df.iterrows():
            date_str = row.get("date", "unknown")
            if date_str not in drop_records["records"]:
                drop_records["records"][date_str] = {}

            phone = int(row["phone_number"]) if 'phone_number' in row and pd.notna(row["phone_number"]) else None
            timestamp_ms = int(row["datetime"].timestamp() * 1000) if 'datetime' in row and pd.notna(row["datetime"]) else 0
            key = f"{phone}_{timestamp_ms}"

            entry = {}
            for col, val in row.items():
                if pd.isna(val):
                    entry[col] = None
                elif isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                elif isinstance(val, float) and val.is_integer():
                    entry[col] = int(val)
                else:
                    entry[col] = val

            drop_records["records"][date_str][key] = entry

        print(f"  Added {len(df)} drop records from {fname}")

    except Exception as e:
        print(f"Critical error in {fname}: {str(e)}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed drop logs → {OUTPUT_DROPS}")
print(f"Total drop records: {sum(len(day.values()) for day in drop_records['records'].values())}")