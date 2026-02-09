import os
import pandas as pd

# Path to your data folder
DATA_FOLDER = r"C:\Users\Gayatri\OneDrive\Desktop\DV CRIME\data"

def scan_data_folder(folder_path):
    print(f"\n📁 Scanning folder: {folder_path}\n")

    for file in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file)

        # Skip non-files
        if not os.path.isfile(file_path):
            continue

        print("=" * 60)
        print(f"📄 File: {file}")

        try:
            # -------- CSV FILES --------
            if file.lower().endswith(".csv"):
                df = pd.read_csv(file_path)

                print("📑 Type: CSV")
                print(f"🔢 Rows: {df.shape[0]}, Columns: {df.shape[1]}")
                print("🧾 Column Names:")
                for col in df.columns:
                    print(f"   - {col}")

            # -------- EXCEL FILES --------
            elif file.lower().endswith((".xlsx", ".xls")):
                xls = pd.ExcelFile(file_path)

                print("📑 Type: Excel")
                print(f"📘 Sheets found: {len(xls.sheet_names)}")

                for sheet in xls.sheet_names:
                    df = pd.read_excel(xls, sheet_name=sheet)

                    print(f"\n➡ Sheet Name: {sheet}")
                    print(f"🔢 Rows: {df.shape[0]}, Columns: {df.shape[1]}")
                    print("🧾 Column Names:")
                    for col in df.columns:
                        print(f"   - {col}")

            else:
                print("⚠ Unsupported file format")

        except Exception as e:
            print(f"❌ Error reading file: {e}")

    print("\n✅ Folder scan complete.")

# Run the scanner
scan_data_folder(DATA_FOLDER)
