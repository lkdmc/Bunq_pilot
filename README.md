# bunq Spending Tracker

Categorizes bunq transactions with Claude AI. Monthly reports + low-balance advice.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env       # fill in your values
# paste your Postman private_key_client into private.pem
uvicorn main:app --reload --port 8000
ngrok http 8000            # copy the https URL
```

Then register webhook in Postman:
`POST /v1/user/{user_id}/monetary-account/{monetary_account_id}/notification-filter-url`
```json
{
  "notification_filters": [
    {"category": "PAYMENT", "notification_target": "https://xxxx.ngrok-free.dev/webhook"},
    {"category": "MUTATION", "notification_target": "https://xxxx.ngrok-free.dev/webhook"}
  ]
}
```

## Pages
- `/` — dashboard
- `/report-page/2026/4` — monthly report  
- `/advice` — AI spending tips