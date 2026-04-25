from fastapi import FastAPI, HTTPException, Query, Depends, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
import json
import base64
import calendar
from datetime import datetime
from collections import defaultdict
from dotenv import load_dotenv
from typing import List, Dict, Any
from bunq_client import get_recent_transactions, get_account_details, get_payment_attachments
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
import models

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=API_KEY) if API_KEY and API_KEY != "YOUR_API_KEY_HERE" else None

class AnalyzeRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    user_preference: Dict[str, Any]

class PaymentRequest(BaseModel):
    amount: str
    currency: str = "EUR"
    recipient_iban: str
    recipient_name: str
    description: str = "Payment"
    attachment_b64: str | None = None

@app.post("/api/pay")
async def create_payment(req: PaymentRequest, db: Session = Depends(get_db)):
    from bunq_client import setup_bunq
    if not setup_bunq():
        raise HTTPException(status_code=500, detail="Bunq setup failed")
    try:
        from bunq.sdk.model.generated.endpoint import PaymentApiObject, AttachmentMonetaryAccountApiObject
        from bunq.sdk.model.generated.object_ import AmountObject, PointerObject, AttachmentMonetaryAccountPaymentObject
        from bunq.sdk.context.bunq_context import BunqContext

        user_context = BunqContext.user_context()
        monetary_account_id = user_context.primary_monetary_account.id_

        attachments = []
        if req.attachment_b64:
            try:
                img_bytes = base64.b64decode(req.attachment_b64)
                # AttachmentMonetaryAccountApiObject returns an INTEGER id, which Payment expects
                attachment_id = AttachmentMonetaryAccountApiObject.create(
                    monetary_account_id=monetary_account_id,
                    request_bytes=img_bytes,
                    custom_headers={
                        "Content-Type": "image/jpeg",
                        "X-Bunq-Attachment-Description": "receipt.jpg"
                    }
                ).value
                attachments.append(AttachmentMonetaryAccountPaymentObject(id_=attachment_id))
            except Exception as e:
                print(f"Failed to upload attachment: {e}")

        result = PaymentApiObject.create(
            amount=AmountObject(value=req.amount, currency=req.currency),
            counterparty_alias=PointerObject(type_="IBAN", value=req.recipient_iban, name=req.recipient_name),
            description=req.description,
            monetary_account_id=monetary_account_id,
            attachment=attachments if attachments else None
        )
        payment_id = result.value

        # Save to local DB
        saved_attachment_id = attachments[0].id_ if attachments else None
        new_tx = models.Transaction(
            external_id=f"pay_{payment_id}",
            date=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            merchant=req.recipient_name,
            amount=f"-{req.amount}",
            currency=req.currency,
            description=req.description,
            attachment_id=saved_attachment_id,
        )
        db.add(new_tx)
        db.commit()

        return {"status": "success", "payment_id": payment_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/account")
async def get_account():
    details = get_account_details()
    if not details:
        raise HTTPException(status_code=500, detail="Failed to fetch account details")
    return details

@app.get("/api/transactions")
async def get_transactions(limit: int = Query(10), db: Session = Depends(get_db)):
    txs = db.query(models.Transaction).order_by(models.Transaction.date.desc()).limit(limit).all()
    formatted_txs = []
    for t in txs:
        formatted_txs.append({
            "id": t.external_id,
            "date": t.date,
            "merchant": t.merchant,
            "amount": t.amount,
            "currency": t.currency,
            "desc": t.description
        })
    return formatted_txs

@app.post("/api/transactions/sync")
async def sync_transactions(db: Session = Depends(get_db)):
    recent = get_recent_transactions(limit=50)
    if not recent:
        return {"status": "error", "message": "Failed to fetch from Bunq"}
        
    synced_count = 0
    for tx in recent:
        # Using external_id key as returned by bunq_client
        existing = db.query(models.Transaction).filter(models.Transaction.external_id == tx["external_id"]).first()
        if not existing:
            new_tx = models.Transaction(
                external_id=tx["external_id"],
                date=tx["date"],
                merchant=tx["merchant"],
                amount=tx["amount"],
                currency=tx["currency"],
                description=tx["description"]
            )
            db.add(new_tx)
            synced_count += 1
            
    db.commit()
    return {"status": "success", "synced_count": synced_count}

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
CRITICAL: All generated text (summary_headline, past_insight, present_pacing, future_action) MUST be written in English.

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
      "category": "Essential" | "Standard" | "Luxury"
    }
  ]
}"""

@app.post("/api/analyze")
async def analyze_transactions(req: AnalyzeRequest):
    if not client:
        raise HTTPException(status_code=500, detail="Anthropic API Key is not configured in backend.")
        
    user_prompt = f"User Preference: {req.user_preference}\nTransactions: {json.dumps(req.transactions)}"
    
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=ANALYZE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        text_resp = response.content[0].text.strip()
        
        # Strip potential markdown wrappers just in case
        if text_resp.startswith("```json"):
            text_resp = text_resp.split("```json")[1]
            if text_resp.endswith("```"):
                text_resp = text_resp[:-3]
        elif text_resp.startswith("```"):
            text_resp = text_resp.split("```")[1]
            if text_resp.endswith("```"):
                text_resp = text_resp[:-3]
                
        text_resp = text_resp.strip()
        
        parsed_json = json.loads(text_resp)
        return parsed_json
        
    except json.JSONDecodeError as e:
        print("Raw Claude Output:", text_resp)
        raise HTTPException(status_code=500, detail=f"Failed to parse Claude JSON response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Webhook ───────────────────────────────────────────────────────────────────

@app.post("/webhook")
async def receive_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    try:
        notification = body.get("NotificationUrl", {})
        event_type = notification.get("event_type", "")
        if event_type and event_type != "PAYMENT_CREATED":
            return {"status": "ok"}

        obj = notification.get("object", {})
        if "Payment" in obj:
            payment = obj["Payment"]
            tx_id = f"pay_{payment.get('id')}"
            created_str = payment.get("created", "")
            amount_obj = payment.get("amount", {})
            amount = amount_obj.get("value", "0.00")
            currency = amount_obj.get("currency", "EUR")
            description = payment.get("description", "")
            counterparty = payment.get("counterparty_alias", {}).get("display_name", "Unknown")

            existing = db.query(models.Transaction).filter(models.Transaction.external_id == tx_id).first()
            if not existing:
                new_tx = models.Transaction(
                    external_id=tx_id,
                    date=created_str[:10] if created_str else "",
                    merchant=counterparty,
                    amount=amount,
                    currency=currency,
                    description=description,
                )
                db.add(new_tx)
                db.commit()
                print(f"Webhook: saved {tx_id} ({counterparty} {amount} {currency})")
    except Exception as e:
        print(f"Webhook error: {e}")
    return {"status": "ok"}

# ── Receipt Scanning ──────────────────────────────────────────────────────────

@app.post("/api/transactions/{tx_id}/receipt")
async def upload_receipt(tx_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not client:
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
        response = client.messages.create(
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

        for item in items:
            db.add(models.ReceiptItem(
                transaction_id=tx_id,
                name=item.get("name"),
                category=item.get("category"),
                subcategory=item.get("subcategory"),
                amount=item.get("amount"),
            ))
        db.commit()
        return {"status": "ok", "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/receipts/report")
async def api_receipts_report(db: Session = Depends(get_db)):
    items = db.query(models.ReceiptItem).order_by(models.ReceiptItem.id.desc()).limit(50).all()

    breakdown_map = defaultdict(float)
    for item in items:
        key = (item.category, item.subcategory)
        breakdown_map[key] += item.amount or 0

    breakdown = [
        {"category": k[0], "subcategory": k[1], "total": round(v, 2)}
        for k, v in breakdown_map.items()
    ]

    advice = "No receipt data available yet."
    if breakdown and client:
        items_text = "\n".join([
            f"- {i.name} ({i.category} / {i.subcategory}): €{i.amount:.2f}"
            for i in items if i.amount
        ])
        prompt = f"""You are Finn, a smart financial advisor. Look at this recent itemized receipt spending:

