from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
from dotenv import load_dotenv
from typing import List, Dict, Any
from bunq_client import get_recent_transactions

load_dotenv()

app = FastAPI()

# Allow CORS for React frontend (Vite default is 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("ANTHROPIC_API_KEY")
client = anthropic.Anthropic(api_key=API_KEY) if API_KEY and API_KEY != "YOUR_API_KEY_HERE" else None



SYSTEM_PROMPT = "You are bunq's personal AI financial assistant, 'Finn'. You are a trendy and smart financial manager for the younger generation. You must analyze the user's transaction history to answer their questions. Avoid long, boring explanations. Provide short, clear, and fact-based practical saving tips (maximum 3 sentences) that hit the nail on the head. Use emojis appropriately."

class MessageInput(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []

@app.get("/api/transactions")
async def get_transactions():
    transactions = get_recent_transactions()
    return transactions

@app.post("/api/chat")
async def chat_with_finn(input_data: MessageInput):
    if not client:
        raise HTTPException(status_code=500, detail="Anthropic API Key is not configured in backend.")
        
    transactions = get_recent_transactions()
    transactions_text = "\n".join(
        [f"- {t['date']} | {t['merchant']} ({t['desc']}): {t['amount']}{t['currency']}" for t in transactions]
    )
    context_prompt = f"[User Transaction History]\n{transactions_text}\n\nPlease refer to the recent transaction history above to answer the user's question. Question: {input_data.message}"
    
    messages = []
    for msg in input_data.history:
         messages.append({"role": msg["role"], "content": msg["content"]})
    
    messages.append({"role": "user", "content": context_prompt})
    
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=messages
        )
        return {"response": response.content[0].text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
