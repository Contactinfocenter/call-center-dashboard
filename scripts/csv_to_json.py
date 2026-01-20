import pandas as pd
import json
import glob
import os

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
# DETAILED CALL LOGS (unchanged – already working)
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

        df = df.replace({pd.NA: None, pd.NaN: None})

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
# DETAILED DROP CALLS – FIXED & ROBUST VERSION
# ────────────────────────────────────────────────

drop_records = {"records": {}}
drop_files = sorted(glob.glob(os.path.join(DROPS_DIR, "*.csv")))

print(f"Found {len(drop_files)} drop CSV files")

for file in drop_files:
    fname = os.path.basename(file)
    print(f"Processing drop file: {fname}")

    try:
        # Read as raw text first for debug
        with open(file, 'r', encoding='utf-8', errors='replace') as f:
            raw_lines = f.readlines()
        print(f"  Raw lines count: {len(raw_lines)}")
        if raw_lines:
            print(f"  First 3 raw lines:\n{''.join(raw_lines[:3])}")

        # Use read_table with regex separator (handles multiple spaces)
        df = pd.read_table(
            file,
            sep=r'\s{2,}|\t',  # two or more spaces or tab
            header=None,
            engine='python',
            on_bad_lines='skip',
            encoding='utf-8',
            encoding_errors='replace'
        )

        if len(df.columns) < 5:
            print(f"  Warning: Only {len(df.columns)} columns detected - trying fallback")
            # Fallback: split each line manually
            data = []
            for line in raw_lines:
                parts = line.strip().split()
                if len(parts) >= 5:
                    # Last column is phone, join previous if needed
                    phone = parts[-1]
                    status = parts[-2]
                    time = parts[-3]
                    date = parts[-2]
                    campaign = ' '.join(parts[:-4])
                    data.append([campaign, date, time, status, phone])
            df = pd.DataFrame(data, columns=['campaign_name', 'date', 'time', 'status', 'phone_number'])
            print(f"  Fallback parsing gave {len(df)} rows")

        else:
            df = df.iloc[:, :5]
            df.columns = ['campaign_name', 'date', 'time', 'status', 'phone_number']

        print(f"  Parsed rows: {len(df)}")
        if len(df) > 0:
            print(f"  First 3 parsed rows:\n{df.head(3).to_string(index=False)}")

        # Combine date + time - lenient
        df['datetime_str'] = df['date'] + ' ' + df['time']
        df['datetime'] = pd.to_datetime(df['datetime_str'], errors='coerce')

        # Fallback for missing seconds or bad format
        mask = df['datetime'].isna()
        if mask.any():
            print(f"  {mask.sum()} datetime parse failures - trying %H:%M")
            df.loc[mask, 'datetime'] = pd.to_datetime(
                df.loc[mask, 'datetime_str'],
                format='%m/%d/%Y %H:%M',
                errors='coerce'
            )

        invalid = df['datetime'].isna().sum()
        if invalid > 0:
            print(f"  Final dropped {invalid} invalid datetimes")
            df = df.dropna(subset=['datetime'])

        if len(df) == 0:
            print(f"  No valid rows after cleaning - skipping {fname}")
            continue

        df['date'] = df['datetime'].dt.strftime("%Y-%m-%d")

        for _, row in df.iterrows():
            date_str = row["date"]
            if date_str not in drop_records["records"]:
                drop_records["records"][date_str] = {}

            phone = int(row["phone_number"]) if pd.notna(row["phone_number"]) else None
            timestamp_ms = int(row["datetime"].timestamp() * 1000) if pd.notna(row["datetime"]) else 0
            key = f"{phone}_{timestamp_ms}"

            entry = {
                "datetime": row["datetime"].isoformat() if pd.notna(row["datetime"]) else None,
                "phone_number": phone,
                "status": row["status"],
                "campaign_name": row["campaign_name"],
                "date": row["date"],
                "time": row["time"]
            }

            drop_records["records"][date_str][key] = entry

        print(f"  Successfully added {len(df)} drop records from {fname}")

    except Exception as e:
        print(f"Critical error processing {fname}: {str(e)}")

with open(OUTPUT_DROPS, "w", encoding="utf-8") as f:
    json.dump(drop_records, f, indent=2, ensure_ascii=False)

print(f"Saved detailed drop logs → {OUTPUT_DROPS}")
print(f"Total drop records: {sum(len(day.values()) for day in drop_records['records'].values())}")