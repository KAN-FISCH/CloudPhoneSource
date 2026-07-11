
import requests
import json
import sys

# Configuration from main.go
PAKASIR_URL = "https://app.pakasir.com/api/paymentsimulation"
PROJECT_SLUG = "pt-nusantara-cloudphone"
API_KEY = "JWaDMBbzJsASS4ldM6vkCMBtobkZ1FI7"

def simulate_payment(order_id, amount):
    payload = {
        "project": PROJECT_SLUG,
        "order_id": order_id,
        "amount": int(amount),
        "api_key": API_KEY
    }

    print(f"Simulating payment for Order ID: {order_id}, Amount: {amount}")
    print(f"URL: {PAKASIR_URL}")
    print(f"Payload: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(PAKASIR_URL, json=payload, headers={'Content-Type': 'application/json'})
        
        print(f"\nResponse Code: {response.status_code}")
        print(f"Response Body: {response.text}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python simulate_payment.py <ORDER_ID> [AMOUNT]")
        print("Example: python simulate_payment.py SANDBOX-INV-1769659887-57280374 501")
        
        # Default fallback for quick testing if no args provided
        # Use the ID from user request if present
        target_order = "SANDBOX-INV-1769659887-57280374"
        simulate_payment(target_order, 501)
    else:
        order_id = sys.argv[1]
        amount = 501
        if len(sys.argv) > 2:
            amount = sys.argv[2]
        simulate_payment(order_id, amount)
