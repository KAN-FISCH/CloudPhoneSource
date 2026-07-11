
import requests
import json

NODE_URL = "http://localhost:8000"

try:
    print("Fetching inventory...")
    # 1. Get Inventory
    r = requests.get(f"{NODE_URL}/api/devices-available")
    if r.status_code != 200:
        print(f"Failed to get inventory: {r.status_code}")
        exit(1)
        
    data = r.json()
    devices = data.get("devices", [])
    print(f"Found {len(devices)} total devices.")
    
    # 2. Iterate and Cleanup 'busy' devices
    cleaned_count = 0
    for dev in devices:
        udid = dev.get("udid")
        status = dev.get("status")
        
        print(f"Device {udid}: {status}")
        
        # We cleanup ALL busy devices because we wiped the DB
        if status == 'busy':
            print(f"  -> releasing {udid}...")
            cleanup_payload = {"udid": udid}
            c_r = requests.post(f"{NODE_URL}/api/cleanup", json=cleanup_payload)
            if c_r.status_code == 200:
                print("     Success.")
                cleaned_count += 1
            else:
                print(f"     Failed: {c_r.text}")

    print(f"\nDone. Released {cleaned_count} devices.")
    
except Exception as e:
    print(f"Error: {e}")
