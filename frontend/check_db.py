
import sqlite3
import os

db_path = r'c:\Users\shield\Documents\backend-ws-scracpy_frontend - Copy - Copy\frontend\webapp.db'

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # List tables
    print("--- Tables ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    for table in tables:
        print(table[0])
        
    # Check subscriptions (devices)
    if ('subscriptions',) in tables:
        print("\n--- Subscriptions (Devices) ---")
        cursor.execute("SELECT id, user_id, device_udid, active, expires_at FROM subscriptions")
        rows = cursor.fetchall()
        if not rows:
            print("No subscriptions found.")
        else:
            print(f"{'ID':<5} {'UserID':<10} {'DeviceUDID':<20} {'Active':<10} {'ExpiresAt'}")
            print("-" * 60)
            for row in rows:
                print(f"{str(row[0]):<5} {str(row[1]):<10} {str(row[2]):<20} {str(row[3]):<10} {str(row[4])}")

    # Check transactions just in case
    if ('transactions',) in tables:
        print("\n--- Transactions ---")
        cursor.execute("SELECT id, order_id, status, is_allocated FROM transactions ORDER BY id DESC LIMIT 5")
        rows = cursor.fetchall()
        for row in rows:
            print(row)

    conn.close()

except Exception as e:
    print(f"Error: {e}")
