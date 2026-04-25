"""
Seed 2 years of realistic Dutch spending data directly via webhook.
Run from backend/: python seed_data.py
"""
import random
import requests
from datetime import datetime

WEBHOOK_URL = "http://127.0.0.1:8000/webhook"

balance = 25000.0
tx_counter = 1

MONTHLY_FIXED = [
    ("Vesteda",        "Vesteda Huur",                   950.00,  1),
    ("Zilveren Kruis", "Zilveren Kruis Zorgverzekering", 138.50,  3),
    ("KPN",            "KPN Thuis Internet",              49.00,  5),
    ("Netflix",        "Netflix Abonnement",              15.99, 14),
    ("Spotify",        "Spotify Premium",                 10.99, 15),
    ("Ziggo",          "Ziggo Televisie en Internet",     37.50, 27),
    ("DUO",            "DUO Studielening Aflossing",     109.00, 28),
    ("Amazon Prime",   "Amazon Prime",                     2.99, 20),
    ("Apple",          "Apple iCloud+",                    0.99, 12),
    ("Basic Fit",      "Basic Fit Abonnement",            19.99,  8),
]

MONTHLY_VARIABLE = [
    ("Vattenfall", "Vattenfall Energie Voorschot", 80, 150,  6),
    ("Vitens",     "Vitens Waterrekening",          18,  42, 11),
]

GROCERIES = [
    ("Albert Heijn", "Albert Heijn"),
    ("Jumbo",        "Jumbo Supermarkt"),
    ("Lidl",         "Lidl Nederland"),
    ("DekaMarkt",    "DekaMarkt Supermarkt"),
    ("Aldi",         "Aldi Nederland"),
    ("Plus",         "Plus Supermarkt"),
]

DINING = [
    ("Restaurant De Kas", "Restaurant De Kas",        35,  95),
    ("Cafe de Jaren",     "Cafe de Jaren Amsterdam",  15,  50),
    ("Pathe",             "Pathe Cinema Rotterdam",   12,  28),
    ("McDonalds",         "McDonalds Rotterdam",       8,  22),
    ("Thuisbezorgd",      "Thuisbezorgd.nl",          18,  55),
    ("Uber Eats",         "Uber Eats",                15,  45),
    ("Starbucks",         "Starbucks",                 5,  15),
    ("Sushi Yuki",        "Sushi Yuki Rotterdam",     25,  65),
    ("Vapiano",           "Vapiano",                  14,  30),
    ("Subway",            "Subway",                    6,  14),
]

SHOPPING = [
    ("Zalando",    "Zalando",             45, 160),
    ("Coolblue",   "Coolblue",            80, 350),
    ("Decathlon",  "Decathlon Rotterdam", 25, 130),
    ("Rituals",    "Rituals Cosmetics",   20,  70),
    ("Bol.com",    "Bol.com",             15,  90),
    ("H&M",        "H&M",                20,  75),
    ("IKEA",       "IKEA Rotterdam",      40, 220),
    ("Kruidvat",   "Kruidvat",           10,  38),
    ("Action",     "Action",             10,  45),
    ("Zara",       "Zara",               30, 120),
    ("MediaMarkt", "MediaMarkt",         30, 400),
    ("Hema",       "Hema",                8,  45),
    ("Primark",    "Primark",            15,  60),
]

TRANSPORT = [
    ("NS",       "NS Reizen",         10,  80),
    ("OV-chip",  "OV-chipkaart",       5,  30),
    ("Uber",     "Uber",               8,  35),
    ("Shell",    "Shell Tankstation", 60, 110),
    ("BP",       "BP Tankstation",    55, 105),
    ("Parking",  "Q-Park Rotterdam",   3,  20),
]

PERIODIC = [
    ("RDW",                "RDW Motorrijtuigenbelasting",         156.00, [1, 4, 7, 10]),
    ("Waterschap",         "Waterschap Hollandse Delta",           47.00, [2, 5, 8, 11]),
    ("Gemeente Rotterdam", "Gemeente Rotterdam Gemeentebelasting",  89.00, [2]),
    ("Belastingdienst",    "Belastingdienst Inkomstenbelasting",  312.00, [3]),
    ("Centraal Beheer",    "Centraal Beheer Autoverzekering",      43.20, [1, 4, 7, 10]),
    ("Adobe",              "Adobe Creative Cloud",                  54.99, [1, 7]),
    ("LinkedIn",           "LinkedIn Premium",                      39.99, [1, 7]),
]

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
    print(f"  {status}  {date.strftime('%Y-%m-%d')}  {counterparty:<28} €{amount:.2f}")
    tx_counter += 1

def generate_month(year: int, month: int):
    print(f"\n=== {datetime(year, month, 1).strftime('%B %Y')} ===")
    txs = []

    for counterparty, desc, amount, day in MONTHLY_FIXED:
        txs.append((datetime(year, month, min(day, 28)), counterparty, desc, amount))

    for counterparty, desc, lo, hi, day in MONTHLY_VARIABLE:
        txs.append((datetime(year, month, min(day, 28)), counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Groceries: 4-6 trips
    for day in sorted(random.sample(range(1, 29), random.randint(4, 6))):
        name, desc = random.choice(GROCERIES)
        txs.append((datetime(year, month, day), name, desc, round(random.uniform(25, 120), 2)))

    # Dining: 2-4 per month
    for counterparty, desc, lo, hi in random.sample(DINING, random.randint(2, 4)):
        txs.append((datetime(year, month, random.randint(1, 28)), counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Shopping: 1-3 per month
    for counterparty, desc, lo, hi in random.sample(SHOPPING, random.randint(1, 3)):
        txs.append((datetime(year, month, random.randint(1, 28)), counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Transport: 1-3 per month
    for counterparty, desc, lo, hi in random.sample(TRANSPORT, random.randint(1, 3)):
        txs.append((datetime(year, month, random.randint(1, 28)), counterparty, desc, round(random.uniform(lo, hi), 2)))

    # Periodic
    for counterparty, desc, amount, months in PERIODIC:
        if month in months:
            txs.append((datetime(year, month, 15), counterparty, desc, amount))

    for t in sorted(txs, key=lambda x: x[0]):
        send(*t)

if __name__ == "__main__":
    random.seed(42)
    print("Seeding 2 years of spending data (Jan 2024 – Dec 2025)...")
    for year in [2024, 2025]:
        for month in range(1, 13):
            generate_month(year, month)
    print(f"\n=== Done! {tx_counter - 1} transactions seeded | Final balance: €{balance:.2f} ===")
