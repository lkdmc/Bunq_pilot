import sqlite3
import json
import os
import re
import calendar
from datetime import datetime
from collections import deque
import base64
from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Tuple, Optional
import anthropic
from dotenv import load_dotenv, find_dotenv
from bunq_client import get_recent_transactions, get_balance as get_balance_from_sdk

load_dotenv(find_dotenv())

# ── Diagnostic ────────────────────────────────────────
_key = os.getenv("ANTHROPIC_API_KEY", "")
print(f"[startup] ANTHROPIC_API_KEY: '{_key[:18]}...{_key[-4:]}' (len={len(_key)})")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

FINN_SYSTEM_PROMPT = (
    "You are bunq's personal AI financial assistant, 'Finn'. "
    "You are a trendy and smart financial manager for the younger generation. "
    "Analyze the user's transaction history to answer their questions. "
    "Avoid long, boring explanations. Provide short, clear, fact-based practical saving tips "
    "(maximum 3 sentences) that hit the nail on the head. Use emojis appropriately."
)

log_buffer = deque(maxlen=100)

def log(msg: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    log_buffer.append(entry)
    print(entry)

# ── DB Init ───────────────────────────────────────────
def init_db():
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT,
            amount REAL,
            currency TEXT,
            description TEXT,
            counterparty TEXT,
            category TEXT,
            year INTEGER,
            month INTEGER
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS account_balance (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            balance REAL,
            currency TEXT,
            updated_at TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS receipt_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT,
            name TEXT,
            category TEXT,
            subcategory TEXT,
            amount REAL
        )
    """)
    conn.commit()
    conn.close()
    log("Database initialized.")

def get_stored_balance() -> Optional[dict]:
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("SELECT balance, currency, updated_at FROM account_balance WHERE id = 1")
    row = c.fetchone()
    conn.close()
    if row:
        return {"balance": row[0], "currency": row[1], "updated_at": row[2]}
    return None

def update_stored_balance(balance: float, currency: str):
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        INSERT INTO account_balance (id, balance, currency, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET balance=excluded.balance,
            currency=excluded.currency, updated_at=excluded.updated_at
    """, (balance, currency, datetime.now().isoformat()))
    conn.commit()
    conn.close()

init_db()

# ── Helpers ───────────────────────────────────────────
def parse_date_from_description(description: str, fallback: str) -> str:
    match = re.search(r'(\d{2})-(\d{2})-(\d{4})', description)
    if match:
        day, month, year = match.groups()
        return f"{year}-{month}-{day}"
    return fallback[:10]

def extract_merchant_from_description(description: str) -> str:
    """Strip trailing DD-MM-YYYY date appended by seed_real.py to get merchant name."""
    return re.sub(r'\s+\d{2}-\d{2}-\d{4}\s*$', '', description).strip()

def save_transaction(tx_id, date_str, amount, currency, description, counterparty, category):
    dt = datetime.fromisoformat(date_str[:10])
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        INSERT OR IGNORE INTO transactions
        (id, date, amount, currency, description, counterparty, category, year, month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (tx_id, date_str[:10], amount, currency, description, counterparty, category, dt.year, dt.month))
    conn.commit()
    conn.close()

def get_monthly_summary(year: int, month: int) -> dict:
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        SELECT category, SUM(amount)
        FROM transactions
        WHERE year=? AND month=? AND amount < 0
        GROUP BY category
    """, (year, month))
    rows = c.fetchall()
    conn.close()
    return {row[0]: abs(row[1]) for row in rows}

def generate_report(year: int, month: int) -> str:
    current = get_monthly_summary(year, month)
    if not current:
        return f"No spending data found for {year}-{month:02d}."

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    previous = get_monthly_summary(prev_year, prev_month)

    lines = [f"Monthly Spending Report — {year}/{month:02d}", "=" * 42]
    for category, amount in sorted(current.items(), key=lambda x: -x[1]):
        line = f"  {category:<16} €{amount:>8.2f}"
        if category in previous:
            diff = amount - previous[category]
            if diff > 0.01:
                line += f"  (+€{diff:.2f} vs last month)"
            elif diff < -0.01:
                line += f"  (-€{abs(diff):.2f} vs last month)"
            else:
                line += "  (no change)"
        else:
            line += "  (new this month)"
        lines.append(line)

    total = sum(current.values())
    lines.append("=" * 42)
    lines.append(f"  {'TOTAL':<16} €{total:>8.2f}")
    if not previous:
        lines.append("\n  No previous month data — comparison available next month.")
    return "\n".join(lines)

def get_all_transactions(limit=50):
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        SELECT id, date, counterparty, description, amount, currency, category
        FROM transactions
        ORDER BY date DESC
        LIMIT ?
    """, (limit,))
    rows = c.fetchall()
    conn.close()
    return rows

