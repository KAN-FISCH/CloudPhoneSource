
import sqlite3
import os
import datetime

db_path = r'c:\Users\shield\Documents\backend-ws-scracpy_frontend - Copy - Copy\frontend\webapp.db'
order_id = "SANDBOX-INV-1769659323-94945788"

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Attempting to fix Order ID: {order_id}")

    # 1. Update Transaction to Success (if not already)
    cursor.execute("UPDATE transactions SET status = 'success' WHERE order_id = ?", (order_id,))
    if cursor.rowcount > 0:
        print(f"Transaction status updated to 'success'. Rows: {cursor.rowcount}")
    else:
        print("Transaction not found or already success.")

    # 2. Reactivate Subscription and Extend
    # Calculate new expiry (Now + 7 Days in UTC)
    new_expiry = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S+00:00")
    
    cursor.execute("""
        UPDATE subscriptions 
        SET active = 1, expires_at = ? 
        WHERE order_id = ?
    """, (new_expiry, order_id))
    
    if cursor.rowcount > 0:
        print(f"Subscription reactivated and extended to {new_expiry}. Rows: {cursor.rowcount}")
    else:
        print("Subscription not found for this Order ID.")

    conn.commit()
    conn.close()
    print("Fix applied successfully.")

except Exception as e:
    print(f"Error: {e}")