{items_text}

Provide 3 short, punchy tips about their subcategory spending (Essential vs Standard vs Luxury) and suggest areas to cut back. Keep it under 4 sentences total. Use emojis."""
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            advice = msg.content[0].text.strip()
        except Exception as e:
            print(f"Error getting receipt advice: {e}")

    return {"breakdown": breakdown, "advice": advice}

# ── Subscription Detective ────────────────────────────────────────────────────

@app.get("/api/subscriptions")
async def api_subscriptions(db: Session = Depends(get_db)):
    txs = db.query(models.Transaction).all()

    merchant_map = defaultdict(list)
    for tx in txs:
        try:
            amount = float(tx.amount)
        except (TypeError, ValueError):
            continue
        if amount >= 0:
            continue
        merchant_map[tx.merchant or "Unknown"].append(tx)

    result = []
    for merchant, txlist in merchant_map.items():
        if len(txlist) < 2:
            continue
        amounts = [abs(float(t.amount)) for t in txlist]
        avg_amt = sum(amounts) / len(amounts)
        dates = sorted([t.date for t in txlist if t.date])
        if len(dates) >= 2:
            d1 = datetime.fromisoformat(dates[0][:10])
            d2 = datetime.fromisoformat(dates[-1][:10])
            span_days = (d2 - d1).days
            days_between = span_days / (len(dates) - 1) if len(dates) > 1 else 30
        else:
            days_between = 30

        if days_between <= 10:
            frequency = "weekly"
        elif days_between <= 35:
            frequency = "monthly"
        elif days_between <= 100:
            frequency = "quarterly"
        else:
            frequency = "yearly"

        annual_cost = avg_amt * (365 / max(days_between, 1))
        result.append({
            "counterparty": merchant,
            "count": len(txlist),
            "avg_amount": round(avg_amt, 2),
            "frequency": frequency,
            "days_between": round(days_between),
            "annual_cost": round(annual_cost, 2),
            "advice": "",
        })

    if result and client:
        subs_text = "\n".join(
            f"{i+1}. {s['counterparty']}: €{s['avg_amount']:.2f} {s['frequency']}"
            for i, s in enumerate(result)
        )
        prompt = f"""Analyze these recurring bank payments. Reply with exactly {len(result)} lines, one per payment in the same order.