def get_available_months() -> List[Tuple[int, int]]:
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("SELECT DISTINCT year, month FROM transactions ORDER BY year DESC, month DESC")
    rows = c.fetchall()
    conn.close()
    return rows

# ── Webhook ───────────────────────────────────────────
HANDLED_EVENTS = {"PAYMENT_CREATED", "REQUEST_RESPONSE_CREATED"}

@app.post("/webhook")
async def receive_webhook(request: Request):
    body = await request.json()
    try:
        notification = body.get("NotificationUrl", {})
        event_type = notification.get("event_type", "")

        if event_type and event_type not in HANDLED_EVENTS:
            log(f"Skipping event: {event_type}")
            return {"status": "ok"}

        log(f"Webhook received ({event_type}): {json.dumps(body)[:120]}")
        obj = notification.get("object", {})

        # ── Regular outgoing payment ──────────────────
        if "Payment" in obj:
            payment = obj["Payment"]
            tx_id = str(payment.get("id"))
            created_str = payment.get("created", "")
            amount_obj = payment.get("amount", {})
            amount = float(amount_obj.get("value", 0))
            currency = amount_obj.get("currency", "EUR")
            description = payment.get("description", "")
            counterparty = payment.get("counterparty_alias", {}).get("display_name", "")

            if amount < 0:
                date_str = parse_date_from_description(description, created_str)
                # Real bunq payments go to "Sugar Daddy" sink; merchant is in description
                if counterparty.lower() in ("sugar daddy", ""):
                    merchant = extract_merchant_from_description(description)
                    if merchant:
                        counterparty = merchant
                category = classify(counterparty, description)
                save_transaction(tx_id, date_str, amount, currency, description, counterparty, category)
                log(f"Saved payment: {counterparty} €{amount} [{category}]")
            else:
                log(f"Incoming payment skipped: €{amount} from {counterparty}")

        # ── Accepted payment request (betaalverzoek) ──
        elif "RequestResponse" in obj:
            rr = obj["RequestResponse"]
            if rr.get("status") != "ACCEPTED":
                log(f"Request response skipped (status={rr.get('status')})")
                return {"status": "ok"}

            tx_id = f"rr-{rr.get('id')}"
            created_str = rr.get("created", "")
            amount_obj = rr.get("amount_responded") or rr.get("amount_inquired", {})
            amount = -abs(float(amount_obj.get("value", 0)))
            currency = amount_obj.get("currency", "EUR")
            description = rr.get("description", "Betaalverzoek")
            counterparty = (rr.get("counterparty_alias") or {}).get("display_name", "")

            date_str = parse_date_from_description(description, created_str)
            category = classify(counterparty, description)
            save_transaction(tx_id, date_str, amount, currency, description, counterparty, category)
            log(f"Saved request response: {counterparty} €{amount} [{category}]")

    except Exception as e:
        log(f"ERROR: {e}")
    return {"status": "ok"}

# ── Category classifier ───────────────────────────────
CATEGORY_RULES = [
    ("Housing",      ["vesteda", "huur", "woning", "hypotheek"]),
    ("Insurance",    ["zilveren kruis", "menzis", "centraal beheer", "verzekering", "zorgpremie"]),
    ("Utilities",    ["vattenfall", "eneco", "nuon", "vitens", "evides", "waterschap", "energie", "water"]),
    ("Groceries",    ["albert heijn", "jumbo", "lidl", "aldi", "plus", "dekamarkt", "dirk", "spar", "hoogvliet"]),
    ("Dining",       ["restaurant", "cafe", "pathe", "mcdonalds", "starbucks", "thuisbezorgd", "uber eats", "dominos", "subway", "sushi", "vapiano", "broodje"]),
    ("Transport",    ["ns reizen", "ov-chipkaart", "uber", "bolt", "shell", "bp", "tankstation", "q-park", "parking", "rdw"]),
    ("Streaming",    ["netflix", "spotify", "disney", "videoland", "apple tv", "hbo"]),
    ("Subscriptions",["kpn", "ziggo", "odido", "amazon prime", "apple icloud", "adobe", "linkedin", "basic fit", "gym"]),
    ("Government",   ["belastingdienst", "gemeente", "duo", "cak", "rdw motorrijtuig"]),
    ("Shopping",     ["zalando", "coolblue", "bol.com", "h&m", "zara", "ikea", "primark", "hema", "mediamarkt", "kruidvat", "action", "decathlon", "rituals"]),
    ("Health",       ["apotheek", "huisarts", "tandarts", "fysio", "kruidvat"]),
    ("Friends",      ["thomas", "emma", "liam", "sophie", "noah", "olivia", "lucas", "mia", "betaalverzoek"]),
]

