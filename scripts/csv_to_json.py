import pandas as pd
import json
import glob
import os

# Calculate paths from repo root
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
CALLS_DIR = os.path.join(REPO_ROOT, "dist", "data", "call_logs")
DROPS_DIR = os.path.join(REPO_ROOT, "dist", "data", "drops")

OUTPUT_CALLS = os.path.join(REPO_ROOT, "data", "calls_agents.json")
OUTPUT_DROPS = os.path.join(REPO_ROOT, "data", "drops_summary.json")

OUTBOUND_CAMPAIGNS = ["CARNIVAL", "SYLHET"]

os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)

print("Repo root:", REPO_ROOT)
print("Call logs dir:", CALLS_DIR, "exists?", os.path.isdir(CALLS_DIR))
print("Drops dir:", DROPS_DIR, "exists?", os.path.isdir(DROPS_DIR))

# === Call Logs Processing ===
call_records = []
call_files = sorted(glob.glob(os.path.join(CALLS_DIR, "*.csv")))  # sort for consistent order

print(f"Found {len(call_files)} call log CSV files")

for file in call_files:
    fname = os.path.basename(file)
    print(f"Processing call log: {fname}")
    try:
        # Try multiple encodings
        df = None
        for enc in ['utf-8', 'latin1', 'cp1252']:
            try:
                df = pd.read_csv(file, encoding=enc)
                print(f"  Loaded with encoding: {enc}")
                break
            except UnicodeDecodeError:
                continue
        if df is None:
            raise ValueError("Could not decode file with common encodings")

        # Normalize columns
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
        print(f"  Columns: {list(df.columns)}")

        required = ["call_date"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            print(f"  Skipping: missing columns {missing}")
            continue

        df["call_date"] = pd.to_datetime(df["call_date"], errors='coerce')
        df = df.dropna(subset=["call_date"])

        df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")
        df["hour"] = df["call_date"].dt.hour

        if "campaign_id" in df.columns:
            df["campaign_id"] = df["campaign_id"].astype(str).str.upper().str.strip()
        else:
            df["campaign_id"] = "UNKNOWN"

        df["direction"] = "inbound"
        df.loc[df["campaign_id"].isin(OUTBOUND_CAMPAIGNS), "direction"] = "outbound"

        grouped = df.groupby(["date", "hour"])
        for (date, hour), g in grouped:
            inbound = (g["direction"] == "inbound").sum()
            outbound = (g["direction"] == "outbound").sum()
            agents = g["full_name"].nunique() if "full_name" in g.columns else 0

            call_records.append({
                "date": date,
                "hour": int(hour),
                "inbound": int(inbound),
                "outbound": int(outbound),
                "total_calls": int(inbound + outbound),
                "agents": int(agents)
            })

    except Exception as e:
        print(f"  Error in {fname}: {str(e)}")

with open(OUTPUT_CALLS, "w", encoding="utf-8") as f:
    json.dump(call_records, f, indent=2, ensure_ascii=False)

print(f"Saved {len(call_records)} call records → {OUTPUT_CALLS}")

# === Drops Processing ===
drop_records = []
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))

print(f"Found {len(drop_files)} drop CSV files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"Processing drop file: {fname}")
    try:
        df = pd.read_csv(file, encoding='utf-8', encoding_errors='replace')
        df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
        print(f"  Columns: {list(df.columns)}")

        # Basic aggregation example (customize based on actual columns)
        # e.g. count drops by reason, date, campaign, etc.
        if len(df) > 0:
            total_drops = len(df)
            drop_summary = {
                "file": fname,
                "total_drops": total_drops,
                "date": fname.split('_')[-1].replace('.csv', '') if '202' in fname else "unknown"
            }
            # Add more if columns like 'reason', 'campaign' exist
            if "reason" in df.columns:
                reason_counts = df["reason"].value_counts().to_dict()
                drop_summary["by_reason"] = reason_counts
            drop_records.append(drop_summary)

    except Exception as e:
        print(f"  Error in {fname}: {str(e)}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print(f"Saved {len(drop_records)} drop summaries → {OUTPUT_DROPS}")
