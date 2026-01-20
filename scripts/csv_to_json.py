import pandas as pd
import json
import glob
import os

CSV_DIR = "data/csv"                    # ← change this if needed
OUTPUT_CALLS = "data/calls_agents.json"
OUTBOUND_CAMPAIGNS = ["CARNIVAL", "SYLHET"]

# Diagnostic print (remove later if you want clean output)
print("cwd:", os.getcwd())
print("csv dir exists?", os.path.isdir(CSV_DIR))
print("matching files:", glob.glob(f"{CSV_DIR}/*call*.csv"))

records = []
csv_files = glob.glob(f"{CSV_DIR}/*call*.csv")

if not csv_files:
    print("⚠️  No call CSV files found! Check folder and file names.")
else:
    for file in csv_files:
        print(f"Processing: {file}")
        df = pd.read_csv(file)
        df.columns = [c.strip().lower() for c in df.columns]

        if "call_date" not in df.columns:
            print(f"Warning: 'call_date' column missing in {file}")
            continue

        df["call_date"] = pd.to_datetime(df["call_date"], errors='coerce')
        df = df.dropna(subset=["call_date"])  # drop invalid dates

        df["date"]  = df["call_date"].dt.strftime("%Y-%m-%d")
        df["hour"]  = df["call_date"].dt.hour

        if "campaign_id" in df.columns:
            df["campaign_id"] = df["campaign_id"].astype(str).str.upper().str.strip()
        else:
            df["campaign_id"] = "UNKNOWN"

        df["direction"] = "inbound"
        df.loc[df["campaign_id"].isin(OUTBOUND_CAMPAIGNS), "direction"] = "outbound"

        grouped = df.groupby(["date", "hour"])
        for (date, hour), g in grouped:
            inbound  = (g["direction"] == "inbound").sum()
            outbound = (g["direction"] == "outbound").sum()
            agents   = g["full_name"].nunique() if "full_name" in g.columns else 0

            records.append({
                "date": date,
                "hour": int(hour),
                "inbound": int(inbound),
                "outbound": int(outbound),
                "total_calls": int(inbound + outbound),
                "agents": int(agents)
            })

# Save even if empty (makes debugging easier)
os.makedirs(os.path.dirname(OUTPUT_CALLS), exist_ok=True)
with open(OUTPUT_CALLS, "w") as f:
    json.dump(records, f, indent=2)

print(f"Generated {len(records)} hourly records → {OUTPUT_CALLS}")