def classify(counterparty: str, description: str) -> str:
    text = (counterparty + " " + description).lower()
    for category, keywords in CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return category
    return "Other"

# ── Live sync from bunq ───────────────────────────────
def sync_from_bunq(limit: int = 20) -> int:
    """Fetch recent payments from bunq SDK and store any new ones in spending.db.
    Returns number of newly inserted transactions."""
    live = get_recent_transactions(limit=limit)
    if not live:
        return 0
    new_count = 0
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    for t in live:
        tx_id = t.get("id")
        if not tx_id:
            continue
        c.execute("SELECT 1 FROM transactions WHERE id = ?", (tx_id,))
        if c.fetchone():
            continue
        try:
            amount = float(t["amount"])
        except (ValueError, TypeError):
            amount = 0.0
        desc = t.get("desc", "")
        counterparty = t.get("merchant", "Unknown")
        if counterparty.lower() in ("sugar daddy", ""):
            counterparty = extract_merchant_from_description(desc) or counterparty
        category = classify(counterparty, desc)
        date_str = t.get("date", datetime.now().strftime("%Y-%m-%d"))
        try:
            dt = datetime.fromisoformat(date_str[:10])
        except ValueError:
            dt = datetime.now()
        c.execute("""
            INSERT OR IGNORE INTO transactions
            (id, date, amount, currency, description, counterparty, category, year, month)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (tx_id, date_str[:10], amount, t.get("currency", "EUR"),
              desc, counterparty, category, dt.year, dt.month))
        if c.rowcount:
            new_count += 1
    conn.commit()
    conn.close()
    if new_count:
        log(f"sync_from_bunq: inserted {new_count} new transactions")
    return new_count

# ── React API ─────────────────────────────────────────
@app.get("/api/balance")
async def api_balance():
    sdk_bal = get_balance_from_sdk()
    if sdk_bal and sdk_bal.get("balance") is not None:
        update_stored_balance(sdk_bal["balance"], sdk_bal.get("currency", "EUR"))
        return sdk_bal
    stored = get_stored_balance()
    if stored:
        return stored
    return {"balance": None, "currency": "EUR", "updated_at": None}

@app.post("/api/transactions/sync")
async def api_sync_transactions():
    """Pull latest transactions from bunq and store in DB."""
    try:
        new_count = sync_from_bunq(limit=50)
        rows = get_all_transactions(limit=20)
        txs = [
            {"id": r[0], "date": r[1], "merchant": r[2], "desc": r[3],
             "amount": str(r[4]), "currency": r[5], "category": r[6]}
            for r in rows
        ]
        return {"synced": new_count, "transactions": txs}
    except Exception as e:
        log(f"sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transactions")
async def api_transactions():
    sync_from_bunq(limit=50)
    rows = get_all_transactions(limit=20)
    if rows:
        return [
            {"id": r[0], "date": r[1], "merchant": r[2], "desc": r[3],
             "amount": str(r[4]), "currency": r[5], "category": r[6]}
            for r in rows
        ]
    return get_recent_transactions()

class MessageInput(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []

class AnalyzeRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    user_preference: Dict[str, Any]

ANALYZE_SYSTEM_PROMPT = """[Role]
You are 'F.R' (Financial Report), a highly personalized AI financial assistant. Your job is to meticulously analyze the user's transaction history and provide friendly, yet professional and actionable financial advice.

[Core Definitions: The Spending/Income Categories]
1. Essential: Expenditures strictly necessary for survival and basic living (e.g., groceries, rice, eggs, transportation, medical bills, utilities).
2. Standard: Everyday expenditures to maintain a reasonable quality of life (e.g., casual dining, daily coffee, light hobbies, snacks).
3. Luxury: Reward-based or excessive expenditures that can be easily controlled or reduced (e.g., alcohol, luxury hotels, fine dining, designer brands, excessive food delivery).
4. Income: Any incoming money, deposits, top-ups, or salary. If the 'amount' is a POSITIVE number, it MUST be classified as Income.

[Task Steps: You MUST follow this Chain of Thought]
Step 1. Check if there are any predefined categories in the 'user_preference'. If a merchant exists in this list, you MUST strictly categorize it according to the user's preference, overriding general knowledge.
Step 2. Iterate through the provided 'transactions' array and accurately classify each item. If the amount is positive (no minus sign), classify it as 'Income'. Otherwise, classify it into either Essential, Standard, or Luxury.
Step 3. Calculate the total amount and percentage for each category. (Keep this calculation internal for your reasoning).
Step 4. Based on the calculated ratios and spending patterns, write a single-line summary and generate actionable advice for the past, present, and future. The tone should be professional, encouraging, and empathetic.

[Rules for Advice]
- past_insight: Highlight the largest spending category or a notable spending habit (e.g., Luxury). (1-2 sentences)
- present_pacing: Evaluate their current spending pace and provide positive encouragement. (1-2 sentences)
- future_action: Suggest a specific "actionable guideline" on what to reduce for the rest of the month. (1-2 sentences)

[Output Format]
You MUST output the response in the strict JSON format below. Do NOT output any conversational text, greetings, or markdown blocks outside of this JSON.
CRITICAL: All generated text MUST be written in English.

{
  "summary_headline": "A one-sentence overall review of this month's spending.",
  "advice": {
    "past_insight": "...",
    "present_pacing": "...",
    "future_action": "..."
  },
  "categorized_items": [
    {
      "date": "YYYY-MM-DD",
      "merchant": "Merchant Name",
      "amount": Number,
      "category": "Essential" | "Standard" | "Luxury" | "Income"
    }
  ]
}"""

@app.post("/api/analyze")
async def analyze_transactions(req: AnalyzeRequest):
    if not anthropic_client:
        raise HTTPException(status_code=500, detail="Anthropic API Key is not configured.")

    user_prompt = f"User Preference: {req.user_preference}\nTransactions: {json.dumps(req.transactions)}"

    try:
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=ANALYZE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )

        text_resp = response.content[0].text.strip()
        if text_resp.startswith("```json"):
            text_resp = text_resp.split("```json")[1]
            if text_resp.endswith("```"):
                text_resp = text_resp[:-3]
        elif text_resp.startswith("```"):
            text_resp = text_resp.split("```")[1]
            if text_resp.endswith("```"):
                text_resp = text_resp[:-3]

        return json.loads(text_resp.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse Claude JSON response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_finn(input_data: MessageInput):
    if not anthropic_client:
        raise HTTPException(status_code=500, detail="Anthropic API Key not configured.")

    rows = get_all_transactions(limit=20)
    if rows:
        transactions_text = "\n".join(
            f"- {r[1]} | {r[2]} ({r[3]}): €{r[4]} {r[5]} [{r[6]}]"
            for r in rows
        )
    else:
        live = get_recent_transactions()
        transactions_text = "\n".join(
            f"- {t['date']} | {t['merchant']} ({t['desc']}): {t['amount']}{t['currency']}"
            for t in live
        )

    context_prompt = (
        f"[User Transaction History]\n{transactions_text}\n\n"
        f"Please refer to the recent transaction history above to answer the user's question. "
        f"Question: {input_data.message}"
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in input_data.history]
    messages.append({"role": "user", "content": context_prompt})

    try:
        response = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=FINN_SYSTEM_PROMPT,
            messages=messages
        )
        return {"response": response.content[0].text}
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=503, detail="Anthropic API key is invalid. Please update ANTHROPIC_API_KEY in .env.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Subscription Detective ────────────────────────────
def detect_subscriptions() -> list:
    from collections import defaultdict

    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("SELECT counterparty, date, amount FROM transactions WHERE amount < 0 ORDER BY counterparty, date")
    rows = c.fetchall()
    conn.close()

    by_counterparty = defaultdict(list)
    for counterparty, date, amount in rows:
        by_counterparty[counterparty].append((datetime.fromisoformat(date), abs(amount)))

    result = []
    for counterparty, payments in by_counterparty.items():
        if len(payments) < 2:
            continue

        dates = [p[0] for p in payments]
        amounts = [p[1] for p in payments]

        # Classify interval: monthly (28-35d) or quarterly (80-100d)
        intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates) - 1)]
        if all(28 <= iv <= 35 for iv in intervals):
            frequency = "monthly"
            annual_multiplier = 12
        elif all(80 <= iv <= 100 for iv in intervals):
            frequency = "quarterly"
            annual_multiplier = 4
        else:
            continue

        # Amount variance within 5%
        avg_amount = sum(amounts) / len(amounts)
        if avg_amount == 0:
            continue
        if max(abs(a - avg_amount) / avg_amount for a in amounts) > 0.05:
            continue

        # Day of month variance within 7 days
        days_of_month = [d.day for d in dates]
        if max(days_of_month) - min(days_of_month) > 7:
            continue

        result.append({
            "counterparty": counterparty,
            "count": len(payments),
            "avg_amount": round(avg_amount, 2),
            "frequency": frequency,
            "annual_cost": round(avg_amount * annual_multiplier, 2),
            "advice": "",
        })

    return sorted(result, key=lambda x: -x["avg_amount"])

@app.post("/api/admin/fix-counterparties")
async def fix_counterparties():
    """One-time migration: fix transactions where counterparty='Sugar Daddy'."""
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("SELECT id, description FROM transactions WHERE counterparty = 'Sugar Daddy'")
    rows = c.fetchall()
    updated = 0
    for tx_id, description in rows:
        merchant = extract_merchant_from_description(description)
        if merchant and merchant != "Sugar Daddy":
            new_category = classify(merchant, description)
            c.execute("UPDATE transactions SET counterparty=?, category=? WHERE id=?",
                      (merchant, new_category, tx_id))
            updated += 1
    conn.commit()
    conn.close()
    log(f"fix-counterparties: updated {updated} records")
    return {"fixed": updated}

# ── Receipt Upload & Report ───────────────────────────────────────────────────

@app.post("/api/transactions/{tx_id}/receipt")
async def upload_receipt(tx_id: str, file: UploadFile = File(...)):
    if not anthropic_client:
        raise HTTPException(status_code=500, detail="Anthropic API Key not configured.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file.")
    media_type = file.content_type or "image/jpeg"
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported.")
    b64_image = base64.b64encode(contents).decode("utf-8")

    prompt = """Analyze this receipt and break down the items. Categorize each item into one of the following main categories:
- Groceries / Supermarket
- Shopping / Clothing & Apparel
- Health & Personal Care
- Entertainment & Tech
- Restaurants / Dining Out
- Other

Then, subcategorize each item into ONE of:
- Essential
- Standard
- Luxury

Format your response as a JSON array of objects, where each object has:
- "name" (string)
- "category" (string)
- "subcategory" (string)
- "amount" (number)

Do not include any other text, just the raw JSON array."""

    try:
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64_image}},
                    {"type": "text", "text": prompt}
                ]
            }]
        )
        text_resp = response.content[0].text.strip()
        if text_resp.startswith("```json"):
            text_resp = text_resp[7:]
        if text_resp.endswith("```"):
            text_resp = text_resp[:-3]

        items = json.loads(text_resp.strip())

        conn = sqlite3.connect("spending.db")
        c = conn.cursor()
        for item in items:
            c.execute(
                "INSERT INTO receipt_items (transaction_id, name, category, subcategory, amount) VALUES (?, ?, ?, ?, ?)",
                (tx_id, item.get("name"), item.get("category"), item.get("subcategory"), item.get("amount"))
            )
        conn.commit()
        conn.close()

        return {"status": "ok", "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/receipts/report")
async def api_receipts_report():
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("SELECT name, category, subcategory, amount FROM receipt_items ORDER BY id DESC LIMIT 50")
    rows = c.fetchall()
    conn.close()

    breakdown_map: Dict[Tuple, float] = {}
    for name, category, subcategory, amount in rows:
        key = (category, subcategory)
        breakdown_map[key] = breakdown_map.get(key, 0) + (amount or 0)

    breakdown = [
        {"category": k[0], "subcategory": k[1], "total": round(v, 2)}
        for k, v in breakdown_map.items()
    ]

    advice = "No receipt data available yet."
    if breakdown and anthropic_client:
        items_text = "\n".join([
            f"- {name} ({category} / {subcategory}): €{amount:.2f}"
            for name, category, subcategory, amount in rows if amount
        ])
        prompt = f"""You are Finn, a smart financial advisor. Look at this recent itemized receipt spending:

{items_text}

Provide 3 short, punchy tips about their subcategory spending (Essential vs Standard vs Luxury) and suggest areas to cut back. Keep it under 4 sentences total. Use emojis."""
        try:
            msg = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            advice = msg.content[0].text.strip()
        except Exception as e:
            log(f"Error getting receipt advice: {e}")

    return {"breakdown": breakdown, "advice": advice}


@app.get("/api/subscriptions")
async def api_subscriptions():
    subs = detect_subscriptions()
    if not subs or not anthropic_client:
        return subs

    subs_text = "\n".join(
        f"{i+1}. {s['counterparty']}: €{s['avg_amount']:.2f} {s['frequency']}"
        for i, s in enumerate(subs)
    )
    prompt = f"""Analyze these recurring bank payments. Reply with exactly {len(subs)} lines, one per payment in the same order.
Each line: one emoji + brief description of what the service likely is (max 8 words).

Payments:
{subs_text}"""

    try:
        message = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        advice_lines = [l.strip() for l in message.content[0].text.strip().split("\n") if l.strip()]
        for i, sub in enumerate(subs):
            sub["advice"] = advice_lines[i] if i < len(advice_lines) else ""
    except Exception:
        pass

    return subs

# ── Predictive Balance ────────────────────────────────
@app.get("/api/predict")
async def api_predict():
    stored = get_stored_balance()
    sdk_bal = None if stored else get_balance_from_sdk()
    balance_info = stored or sdk_bal
    balance = balance_info["balance"] if balance_info and balance_info["balance"] is not None else 0.0
    now = datetime.now()
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_elapsed = now.day
    days_remaining = days_in_month - days_elapsed

    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute(
        "SELECT SUM(amount) FROM transactions WHERE year=? AND month=? AND amount < 0",
        (now.year, now.month)
    )
    current_spend = abs(c.fetchone()[0] or 0)
    conn.close()

    daily_rate = current_spend / days_elapsed if days_elapsed > 0 else 0
    predicted_remaining = daily_rate * days_remaining
    predicted_total = current_spend + predicted_remaining
    predicted_end_balance = balance - predicted_remaining

    finn_summary = ""
    if anthropic_client and current_spend > 0:
        try:
            prompt = f"""You are Finn, a friendly financial assistant. Give a 2-sentence spending forecast.

This month so far: €{current_spend:.2f} in {days_elapsed} days (€{daily_rate:.2f}/day)
Projected month total: €{predicted_total:.2f}
Current balance: €{balance:.2f} → Predicted end balance: €{predicted_end_balance:.2f}

Be direct and use 1-2 emojis."""
            message = anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )
            finn_summary = message.content[0].text.strip()
        except Exception:
            pass

    return {
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "current_spend": round(current_spend, 2),
        "daily_rate": round(daily_rate, 2),
        "predicted_remaining": round(predicted_remaining, 2),
        "predicted_total": round(predicted_total, 2),
        "current_balance": round(balance, 2),
        "balance_available": balance_info is not None,
        "predicted_end_balance": round(predicted_end_balance, 2),
        "finn_summary": finn_summary,
    }

@app.get("/api/monthly-trend")
async def api_monthly_trend():
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        SELECT year, month, SUM(ABS(amount)), category
        FROM transactions
        WHERE amount < 0
        GROUP BY year, month
        ORDER BY year, month
    """)
    # Aggregate by month with category breakdown
    from collections import defaultdict
    monthly: Dict[str, Any] = {}
    conn2 = sqlite3.connect("spending.db")
    c2 = conn2.cursor()
    c2.execute("""
        SELECT year, month, SUM(ABS(amount)) as total
        FROM transactions WHERE amount < 0
        GROUP BY year, month ORDER BY year, month
    """)
    for year, month, total in c2.fetchall():
        key = f"{year}-{month:02d}"
        monthly[key] = {"year": year, "month": month, "total": round(total, 2), "label": datetime(year, month, 1).strftime("%b '%y")}
    c2.execute("""
        SELECT year, month, category, SUM(ABS(amount))
        FROM transactions WHERE amount < 0
        GROUP BY year, month, category
    """)
    for year, month, cat, amt in c2.fetchall():
        key = f"{year}-{month:02d}"
        if key in monthly:
            if "categories" not in monthly[key]:
                monthly[key]["categories"] = {}
            monthly[key]["categories"][cat or "Other"] = round(amt, 2)
    conn.close()
    conn2.close()
    return list(monthly.values())