Each line: one emoji + brief description of what the service likely is (max 8 words).

Payments:
{subs_text}"""
        try:
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}]
            )
            advice_lines = [l.strip() for l in message.content[0].text.strip().split("\n") if l.strip()]
            for i, sub in enumerate(result):
                sub["advice"] = advice_lines[i] if i < len(advice_lines) else ""
        except Exception as e:
            print(f"Error getting subscription advice: {e}")

    return result

# ── Predictive Balance ────────────────────────────────────────────────────────

@app.get("/api/predict")
async def api_predict(db: Session = Depends(get_db)):
    account = get_account_details()
    balance = float(account["balance"]) if account and account.get("balance") else 0.0

    now = datetime.now()
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_elapsed = now.day
    days_remaining = days_in_month - days_elapsed

    txs = db.query(models.Transaction).all()
    current_spend = 0.0
    for tx in txs:
        try:
            amount = float(tx.amount)
        except (TypeError, ValueError):
            continue
        tx_date = tx.date[:7] if tx.date and len(tx.date) >= 7 else ""
        if tx_date == f"{now.year}-{now.month:02d}" and amount < 0:
            current_spend += abs(amount)

    daily_rate = current_spend / days_elapsed if days_elapsed > 0 else 0
    predicted_remaining = daily_rate * days_remaining
    predicted_total = current_spend + predicted_remaining
    predicted_end_balance = balance - predicted_remaining

    finn_summary = ""
    if client and current_spend > 0:
        prompt = f"""You are Finn, a friendly financial assistant. Give a 2-sentence spending forecast.

This month so far: €{current_spend:.2f} in {days_elapsed} days (€{daily_rate:.2f}/day)
Projected month total: €{predicted_total:.2f}
Current balance: €{balance:.2f} → Predicted end balance: €{predicted_end_balance:.2f}

Be direct and use 1-2 emojis."""
        try:
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )
            finn_summary = message.content[0].text.strip()
        except Exception as e:
            print(f"Error getting predict summary: {e}")

    return {
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "current_spend": round(current_spend, 2),
        "daily_rate": round(daily_rate, 2),
        "predicted_remaining": round(predicted_remaining, 2),
        "predicted_total": round(predicted_total, 2),
        "current_balance": round(balance, 2),
        "predicted_end_balance": round(predicted_end_balance, 2),
        "finn_summary": finn_summary,
    }

# ── Payment Attachments (bunq) ────────────────────────────────────────────────

@app.get("/api/transactions/{payment_id}/attachments")
async def api_payment_attachments(payment_id: int, monetary_account_id: int = None):
    attachments = get_payment_attachments(payment_id, monetary_account_id)
    return attachments

@app.get("/api/transactions/{payment_id}/attachments/{attachment_id}/raw")
async def api_attachment_raw(payment_id: int, attachment_id: int, monetary_account_id: int = None):
    from fastapi.responses import Response
    attachments = get_payment_attachments(payment_id, monetary_account_id)
    match = next((a for a in attachments if a["id"] == attachment_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Attachment not found")
    raw = base64.b64decode(match["data_b64"])
    return Response(content=raw, media_type=match["content_type"])
