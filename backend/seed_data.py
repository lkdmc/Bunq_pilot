"""
Seed 12 months of realistic Dutch spending data directly via webhook.
Run from backend/: python seed_data.py
"""
import random
import requests
from datetime import datetime

WEBHOOK_URL = "http://127.0.0.1:8000/webhook"

# Starting balance (will decrement as payments are sent)
balance = 25000.0
tx_counter = 1

# ── Transaction templates ─────────────────────────────

MONTHLY_FIXED = [
    # (counterparty, description_prefix, amount, day_of_month)
    ("Vesteda",            "Vesteda Huur",                    950.00,  1),
    ("Zilveren Kruis",     "Zilveren Kruis Zorgverzekering",  138.50,  3),
    ("KPN",                "KPN Thuis Internet",               49.00,  5),
    ("Netflix",            "Netflix Abonnement",               15.99, 14),
    ("Spotify",            "Spotify Premium",                  10.99, 15),
    ("Ziggo",              "Ziggo Televisie en Internet",      37.50, 27),
    ("DUO",                "DUO Studielening Aflossing",      109.00, 28),
]

MONTHLY_VARIABLE = [
    # (counterparty, description_prefix, min, max, day_of_month)
    ("Vattenfall",  "Vattenfall Energie Voorschot",  80, 145,  6),
    ("Vitens",      "Vitens Waterrekening",           18,  38, 11),
]

GROCERIES = [
    ("Albert Heijn",  "Albert Heijn"),
    ("Jumbo",         "Jumbo Supermarkt"),
    ("Lidl",          "Lidl Nederland"),
    ("DekaMarkt",     "DekaMarkt Supermarkt"),
    ("Aldi",          "Aldi Nederland"),
]

OCCASIONAL = [
    # (counterparty, description, min, max)
    ("Restaurant De Kas",  "Restaurant De Kas",       35,  90),
    ("Cafe de Jaren",      "Cafe de Jaren Amsterdam", 15,  45),
    ("Pathé",              "Pathe Cinema Rotterdam",  12,  25),
    ("Zalando",            "Zalando",                 45, 150),
    ("Coolblue",           "Coolblue",                80, 300),
    ("Decathlon",          "Decathlon Rotterdam",     25, 120),
    ("Rituals",            "Rituals Cosmetics",       20,  65),
    ("Bol.com",            "Bol.com",                 15,  80),
    ("H&M",                "H&M",                     20,  70),
    ("IKEA",               "IKEA Rotterdam",          40, 200),
    ("Kruidvat",           "Kruidvat",                10,  35),
    ("Action",             "Action",                  10,  40),
]

# (counterparty, description, amount, months_it_occurs)
PERIODIC = [
    ("RDW",                "RDW Motorrijtuigenbelasting",        156.00, [1, 4, 7, 10]),
    ("Waterschap",         "Waterschap Hollandse Delta",          47.00, [2, 5]),
    ("Gemeente Rotterdam", "Gemeente Rotterdam Gemeentebelasting", 89.00, [2]),
    ("Belastingdienst",    "Belastingdienst Inkomstenbelasting",  312.00, [3]),
    ("Centraal Beheer",    "Centraal Beheer Autoverzekering",      43.20, [1, 4, 7, 10]),
    ("Amazon Prime",       "Amazon Prime",                          2.99, [1,2,3,4,5,6,7,8,9,10,11,12]),
    ("Adobe",              "Adobe Creative Cloud",                 54.99, [1, 7]),
]

# ── Helper ────────────────────────────────────────────

def send(date: datetime, counterparty: str, description: str, amount: float):
    global balance, tx_counter
    balance -= amount
    payload = {
        "NotificationUrl": {
            "event_type": "PAYMENT_CREATED",
            "object": {
                "Payment": {
                    "id": f"seed-{tx_counter:04d}",
                    "created": date.strftime("%Y-%m-%d %H:%M:%S"),
                    "amount": {"value": f"-{amount:.2f}", "currency": "EUR"},
                    "balance_after_mutation": {"value": f"{balance:.2f}", "currency": "EUR"},
                    "description": f"{description} {date.strftime('%d-%m-%Y')}",
                    "counterparty_alias": {"display_name": counterparty},
                }
            }
        }
    }
    resp = requests.post(WEBHOOK_URL, json=payload)
    status = "✓" if resp.status_code == 200 else f"✗ {resp.text[:60]}"
    print(f"  {status}  {date.strftime('%Y-%m-%d')}  {counterparty:<26} €{amount:.2f}")
    tx_counter += 1

# ── Generate a month ──────────────────────────────────

def generate_month(year: int, month: int):
    print(f"\n=== {datetime(year, month, 1).strftime('%B %Y')} ===")
    txs = []

    # Fixed monthly
    for counterparty, desc, amount, day in MONTHLY_FIXED:
        d = datetime(year, month, min(day, 28))
        txs.append((d, counterparty, desc, amount))

    # Variable monthly
    for counterparty, desc, lo, hi, day in MONTHLY_VARIABLE:
        d = datetime(year, month, min(day, 28))
        txs.append((d, counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Groceries: 4 trips per month on random days
    days = sorted(random.sample(range(1, 29), 4))
    for day in days:
        name, desc = random.choice(GROCERIES)
        txs.append((datetime(year, month, day), name, desc, round(random.uniform(28, 115), 2)))

    # Occasional: 1-3 per month
    for counterparty, desc, lo, hi in random.sample(OCCASIONAL, random.randint(1, 3)):
        txs.append((datetime(year, month, random.randint(1, 28)), counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Periodic (quarterly / annual)
    for counterparty, desc, amount, months in PERIODIC:
        if month in months:
            txs.append((datetime(year, month, 15), counterparty, desc, amount))

    # Sort by date and send
    for t in sorted(txs, key=lambda x: x[0]):
        send(*t)

# ── Main ──────────────────────────────────────────────

if __name__ == "__main__":
    random.seed(42)
    print("Seeding 12 months of spending data (Jan–Dec 2025)...")

    for month in range(1, 13):
        generate_month(2025, month)

    print(f"\n=== Done! {tx_counter - 1} transactions seeded | Final balance: €{balance:.2f} ===")