class BudgetInput(BaseModel):
    amount: float
    year: int
    month: int

@app.post("/api/budget")
async def set_budget(b: BudgetInput):
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS budgets
        (year INTEGER, month INTEGER, amount REAL, PRIMARY KEY (year, month))
    """)
    c.execute("INSERT OR REPLACE INTO budgets (year, month, amount) VALUES (?, ?, ?)",
              (b.year, b.month, b.amount))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.get("/api/budget/{year}/{month}")
async def get_budget(year: int, month: int):
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    try:
        c.execute("SELECT amount FROM budgets WHERE year=? AND month=?", (year, month))
        row = c.fetchone()
    except Exception:
        row = None
    conn.close()
    return {"amount": row[0] if row else None}

# ── Debug dashboard (server-side HTML) ───────────────
@app.get("/", response_class=HTMLResponse)
def dashboard():
    now = datetime.now()
    report = generate_report(now.year, now.month)
    transactions = get_all_transactions()
    available_months = get_available_months()

    tx_rows = ""
    for t in transactions:
        date_, counterparty, desc, amount, currency, category = t
        color = "#ff6b6b" if amount < 0 else "#51cf66"
        tx_rows += f"""
        <tr>
            <td>{date_}</td>
            <td>{counterparty}</td>
            <td>{desc}</td>
            <td style="color:{color}">€{amount:.2f}</td>
            <td><span class="badge">{category}</span></td>
        </tr>"""

    logs_html = "\n".join(reversed(list(log_buffer)))

    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>bunq Spending Tracker — Debug</title>
    <meta http-equiv="refresh" content="5">
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ font-family: 'Courier New', monospace; background: #0d0d0d; color: #e0e0e0; padding: 24px; }}
        h1 {{ color: #00d4aa; font-size: 24px; margin-bottom: 4px; }}
        .subtitle {{ color: #555; font-size: 13px; margin-bottom: 24px; }}
        h2 {{ color: #888; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }}
        .card {{ background: #161616; border: 1px solid #252525; border-radius: 10px; padding: 20px; }}
        pre {{ white-space: pre-wrap; color: #b0ffb0; font-size: 13px; line-height: 1.6; }}
        .log {{ height: 220px; overflow-y: auto; color: #888; font-size: 12px; white-space: pre-wrap; line-height: 1.8; }}
        table {{ width: 100%; border-collapse: collapse; }}
        th {{ padding: 10px 12px; text-align: left; color: #00d4aa; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #252525; }}
        td {{ padding: 10px 12px; border-bottom: 1px solid #1a1a1a; font-size: 13px; }}
        tr:hover td {{ background: #1a1a1a; }}
        .badge {{ background: #0a2a2a; color: #00d4aa; padding: 3px 10px; border-radius: 20px; font-size: 11px; }}
        .dot {{ display: inline-block; width: 8px; height: 8px; background: #00d4aa; border-radius: 50%; margin-right: 6px; animation: pulse 1.5s infinite; }}
        @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} }}
        .month-nav {{ display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }}
        .month-btn {{ background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 4px 12px; border-radius: 4px; font-size: 12px; text-decoration: none; }}
        .month-btn:hover {{ border-color: #00d4aa; color: #00d4aa; }}
    </style>
</head>
<body>
    <h1>bunq Spending Tracker — Debug</h1>
    <p class="subtitle"><span class="dot"></span>Live — auto-refreshes every 5 seconds &nbsp;|&nbsp; React app: <a href="http://localhost:5173" style="color:#00d4aa">localhost:5173</a></p>

    <div class="month-nav">
        <span style="color:#555; font-size:12px; padding: 4px 0;">Jump to report:</span>
        {"".join(
            f'<a class="month-btn" href="/report-page/{y}/{m}">'
            f'{datetime(y, m, 1).strftime("%b %Y")}</a>'
            for y, m in available_months
        ) or '<span style="color:#444; font-size:12px;">No data yet</span>'}
        <a class="month-btn" href="/advice" style="margin-left:12px; border-color:#555;">Advice</a>
    </div>

    <div class="grid">
        <div class="card">
            <h2>{now.strftime("%B %Y")} Report</h2>
            <pre>{report}</pre>
        </div>
        <div class="card">
            <h2>Live Logs</h2>
            <div class="log">{logs_html if logs_html else "Waiting for events..."}</div>
        </div>
    </div>

    <div class="card">
        <h2>Recent Transactions</h2>
        <table>
            <tr><th>Date</th><th>Counterparty</th><th>Description</th><th>Amount</th><th>Category</th></tr>
            {tx_rows if tx_rows else '<tr><td colspan="5" style="color:#444; padding:20px">No transactions yet.</td></tr>'}
        </table>
    </div>
</body>
</html>"""
    return html

