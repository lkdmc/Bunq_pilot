"""
Send 30 test transactions to bunq sandbox.
Run: python send_transactions.py
"""

import json
import os
import base64
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

SESSION_TOKEN = os.getenv("BUNQ_SESSION_TOKEN", "")
USER_ID = os.getenv("BUNQ_USER_ID", "")
MONETARY_ACCOUNT_ID = os.getenv("BUNQ_MONETARY_ACCOUNT_ID", "")
PRIVATE_KEY_PATH = os.getenv("BUNQ_PRIVATE_KEY_PATH", "private.pem")
BASE_URL = "https://public-api.sandbox.bunq.com/v1"

# ── Load private key ──────────────────────────────────
with open(PRIVATE_KEY_PATH, "rb") as f:
    private_key_pem = f.read().decode("utf-8")

private_key = serialization.load_pem_private_key(
    private_key_pem.encode(), password=None, backend=default_backend()
)

# ── Sign only the body (bunq official method) ─────────
def sign_data(data: str) -> str:
    encoded_data = data.encode("utf-8")
    signature = private_key.sign(encoded_data, padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("utf-8")

# ── Send payment ──────────────────────────────────────
def send_payment(req_id, amount, description):
    url = f"{BASE_URL}/user/{USER_ID}/monetary-account/{MONETARY_ACCOUNT_ID}/payment"

    # Must use separators=(',', ':') for exact JSON match
    payload = json.dumps({
        "amount": {"value": str(amount), "currency": "EUR"},
        "counterparty_alias": {
            "type": "EMAIL",
            "value": "sugardaddy@bunq.com",
            "name": "Sugar Daddy"
        },
        "description": description
    }, separators=(',', ':'))

    signature = sign_data(payload)

    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "hackathon",
        "X-Bunq-Language": "en_US",
        "X-Bunq-Region": "nl_NL",
        "X-Bunq-Geolocation": "0 0 0 0 000",
        "X-Bunq-Client-Request-Id": req_id,
        "X-Bunq-Client-Authentication": SESSION_TOKEN,
        "X-Bunq-Client-Signature": signature,
    }

    response = requests.post(url, headers=headers, data=payload)

    if response.status_code == 200:
        print(f"  ✓ {req_id}: {description} (€{amount})")
    else:
        print(f"  ✗ {req_id}: FAILED — {response.text[:120]}")

# ── Transactions ──────────────────────────────────────
TRANSACTIONS = [
    ("req-001", "950.00", "Vesteda Huur 01-01-2026"),
    ("req-002", "134.00", "Vattenfall Energie 05-01-2026"),
    ("req-003", "89.99",  "Albert Heijn 08-01-2026"),
    ("req-004", "22.80",  "Evides Waterbedrijf 10-01-2026"),
    ("req-005", "312.00", "Belastingdienst Inkomstenbelasting 15-01-2026"),
    ("req-006", "128.50", "Zilveren Kruis Zorgverzekering 18-01-2026"),
    ("req-007", "45.00",  "Jumbo Supermarkt 22-01-2026"),
    ("req-008", "49.00",  "KPN Thuis Internet 28-01-2026"),
    ("req-009", "950.00", "Vesteda Huur 01-02-2026"),
    ("req-010", "98.50",  "Eneco Maandfactuur 03-02-2026"),
    ("req-011", "67.80",  "Zalando 07-02-2026"),
    ("req-012", "89.00",  "Gemeente Rotterdam Gemeentebelasting 10-02-2026"),
    ("req-013", "13.50",  "Pathe Cinema Rotterdam 14-02-2026"),
    ("req-014", "142.00", "Menzis Zorgpremie 18-02-2026"),
    ("req-015", "33.00",  "Aldi Nederland 24-02-2026"),
    ("req-016", "37.50",  "Ziggo Televisie en Internet 27-02-2026"),
    ("req-017", "950.00", "Vesteda Huur 01-03-2026"),
    ("req-018", "19.40",  "Vitens Waterrekening 04-03-2026"),
    ("req-019", "245.00", "Coolblue 08-03-2026"),
    ("req-020", "156.00", "RDW Motorrijtuigenbelasting 12-03-2026"),
    ("req-021", "52.00",  "Restaurant De Kas 15-03-2026"),
    ("req-022", "43.20",  "Centraal Beheer Autoverzekering 18-03-2026"),
    ("req-023", "21.60",  "DekaMarkt Supermarkt 22-03-2026"),
    ("req-024", "109.00", "DUO Studielening Aflossing 28-03-2026"),
    ("req-025", "950.00", "Vesteda Huur 01-04-2026"),
    ("req-026", "134.00", "Vattenfall Energie Voorschot 03-04-2026"),
    ("req-027", "175.00", "Decathlon Rotterdam 07-04-2026"),
    ("req-028", "47.00",  "Waterschap Hollandse Delta 11-04-2026"),
    ("req-029", "28.50",  "Cafe de Jaren Amsterdam 16-04-2026"),
    ("req-030", "59.99",  "Rituals Cosmetics 22-04-2026"),
]

if __name__ == "__main__":
    months = {"01": "January", "02": "February", "03": "March", "04": "April"}
    current_month = None

    for req_id, amount, description in TRANSACTIONS:
        month = description[-7:-5]
        if months.get(month) != current_month:
            current_month = months.get(month, "")
            print(f"\n=== {current_month} 2026 ===")
        send_payment(req_id, amount, description)

    print("\n=== Done! ===")
