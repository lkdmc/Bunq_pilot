"""
Seed spending data using REAL bunq sandbox API calls.
Each payment goes to sugardaddy@bunq.com — bunq fires a real webhook
back to our server, which saves it to the DB automatically.

Run from backend/: python seed_real.py
Estimated time: ~6 minutes for 500+ transactions (rate limit: 3 req/s)
"""
import random
import time
import sys
import os
from datetime import datetime
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# ── bunq SDK setup ────────────────────────────────────
from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.bunq_context import BunqContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.model.generated.endpoint import PaymentApiObject, RequestInquiryApiObject, MonetaryAccountBankApiObject
from bunq.sdk.model.generated.object_ import AmountObject, PointerObject

def setup():
    api_key = os.getenv("BUNQ_API_KEY")
    if not api_key:
        print("ERROR: BUNQ_API_KEY not set in .env")
        sys.exit(1)
    if os.path.exists("bunq.conf"):
        ctx = ApiContext.restore("bunq.conf")
    else:
        ctx = ApiContext.create(ApiEnvironmentType.SANDBOX, api_key, "Bunq Pilot Seed")
        ctx.save("bunq.conf")
    BunqContext.load_api_context(ctx)
    account_id = BunqContext.user_context().primary_monetary_account.id_

    # Raise daily limit so 500+ payments don't get blocked
    try:
        MonetaryAccountBankApiObject.update(
            monetary_account_bank_id=account_id,
            daily_limit=AmountObject("999999.99", "EUR"),
        )
        print(f"  Daily limit raised to €999,999.99")
    except Exception as e:
        print(f"  Warning: could not raise daily limit: {e}")
    time.sleep(0.5)

    return account_id

SUGAR_DADDY = PointerObject("EMAIL", "sugardaddy@bunq.com", "Sugar Daddy")

tx_counter = 0

def pay(account_id: int, date: datetime, counterparty: str, description: str, amount: float):
    global tx_counter
    full_desc = f"{description} {date.strftime('%d-%m-%Y')}"
    try:
        PaymentApiObject.create(
            amount=AmountObject(f"{amount:.2f}", "EUR"),
            counterparty_alias=SUGAR_DADDY,
            description=full_desc,
            monetary_account_id=account_id,
        )
        tx_counter += 1
        print(f"  ✓  {date.strftime('%Y-%m-%d')}  {counterparty:<28} €{amount:.2f}  [{tx_counter}]")
    except Exception as e:
        print(f"  ✗  {counterparty}: {e}")
    time.sleep(0.35)  # stay under 3 req/s

def request_topup(account_id: int, amount: float):
    """Ask Sugar Daddy for money so we don't run out of balance."""
    try:
        RequestInquiryApiObject.create(
            amount_inquired=AmountObject(f"{amount:.2f}", "EUR"),
            counterparty_alias=SUGAR_DADDY,
            description="Top-up for seed script",
            allow_bunqme=False,
            monetary_account_id=account_id,
        )
        print(f"  💰 Requested €{amount:.2f} top-up from Sugar Daddy")
        time.sleep(1.0)
    except Exception as e:
        print(f"  ⚠ Top-up failed: {e}")

# ── Transaction templates (same as seed_data.py) ──────

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
    ("Albert Heijn", "Albert Heijn"), ("Jumbo", "Jumbo Supermarkt"),
    ("Lidl", "Lidl Nederland"), ("DekaMarkt", "DekaMarkt Supermarkt"),
    ("Aldi", "Aldi Nederland"), ("Plus", "Plus Supermarkt"),
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
]
SHOPPING = [
    ("Zalando", "Zalando", 45, 160), ("Coolblue", "Coolblue", 80, 350),
    ("Decathlon", "Decathlon Rotterdam", 25, 130),
    ("Rituals", "Rituals Cosmetics", 20, 70), ("Bol.com", "Bol.com", 15, 90),
    ("H&M", "H&M", 20, 75), ("IKEA", "IKEA Rotterdam", 40, 220),
    ("Kruidvat", "Kruidvat", 10, 38), ("Action", "Action", 10, 45),
]
TRANSPORT = [
    ("NS", "NS Reizen", 10, 80), ("OV-chip", "OV-chipkaart", 5, 30),
    ("Uber", "Uber", 8, 35), ("Shell", "Shell Tankstation", 60, 110),
    ("BP", "BP Tankstation", 55, 105), ("Q-Park", "Q-Park Rotterdam", 3, 20),
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

def build_month(year: int, month: int):
    txs = []
    for cp, desc, amt, day in MONTHLY_FIXED:
        txs.append((datetime(year, month, min(day, 28)), cp, desc, amt))
    for cp, desc, lo, hi, day in MONTHLY_VARIABLE:
        txs.append((datetime(year, month, min(day, 28)), cp, desc, round(random.uniform(lo, hi), 2)))
    for day in sorted(random.sample(range(1, 29), random.randint(4, 6))):
        name, desc = random.choice(GROCERIES)
        txs.append((datetime(year, month, day), name, desc, round(random.uniform(25, 120), 2)))
    for cp, desc, lo, hi in random.sample(DINING, random.randint(2, 4)):
        txs.append((datetime(year, month, random.randint(1, 28)), cp, desc, round(random.uniform(lo, hi), 2)))
    for cp, desc, lo, hi in random.sample(SHOPPING, random.randint(1, 3)):
        txs.append((datetime(year, month, random.randint(1, 28)), cp, desc, round(random.uniform(lo, hi), 2)))
    for cp, desc, lo, hi in random.sample(TRANSPORT, random.randint(1, 3)):
        txs.append((datetime(year, month, random.randint(1, 28)), cp, desc, round(random.uniform(lo, hi), 2)))
    for cp, desc, amt, months in PERIODIC:
        if month in months:
            txs.append((datetime(year, month, 15), cp, desc, amt))
    return sorted(txs, key=lambda x: x[0])

# ── Main ──────────────────────────────────────────────

if __name__ == "__main__":
    random.seed(42)
    print("Setting up bunq SDK...")
    account_id = setup()
    print(f"Account ID: {account_id}")

    months = [(y, m) for y in [2024, 2025] for m in range(1, 13)]
    months += [(2026, m) for m in range(1, 5)]

    # Calculate total spend to request upfront
    random.seed(42)
    total_spend = sum(
        sum(amt for _, _, _, amt in build_month(y, m))
        for y, m in months
    )
    random.seed(42)  # reset seed for actual run

    print(f"\nTotal spend to seed: €{total_spend:.2f}")
    print("Requesting top-up from Sugar Daddy...")
    # Request in chunks of 9999 (bunq sandbox limit per request)
    remaining = total_spend + 500  # buffer
    while remaining > 0:
        chunk = min(remaining, 9999.0)
        request_topup(account_id, round(chunk, 2))
        remaining -= chunk

    print(f"\nStarting payments — Jan 2024 → Apr 2026")
    print("(~6 min estimated, press Ctrl+C to stop)\n")

    for year, month in months:
        print(f"\n=== {datetime(year, month, 1).strftime('%B %Y')} ===")
        for date, counterparty, description, amount in build_month(year, month):
            pay(account_id, date, counterparty, description, amount)

    print(f"\n=== Done! {tx_counter} payments sent to bunq sandbox ===")
