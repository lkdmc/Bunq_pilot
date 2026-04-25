# bunq Spending Advisor — Devpost Submission

## Inspiration

We noticed that most people have no idea where their money actually goes every month. Bank apps show raw transaction lists, but they don't tell you *why* you're broke by the 20th. We wanted to build something that feels less like a spreadsheet and more like a smart friend who happens to know your finances — proactive, honest, and a little witty.

## What it does

**bunq Spending Advisor** connects to your bunq account via real-time webhooks and gives you a full picture of your financial life:

- **Auto-categorizes** every transaction using Claude AI
- **Detects subscriptions** you might have forgotten about, and shows the annual cost
- **Forecasts your month-end balance** based on your spending pace and budget
- **Finn AI chat** — ask anything about your finances in plain language and get short, actionable advice
- **Receipt scanning** — upload a photo of a receipt and get itemized breakdown and saving tips powered by Claude's vision

## How we built it

- **Frontend:** React + Vite + Tailwind CSS — dark-mode mobile-first UI with tab navigation (Home, Subs, Forecast, Finn AI, Receipt)
- **Backend:** FastAPI (Python) with SQLite for transaction storage
- **AI:** Anthropic Claude API for transaction categorization, subscription detection, financial chat (Finn), and receipt image analysis
- **Banking:** bunq Sandbox API + real-time webhooks to receive payment events instantly
- **Infrastructure:** ngrok for local webhook tunneling during development

## Challenges we ran into

- **Webhook reliability:** Making sure every bunq payment event was captured, deduplicated, and stored correctly in real time
- **Merchant name extraction:** bunq transaction counterparty fields are often messy; we had to use Claude to clean and normalize merchant names
- **Forecast accuracy:** Building a month-end balance forecast that accounts for recurring subscriptions, spending trends, and user-set budgets — without overfitting to short history
- **Receipt OCR edge cases:** Receipts come in wildly different formats; getting Claude's vision to reliably itemize them took careful prompt engineering

## Accomplishments that we're proud of

- End-to-end real-time pipeline: a bunq payment triggers a webhook, which hits our backend, runs Claude categorization, and appears in the UI within seconds
- Finn AI feels genuinely useful — short, emoji-punctuated answers that don't waste your time
- Receipt scanning that actually works on crumpled, angled, or low-light photos
- Subscription detection that surfaces annual costs, making the "death by a thousand cuts" problem visible at a glance

## What we learned

- How to integrate bunq's SDK and webhook system end-to-end
- How to use Claude's multimodal API for real-world image understanding
- Prompt engineering for financial advice: brevity and specificity matter far more than length
- How to build a useful forecast with limited transaction history

## What's next for bunq Spending Advisor

- **Savings goals:** Let users set a goal (e.g. "save €500 for a trip") and have Finn track progress and nudge spending behavior
- **Peer benchmarking:** Anonymous comparison of spending patterns with similar users ("You spend 2x the average on food delivery")
- **Smart alerts:** Proactive push notifications when spending in a category is trending over budget
- **Multi-account support:** Aggregate across multiple bunq accounts or sub-accounts
- **Production bunq API:** Move from sandbox to live accounts for real users
