import pandas as pd
import json
import glob

CSV_DIR = "data/csv"
OUTPUT_CALLS = "data/calls_agents.json"

OUTBOUND_CAMPAIGNS = ["CARNIVAL", "SYLHET"]

records = []

for file in glob.glob(f"{CSV_DIR}/*call*.csv"):
    df = pd.read_csv(file)

    # Normalize columns
    df.columns = [c.strip().lower() for c in df.columns]

    # Parse datetime
    df["call_date"] = pd.to_datetime(df["call_date"])
    df["date"] = df["call_date"].dt.strftime("%Y-%m-%d")
    df["hour"] = df["call_date"].dt.hour

    # Normalize campaign_id
    df["campaign_id"] = df["campaign_id"].str.upper().str.strip()

    # Direction logic
    df["direction"] = "inbound"
    df.loc[df["campaign_id"].isin(OUTBOUND_CAMPAIGNS), "direction"] = "outbound"

    grouped = df.groupby(["date", "hour"])

    for (date, hour), g in grouped:
        inbound = (g["direction"] == "inbound").sum()
        outbound = (g["direction"] == "outbound").sum()

        records.append({
            "date": date,
            "hour": int(hour),
            "inbound": int(inbound),
            "outbound": int(outbound),
            "total_calls": int(inbound + outbound),
            "agents": int(g["full_name"].nunique())
        })

# Save JSON
with open(OUTPUT_CALLS, "w") as f:
    json.dump(records, f, indent=2)

print("Calls & agents JSON generated successfully (campaign-based)")
