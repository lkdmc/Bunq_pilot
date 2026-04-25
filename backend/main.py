from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
import json
from dotenv import load_dotenv
from typing import List, Dict, Any
from bunq_client import get_recent_transactions
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
        existing = db.query(models.Transaction).filter(models.Transaction.external_id == str(tx["id"])).first()
        if not existing:
            new_tx = models.Transaction(
                external_id=str(tx["id"]),
                date=tx["date"],
                merchant=tx["merchant"],
                amount=tx["amount"],
                currency=tx["currency"],
                description=tx["desc"]
            )
            db.add(new_tx)
            synced_count += 1
            
    db.commit()
    return {"status": "success", "synced_count": synced_count}

ANALYZE_SYSTEM_PROMPT = """[Role]
You are 'F.R' (Financial Report), a highly personalized AI financial assistant. Your job is to meticulously analyze the user's transaction history and provide friendly, yet professional and actionable financial advice.

[Core Definitions: The 3-Tier Spending Categories]
1. Essential: Expenditures strictly necessary for survival and basic living (e.g., groceries, rice, eggs, transportation, medical bills, utilities).
2. Standard: Everyday expenditures to maintain a reasonable quality of life (e.g., casual dining, daily coffee, light hobbies, snacks).
3. Luxury: Reward-based or excessive expenditures that can be easily controlled or reduced (e.g., alcohol, luxury hotels, fine dining, designer brands, excessive food delivery).

[Task Steps: You MUST follow this Chain of Thought]
Step 1. Check if there are any predefined categories in the 'user_preference'. If a merchant exists in this list, you MUST strictly categorize it according to the user's preference, overriding general knowledge.
Step 2. Iterate through the provided 'transactions' array and accurately classify each item into either Essential, Standard, or Luxury.
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
