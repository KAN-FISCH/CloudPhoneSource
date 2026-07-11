
import sqlite3
import os

db_path = r'c:\Users\shield\Documents\backend-ws-scracpy_frontend - Copy - Copy\frontend\webapp.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Deleting all data from subscriptions...")
    cursor.execute("DELETE FROM subscriptions")
    
    print("Deleting all data from transactions...")
    cursor.execute("DELETE FROM transactions")

    # Check if redemption_codes exists before deleting
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='redemption_codes';")
    if cursor.fetchone():
        print("Deleting all data from redemption_codes...")
        cursor.execute("DELETE FROM redemption_codes")
    
    conn.commit()
    print("All device/transaction data cleared successfully.")
    conn.close()

except Exception as e:
    print(f"Error: {e}")