@app.get("/report-page/{year}/{month}", response_class=HTMLResponse)
def report_page(year: int, month: int):
    report = generate_report(year, month)
    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Report {year}/{month:02d}</title>
    <style>
        body {{ font-family: monospace; background: #0d0d0d; color: #e0e0e0; padding: 40px; }}
        pre {{ color: #b0ffb0; font-size: 14px; line-height: 1.8; }}
        a {{ color: #00d4aa; }}
    </style>
</head>
<body>
    <a href="/">← Back to dashboard</a><br><br>
    <pre>{report}</pre>
</body>
</html>"""

@app.get("/report/{year}/{month}")
def get_report(year: int, month: int):
    return {"report": generate_report(year, month)}

@app.get("/advice", response_class=HTMLResponse)
def get_advice():
    now = datetime.now()
    summary = get_monthly_summary(now.year, now.month)

    if not summary:
        months = get_available_months()
        if months:
            summary = get_monthly_summary(months[0][0], months[0][1])
            label = datetime(months[0][0], months[0][1], 1).strftime("%B %Y")
        else:
            label = None
    else:
        label = now.strftime("%B %Y")

    if not summary or not anthropic_client:
        advice_html = "<p style='color:#888'>No spending data available yet.</p>"
    else:
        total = sum(summary.values())
        lines = "\n".join(
            f"- {cat}: €{amt:.2f}" for cat, amt in sorted(summary.items(), key=lambda x: -x[1])
        )
        prompt = f"""You are a personal finance advisor. Analyze this month's spending and provide exactly 3 specific, actionable saving tips.

Spending breakdown ({label}):
{lines}
Total: €{total:.2f}

Rules:
- Each tip must reference a specific category from the data above
- Be concrete (mention actual amounts or percentages)
- Format: numbered list, one tip per line, no extra commentary"""

        message = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        log(f"Advice generated for {label}")
        tips = [line.strip() for line in raw.split("\n") if line.strip()]
        advice_html = "\n".join(
            f'<div class="tip"><span class="tip-num">{i+1}</span>'
            f'<span class="tip-text">{tip.lstrip("0123456789. ")}</span></div>'
            for i, tip in enumerate(tips[:3])
        )

    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Spending Advice</title>
    <style>
        body {{ font-family: 'Courier New', monospace; background: #0d0d0d; color: #e0e0e0; padding: 40px; max-width: 700px; }}
        h1 {{ color: #00d4aa; font-size: 22px; margin-bottom: 4px; }}
        .sub {{ color: #555; font-size: 13px; margin-bottom: 32px; }}
        .tip {{ display: flex; gap: 16px; align-items: flex-start; background: #161616; border: 1px solid #252525; border-radius: 10px; padding: 18px 20px; margin-bottom: 14px; }}
        .tip-num {{ color: #00d4aa; font-size: 22px; font-weight: bold; min-width: 24px; }}
        .tip-text {{ color: #ccc; font-size: 14px; line-height: 1.7; }}
        a {{ color: #00d4aa; font-size: 13px; text-decoration: none; }}
    </style>
</head>
<body>
    <h1>Saving Tips</h1>
    <p class="sub">Based on {label or "available"} spending data</p>
    {advice_html}
    <br><a href="/">← Back to dashboard</a>
</body>
</html>"""
