import pandas as pd
import json
import glob
import os
import numpy as np
from datetime import datetime

# ── PATHS ──────────────────────────────────────────────────────────────
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
CALLS_DIR = os.path.join(REPO_ROOT, "dist", "data", "call_logs")
DROPS_DIR = os.path.join(REPO_ROOT, "dist", "data", "drops")
OUTPUT_CALLS = os.path.join(REPO_ROOT, "data", "detailed_call_logs.json")
OUTPUT_DROPS = os.path.join(REPO_ROOT, "data", "detailed_drop_calls.json")

os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)

print("Repo root:", REPO_ROOT)
print("Call logs dir:", CALLS_DIR, "exists?", os.path.isdir(CALLS_DIR))
print("Drops dir:", DROPS_DIR, "exists?", os.path.isdir(DROPS_DIR))


# ── DATETIME PARSER ────────────────────────────────────────────────────
def parse_datetime(dt_str):
    if not dt_str or pd.isna(dt_str):
        return None

    dt_str = str(dt_str).strip().replace('/', '-')

    formats = [
        "%m-%d-%Y %H:%M:%S", "%m-%d-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M",
    ]

    for fmt in formats:
        try:
            return pd.to_datetime(dt_str, format=fmt)
        except ValueError:
            continue

    try:
        return pd.to_datetime(dt_str, errors="raise")
    except Exception as e:
        print(f"Failed datetime parse: {dt_str} → {e}")
        return None


# ── CALL LOGS ──────────────────────────────────────────────────────────
call_records = {"records": {}}
call_files = sorted(glob.glob(os.path.join(CALLS_DIR, "*.csv")))
print(f"Found {len(call_files)} call CSV files")

for file in call_files:
    fname = os.path.basename(file)
    print(f"\nProcessing call file: {fname}")

    try:
        df = pd.read_csv(file, encoding="latin1", on_bad_lines="warn", low_memory=False)
        if df.empty:
            print("  → Empty file, skipped")
            continue

        # Normalize column names
        df.columns = [c.strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns]

        # Parse datetime
        df["call_date"] = df["call_date"].apply(parse_datetime)
        df = df.dropna(subset=["call_date"])
        df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")

        # ── FIX #1: NORMALIZE STATUS ──
        if "status" in df.columns:
            df["status"] = df["status"].astype(str).str.upper().str.strip()

        # ── FIX #2: NORMALIZE & GUARD DIRECTION ──
        if "direction" in df.columns:
            df["direction"] = df["direction"].astype(str).str.lower().str.strip()
            df["direction"] = df["direction"].replace(
                ["out bound", "out-bound", "out", "outboud"], "outbound"
            )
            df["direction"] = df["direction"].replace(
                ["in bound", "in-bound", "in", "inboud"], "inbound"
            )
            df["direction"] = df["direction"].where(
                df["direction"].isin(["inbound", "outbound"]),
                "inbound"
            )
        else:
            df["direction"] = "inbound"

        print("  Direction distribution:", df["direction"].value_counts().to_dict())

        # ── FIX #3: FORCE AHT NUMERIC ──
        if "acht" in df.columns:
            df["acht"] = pd.to_numeric(df["acht"], errors="coerce").fillna(0)

        df = df.replace([pd.NA, np.nan, np.inf, -np.inf], None)

        added = 0
        for _, row in df.iterrows():
            date_str = row["date"]
            call_records["records"].setdefault(date_str, {})

            # Phone
            phone = "unknown"
            if row.get("phone_number") is not None:
                try:
                    phone = str(int(float(row["phone_number"])))
                except:
                    phone = str(row["phone_number"]).strip()

            timestamp_ms = int(row["call_date"].timestamp() * 1000)
            key = f"{phone}_{timestamp_ms}"

            entry = {}
            for col, val in row.items():
                if val is None:
                    continue
                if isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                else:
                    entry[col] = val

            call_records["records"][date_str][key] = entry
            added += 1

        print(f"  Added {added} call records")

    except Exception as e:
        print(f"  ERROR: {e}")

with open(OUTPUT_CALLS, "w", encoding="utf-8") as f:
    json.dump(call_records, f, indent=2, ensure_ascii=False)

print("\nSaved call JSON →", OUTPUT_CALLS)
print("Total calls:", sum(len(v) for v in call_records["records"].values()))


# ── DROP CALLS (UNCHANGED) ─────────────────────────────────────────────
drop_records = {"records": {}}
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))
print(f"\nFound {len(drop_files)} drop CSV files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"\nProcessing drop file: {fname}")

    try:
        df = pd.read_csv(file, encoding="utf-8", encoding_errors="replace", on_bad_lines="warn", low_memory=False)
        if df.empty:
            continue

        df.columns = [c.strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns]

        if "date" in df.columns and "time" in df.columns:
            df["time"] = df["time"].astype(str).apply(
                lambda x: x.strip() + ":00" if len(x.strip().split(":")) == 2 else x.strip()
            )
            df["datetime"] = (df["date"].astype(str) + " " + df["time"]).apply(parse_datetime)
        elif "datetime" in df.columns:
            df["datetime"] = df["datetime"].apply(parse_datetime)
        else:
            continue

        df = df.dropna(subset=["datetime"])
        df["date"] = df["datetime"].dt.strftime("%Y-%m-%d")

        added = 0
        for _, row in df.iterrows():
            date_str = row["date"]
            drop_records["records"].setdefault(date_str, {})

            phone = "unknown"
            if row.get("phone_number") is not None:
                try:
                    phone = str(int(float(row["phone_number"])))
                except:
                    phone = str(row["phone_number"]).strip()

            timestamp_ms = int(row["datetime"].timestamp() * 1000)
            key = f"{phone}_{timestamp_ms}"

            entry = {}
            for col, val in row.items():
                if val is None:
                    continue
                if isinstance(val, pd.Timestamp):
                    entry[col] = val.isoformat()
                else:
                    entry[col] = val

            drop_records["records"][date_str][key] = entry
            added += 1

        print(f"  Added {added} drop records")

    except Exception as e:
        print(f"  ERROR: {e}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print("\nSaved drop JSON →", OUTPUT_DROPS)
print("Total drops:", sum(len(v) for v in drop_records["records"].values()))
