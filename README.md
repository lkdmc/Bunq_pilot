# bunq Spending Tracker

A full-stack banking app that automatically categorizes bunq account transactions and provides spending analysis, forecasts, and advice using Claude AI (Finn).

## Architecture

```
frontend/          React + Vite + Tailwind (Port 5173)
backend/           FastAPI + SQLite (Port 8000)
  ├── main.py          API server, webhook receiver, Claude AI integration
  ├── bunq_client.py   Bunq SDK for balance/transaction lookup
  ├── seed_data.py     Dummy data seeding (direct webhook calls)
  └── seed_real.py     Seeding with real bunq sandbox API
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- [Anthropic API Key](https://console.anthropic.com/) — Required for Finn AI chat and receipt analysis
- [bunq Sandbox API Key](https://www.bunq.com/developer/) — Required for balance lookup and real-time webhooks

## 1. Environment Variable Setup

```bash
cp env.example backend/.env
```

Open `backend/.env` and fill in the values:

```env
ANTHROPIC_API_KEY=sk-ant-...          # Required: All Finn AI features
BUNQ_API_KEY=sandbox_...              # Optional: Real-time balance/transaction lookup

# Required only for send_transactions.py (manual signing method)
BUNQ_SESSION_TOKEN=your_session_token
BUNQ_USER_ID=your_user_id
BUNQ_MONETARY_ACCOUNT_ID=your_monetary_account_id
BUNQ_PRIVATE_KEY_PATH=private.pem
```

> You can run the app with dummy data (`seed_data.py`) even without a `BUNQ_API_KEY`.

## 2. Install Dependencies

**Backend**
```bash
cd backend
pip install -r requirements.txt
```

**Frontend**
```bash
cd frontend
npm install
```

## 3. Run the App

Run both backend and frontend from the project root:

```bash
chmod +x start.sh
./start.sh
```

Or in separate terminals:

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Access after running:
- **React App** → http://localhost:5173
- **Backend Debug Dashboard** → http://localhost:8000
- **API Docs** → http://localhost:8000/docs

## 4. Fill Transaction Data

When you first run the app, the transaction history is empty. Fill it using the following methods.

### Method A — Real bunq Sandbox (Takes about 6 minutes)

With `BUNQ_API_KEY` configured:

```bash
cd backend
python seed_real.py
```

This creates payments via the real bunq sandbox API, and bunq sends webhooks back to the server.  
To use this method, you must first register the webhook (see #5 below).

## 5. Real-time Webhook Setup (Optional)

To have real bunq transactions reflect in real-time, expose your local server using ngrok and register the webhook.

```bash
ngrok http 8000
# Copy the printed https://xxxx.ngrok-free.app URL
```

Register the webhook in the bunq portal (or via Postman):

```
POST /v1/user/{user_id}/monetary-account/{monetary_account_id}/notification-filter-url
```

```json
{
  "notification_filters": [
    {"category": "PAYMENT", "notification_target": "https://xxxx.ngrok-free.app/webhook"},
    {"category": "MUTATION", "notification_target": "https://xxxx.ngrok-free.app/webhook"}
  ]
}
```

## Key Features

| Tab | Description |
|---|---|
| **Home** | Account balance, recent transactions, receipt scanning |
| **Subs** | Subscription list and annual costs automatically detected by AI |
| **Forecast** | End-of-month balance forecast, budget setting, monthly spending trend charts |
| **Finn AI** | Claude-based conversational financial assistant |
| **Receipt** | Upload receipt image → Itemized categorization and saving advice |

## Backend Pages (Debug)

| URL | Description |
|---|---|
| `http://localhost:8000/` | Real-time dashboard (auto-refreshes every 5 seconds) |
| `http://localhost:8000/report-page/2026/4` | Spending report for a specific month |
| `http://localhost:8000/advice` | AI saving tips |
| `http://localhost:8000/docs` | FastAPI Swagger UI |

## Additional Scripts

```bash
# Send 30 test transactions using manual signing (requires BUNQ_SESSION_TOKEN etc.)
cd backend
python send_transactions.py
```

```bash
# Re-extract merchant names for existing transactions where counterparty is 'Sugar Daddy' (one-time migration)
curl -X POST http://localhost:8000/api/admin/fix-counterparties
```
