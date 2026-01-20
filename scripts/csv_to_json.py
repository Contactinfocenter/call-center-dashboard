import pandas as pd
import json
import glob
import os

# Base from repo root (since cwd is scripts/ when run with working-directory)
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))  # goes up from scripts/ to root
CSV_DIR = os.path.join(REPO_ROOT, "dist", "data")

OUTPUT_CALLS = os.path.join(REPO_ROOT, "data", "calls_agents.json")  # adjust output if needed

OUTBOUND_CAMPAIGNS = ["CARNIVAL", "SYLHET"]

print("Current working directory:", os.getcwd())
print("Repo root (calculated):", REPO_ROOT)
print("CSV dir:", CSV_DIR)
print("CSV dir exists?", os.path.isdir(CSV_DIR))
print("All files in CSV dir:", os.listdir(CSV_DIR) if os.path.isdir(CSV_DIR) else "— missing —")

# Broader pattern: any .csv in dist/data (since your files don't have "call")
csv_files = glob.glob(os.path.join(CSV_DIR, "*.csv"))

print("Matching CSV files:", csv_files)

if not csv_files:
    print("⚠️ No CSV files found in dist/data! Add files or check path.")
    records = []
else:
    records = []
    for file in csv_files:
        print(f"Processing: {file}")
        try:
            df = pd.read_csv(file)
            df.columns = [c.strip().lower() for c in df.columns]

            if "call_date" not in df.columns:
                print(f"Warning: 'call_date' missing in {os.path.basename(file)} – skipping")
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

                records.append({
                    "date": date,
                    "hour": int(hour),
                    "inbound": int(inbound),
                    "outbound": int(outbound),
                    "total_calls": int(inbound + outbound),
                    "agents": int(agents)
                })
        except Exception as e:
            print(f"Error processing {file}: {e}")

# Save (create parent dir if needed)
os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)
with open(OUTPUT_CALLS, "w") as f:
    json.dump(records, f, indent=2)

print(f"Generated {len(records)} hourly records → {OUTPUT_CALLS}")
