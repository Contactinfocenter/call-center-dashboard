import pandas as pd
import json
import glob
import os
import numpy as np
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

# ────────────────────────────────────────────────
# Helper: robust datetime parsing – FIXED for 1/18/2026 8:04:56
# ────────────────────────────────────────────────
def parse_datetime(dt_str):
    if not dt_str or pd.isna(dt_str):
        return None
    dt_str = str(dt_str).strip()
    
    # Replace slash with dash for consistency
    dt_str = dt_str.replace('/', '-')
    
    formats = [
        "%m-%d-%Y %H:%M:%S",      # 1-18-2026 8:04:56
        "%m-%d-%Y %H:%M",         # 1-18-2026 8:04
        "%m-%d-%Y",               # 1-18-2026
        "%-m-%-d-%Y %H:%M:%S",    # 1-18-2026 8:04:56 (no leading zero)
        "%-m-%-d-%Y",             # 1-18-2026
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(dt_str, fmt)
            return pd.Timestamp(dt)
        except ValueError:
            continue
    
    # Fallback: pandas auto-detect
    try:
        return pd.to_datetime(dt_str, errors='raise')
    except Exception as e:
        print(f"  Failed to parse: '{dt_str}' → {e}")
        return None

# ────────────────────────────────────────────────
# DETAILED CALL LOGS (unchanged – already working)
# ────────────────────────────────────────────────
call_records = {"records": {}}
call_files = sorted(glob.glob(os.path.join(CALLS_DIR, "*.csv")))
print(f"Found {len(call_files)} call log CSV files")

for file in call_files:
    fname = os.path.basename(file)
    print(f"Processing call log: {fname}")
    try:
        df = pd.read_csv(file, encoding='latin1', on_bad_lines='warn', low_memory=False)
        if df.empty:
            print("  → Empty file, skipped")
            continue
        
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
        
        df["call_date"] = df["call_date"].apply(parse_datetime)
        invalid = df["call_date"].isna().sum()
        if invalid > 0:
            print(f"  Skipped {invalid} invalid call_date rows")
        df = df.dropna(subset=["call_date"])
        
        df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")
        
        df["direction"] = "inbound"
        if "campaign_id" in df.columns:
            df["campaign_id"] = df["campaign_id"].astype(str).str.upper().str.strip()
            df.loc[df["campaign_id"].isin(["CARNIVAL", "SYLHET", "DIRECT_AGENT_BANLA"]), "direction"] = "outbound"
        
        df["answer_status"] = "Not Answered"
        if "status" in df.columns:
            df.loc[df["status"].str.upper() == "FCR", "answer_status"] = "FCR"
        
        df = df.replace([pd.NA, np.nan, np.inf, -np.inf], None)
        
        added = 0
        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in call_records["records"]:
                call_records["records"][date_str] = {}
            
            phone = "unknown"
            if pd.notna(row.get("phone_number")):
                try:
                    phone = str(int(float(row["phone_number"])))
                except:
                    phone = str(row["phone_number"]).strip()
            
            timestamp_ms = int(row["call_date"].timestamp() * 1000)
            key = f"{phone}_{timestamp_ms}"
            
            entry = {}
            for col, val in row.items():
                if pd.isna(val):
                    continue
                elif isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                elif isinstance(val, (float, int)):
                    entry[col] = int(val) if val.is_integer() else float(val)
                else:
                    entry[col] = val
            
            entry["direction"] = row.get("direction", "inbound")
            entry["answer_status"] = row.get("answer_status", "Not Answered")
            
            call_records["records"][date_str][key] = entry
            added += 1
        
        print(f"  Added {added} call records from {fname}")
    
    except Exception as e:
        print(f"Error in {fname}: {str(e)}")

with open(OUTPUT_CALLS, "w", encoding="utf-8") as f:
    json.dump(call_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed call logs → {OUTPUT_CALLS}")
print(f"Total call records: {sum(len(day.values()) for day in call_records['records'].values())}")
print(f"Days covered: {len(call_records['records'])}")

# ────────────────────────────────────────────────
# DETAILED DROP CALLS – FIXED PARSER
# ────────────────────────────────────────────────
drop_records = {"records": {}}
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))
print(f"Found {len(drop_files)} drop CSV files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"Processing drop file: {fname}")
    try:
        df = pd.read_csv(
            file,
            encoding='utf-8',
            encoding_errors='replace',
            on_bad_lines='warn',
            low_memory=False
        )
        if df.empty:
            print("  → Empty file, skipped")
            continue
        
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
        print(f"  Columns found: {list(df.columns)}")
        
        if 'date' in df.columns and 'time' in df.columns:
            # Force time to HH:MM:SS
            df['time'] = df['time'].astype(str).apply(
                lambda x: x.strip() + ':00' if x.strip() and ':' in x and len(x.split(':')) == 2 else x.strip()
            )
            df['datetime_str'] = df['date'].astype(str).str.strip() + ' ' + df['time'].str.strip()
            df['datetime'] = df['datetime_str'].apply(parse_datetime)
            
            # Debug: show what we're trying to parse
            print(f"  Sample raw datetime_str (first 5): {df['datetime_str'].head(5).tolist()}")
            print(f"  Sample parsed datetime (first 5): {df['datetime'].head(5).tolist()}")
        elif 'datetime' in df.columns:
            df['datetime'] = df['datetime'].apply(parse_datetime)
        else:
            print("  No date/time columns found — skipping")
            continue
        
        invalid_count = df['datetime'].isna().sum()
        print(f"  Total rows before dropna: {len(df)}, Invalid datetime: {invalid_count}")
        
        df = df.dropna(subset=['datetime'])
        if df.empty:
            print(f"  WARNING: All rows dropped — no valid datetimes in {fname}")
            continue
        
        df['date'] = df['datetime'].dt.strftime("%Y-%m-%d")
        
        added = 0
        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in drop_records["records"]:
                drop_records["records"][date_str] = {}
            
            phone = "unknown"
            if 'phone_number' in row and pd.notna(row["phone_number"]):
                try:
                    phone = str(int(float(row["phone_number"])))
                except:
                    phone = str(row["phone_number"]).strip()
            
            timestamp_ms = int(row["datetime"].timestamp() * 1000)
            key = f"{phone}_{timestamp_ms}"
            
            entry = {}
            for col, val in row.items():
                if pd.isna(val):
                    continue
                elif isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                elif isinstance(val, (float, int)):
                    entry[col] = int(val) if val.is_integer() else float(val)
                else:
                    entry[col] = val
            
            drop_records["records"][date_str][key] = entry
            added += 1
        
        print(f"  Added {added} drop records from {fname}")
    
    except Exception as e:
        print(f"Error in {fname}: {str(e)}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed drop logs → {OUTPUT_DROPS}")
print(f"Total drop records: {sum(len(day.values()) for day in drop_records['records'].values())}")
print(f"Days covered: {len(drop_records['records'])}")