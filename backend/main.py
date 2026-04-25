import sqlite3
import json
import os
import re
import calendar
from datetime import datetime
from collections import deque
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Tuple, Optional
import anthropic
from dotenv import load_dotenv
from bunq_client import get_recent_transactions, get_balance as get_balance_from_sdk

load_dotenv()

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

def categorize_transaction(description: str, counterparty: str, amount: float) -> str:
    if not anthropic_client:
        return "Other"
    prompt = f"""Classify the following bank transaction into ONE category. Reply with only the category name.

Categories: Food, Entertainment, Subscription, Transport, Shopping, Health, Utilities, Transfer, Other

Transaction description: {description}
Counterparty: {counterparty}
Amount: {amount} EUR

Category:"""
    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=20,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text.strip()

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
        SELECT date, counterparty, description, amount, currency, category
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
@app.post("/webhook")
async def receive_webhook(request: Request):
    body = await request.json()
    try:
        notification = body.get("NotificationUrl", {})
        event_type = notification.get("event_type", "")

        # Deduplicate: only process PAYMENT_CREATED (ignore PAYMENT_RECEIVED etc.)
        if event_type and event_type != "PAYMENT_CREATED":
            log(f"Skipping event: {event_type}")
            return {"status": "ok"}

        log(f"Webhook received: {json.dumps(body)[:150]}")
        obj = notification.get("object", {})
        if "Payment" in obj:
            payment = obj["Payment"]
            tx_id = str(payment.get("id"))
            created_str = payment.get("created", "")
            amount_obj = payment.get("amount", {})
            amount = float(amount_obj.get("value", 0))
            currency = amount_obj.get("currency", "EUR")
            description = payment.get("description", "")
            counterparty = payment.get("counterparty_alias", {}).get("display_name", "")

            # Store balance after mutation if present
            bal_obj = payment.get("balance_after_mutation", {})
            if bal_obj.get("value"):
                update_stored_balance(float(bal_obj["value"]), bal_obj.get("currency", "EUR"))
                log(f"Balance updated: €{bal_obj['value']}")

            if amount < 0:
                date_str = parse_date_from_description(description, created_str)
                log(f"Outgoing payment: {description} | {counterparty} | €{amount} | date: {date_str}")
                category = categorize_transaction(description, counterparty, amount)
                log(f"Category: {category}")
                save_transaction(tx_id, date_str, amount, currency, description, counterparty, category)
                log("Saved to DB.")
            else:
                log(f"Incoming payment skipped: €{amount} from {counterparty}")
    except Exception as e:
        log(f"ERROR: {e}")
    return {"status": "ok"}

# ── React API ─────────────────────────────────────────
@app.get("/api/balance")
async def api_balance():
    stored = get_stored_balance()
    if stored:
        return stored
    sdk_bal = get_balance_from_sdk()
    if sdk_bal:
        return sdk_bal
    return {"balance": None, "currency": "EUR", "updated_at": None}

@app.get("/api/transactions")
async def api_transactions():
    rows = get_all_transactions(limit=20)
    if rows:
        return [
            {"date": r[0], "merchant": r[1], "desc": r[2],
             "amount": str(r[3]), "currency": r[4], "category": r[5]}
            for r in rows
        ]
    return get_recent_transactions()

class MessageInput(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []

@app.post("/api/chat")
async def chat_with_finn(input_data: MessageInput):
    if not anthropic_client:
        raise HTTPException(status_code=500, detail="Anthropic API Key not configured.")

    rows = get_all_transactions(limit=20)
    if rows:
        transactions_text = "\n".join(
            f"- {r[0]} | {r[1]} ({r[2]}): €{r[3]} {r[4]} [{r[5]}]"
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Subscription Detective ────────────────────────────
def detect_subscriptions() -> list:
    conn = sqlite3.connect("spending.db")
    c = conn.cursor()
    c.execute("""
        SELECT counterparty, COUNT(*) as cnt, AVG(amount) as avg_amt,
               MIN(date) as first_date, MAX(date) as last_date
        FROM transactions
        WHERE amount < 0
        GROUP BY counterparty
        HAVING cnt >= 2
        ORDER BY avg_amt ASC
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for counterparty, cnt, avg_amt, first_date, last_date in rows:
        d1 = datetime.fromisoformat(first_date)
        d2 = datetime.fromisoformat(last_date)
        span_days = (d2 - d1).days
        days_between = span_days / (cnt - 1) if cnt > 1 else 30

        if days_between <= 10:
            frequency = "weekly"
        elif days_between <= 35:
            frequency = "monthly"
        elif days_between <= 100:
            frequency = "quarterly"
        else:
            frequency = "yearly"

        annual_cost = abs(avg_amt) * (365 / max(days_between, 1))
        result.append({
            "counterparty": counterparty,
            "count": cnt,
            "avg_amount": round(abs(avg_amt), 2),
            "frequency": frequency,
            "days_between": round(days_between),
            "annual_cost": round(annual_cost, 2),
            "advice": "",
        })
    return result

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

    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    advice_lines = [l.strip() for l in message.content[0].text.strip().split("\n") if l.strip()]
    for i, sub in enumerate(subs):
        sub["advice"] = advice_lines[i] if i < len(advice_lines) else ""

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
    c.execute(
        "SELECT category, SUM(amount) FROM transactions WHERE year=? AND month=? AND amount < 0 GROUP BY category",
        (now.year, now.month)
    )
    category_breakdown = {row[0]: round(abs(row[1]), 2) for row in c.fetchall()}
    conn.close()

    daily_rate = current_spend / days_elapsed if days_elapsed > 0 else 0
    predicted_remaining = daily_rate * days_remaining
    predicted_total = current_spend + predicted_remaining
    predicted_end_balance = balance - predicted_remaining

    finn_summary = ""
    if anthropic_client and current_spend > 0:
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
        "category_breakdown": category_breakdown,
        "finn_summary": finn_summary,
    }

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
