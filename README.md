# 🏦 Bunq Pilot: F.R (Financial Report) AI Assistant

## 📌 Project Overview
Bunq Pilot is a hackathon project designed to upgrade the Bunq banking experience by introducing an AI-powered financial assistant named **'F.R' (Financial Report)**. 
By integrating the official Bunq API with Anthropic's Claude AI, this application automatically categorizes user transactions, provides personalized financial advice, and visualizes spending habits through a highly interactive, modern dashboard.

## 🛠 Tech Stack
- **Frontend**: React, TailwindCSS, Vite
- **Backend**: Python, FastAPI, SQLAlchemy (SQLite)
- **External APIs**:
  - **Bunq Python SDK** (Sandbox Environment)
  - **Anthropic Claude API** (`claude-sonnet-4-6`)

## 🔑 Core Features & Recent Updates

### 1. Unified Transaction Syncing (Local Database Caching)
- **Bunq API Integration**: Fetches both regular bank transfers (`PaymentApiObject`) and card payments (`MasterCardActionApiObject`) to ensure no expenditures are missed.
- **SQLite Caching**: Fetched transactions are mapped and cached in a local `bunq.db` via SQLAlchemy. This prevents rate-limiting issues with the Bunq Sandbox and provides instantaneous data loading for the frontend.

### 2. AI Financial Analysis (F.R)
- **Smart Categorization**: Sends recent transactions to Claude AI to intelligently classify them into 3 distinct tiers:
  - **Essential**: Survival & basic living (groceries, utilities).
  - **Standard**: Reasonable quality of life (casual dining, hobbies).
  - **Luxury**: Reward-based or excessive spending (luxury hotels, fine dining).
- **Personalized Advice**: The AI agent (`F.R`) generates actionable financial insights based on the user's recent cash flow.

### 3. Real-Time Interactive UI
- **Animated Donut Chart**: Dynamically renders spending proportions using SVG animations.
- **Bottom Sheet Category Editing**: Users can manually tap a transaction to change its category (e.g., from Luxury to Essential). The frontend state recalculates the chart proportions **instantly** without requiring an additional server call.

### 4. Advanced Bunq API Utilization (Recent Commits)
- **Account Details**: Uses `BunqContext.user_context().primary_monetary_account` to stream real-time Balance, IBAN, and Account Name to the UI.
- **Receipts & Attachments**: Implemented `AttachmentMonetaryAccount` and `AttachmentMonetaryAccountContent` API logic in `bunq_client.py` to retrieve binary receipt images (Base64 encoded) attached to specific payments.

## 📂 Architecture & API Routes

### Backend (`/backend`)
*   `main.py`: The FastAPI entry point.
    *   `GET /api/account`: Returns the primary account balance and IBAN.
    *   `GET /api/transactions`: Returns cached transactions from SQLite.
    *   `POST /api/transactions/sync`: Forces a sync with the Bunq SDK and updates the SQLite DB.
    *   `POST /api/analyze`: Constructs the system prompt and communicates with the Claude API.
*   `bunq_client.py`: The core wrapper handling `ApiContext`, `BunqContext`, and SDK endpoint calls.
*   `database.py` / `models.py`: SQLAlchemy configuration.

### Frontend (`/frontend`)
*   `src/App.jsx`: Main single-page application orchestrating the dashboard, transaction mapping, and modal states.

## 🚀 How to Run Locally

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Ensure your .env file is set up:
# BUNQ_API_KEY=sandbox_...
# ANTHROPIC_API_KEY=sk-ant-...

# Run the FastAPI server
uvicorn main:app --reload
```
*(Note: If you encounter 500 errors regarding the Bunq Context, delete `bunq.db` and `bunq.conf` to force a fresh sandbox registration upon the next request).*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
