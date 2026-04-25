import os
import base64
from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.bunq_context import BunqContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.model.generated.endpoint import PaymentApiObject as Payment
from bunq.sdk.model.generated.endpoint import MasterCardActionApiObject as MasterCardAction

def setup_bunq():
    api_key = os.getenv("BUNQ_API_KEY")
    if not api_key:
        return False
    
    try:
        if os.path.exists("bunq.conf"):
            api_context = ApiContext.restore("bunq.conf")
        else:
            environment = ApiEnvironmentType.SANDBOX
            api_context = ApiContext.create(environment, api_key, "Bunq AI Prototype")
            api_context.save("bunq.conf")
            
        BunqContext.load_api_context(api_context)
        return True
    except Exception as e:
        print(f"Error setting up Bunq: {e}")
        return False

def get_recent_transactions(limit=50):
    if not setup_bunq():
        return []
    try:
        # Get primary monetary account
        accounts = BunqContext.user_context().primary_monetary_account
        monetary_account_id = accounts.id_

        # 1. Fetch regular Payments
        payments = Payment.list(
            monetary_account_id=monetary_account_id,
            params={"count": str(limit)}
        ).value

        # 2. Fetch Mastercard Actions (Card payments)
        card_actions = MasterCardAction.list(
            monetary_account_id=monetary_account_id,
            params={"count": str(limit)}
        ).value

        all_txs = []

        # Process Payments
        for p in payments:
            merchant = "Unknown"
            if p.counterparty_alias:
                if p.counterparty_alias.label_monetary_account:
                    merchant = p.counterparty_alias.label_monetary_account.display_name
                elif p.counterparty_alias.pointer:
                    merchant = p.counterparty_alias.pointer.name
                    
            all_txs.append({
                "external_id": f"pay_{p.id_}",
                "amount": p.amount.value if p.amount else "0.00",
                "currency": p.amount.currency if p.amount else "EUR",
                "date": p.created if p.created else "",
                "merchant": merchant,
                "description": p.description if p.description else ""
            })

        # Process Mastercard Actions
        for m in card_actions:
            merchant = "Card Payment"
            if m.counterparty_alias:
                if hasattr(m.counterparty_alias, 'label_monetary_account') and m.counterparty_alias.label_monetary_account:
                    merchant = m.counterparty_alias.label_monetary_account.display_name
                elif hasattr(m.counterparty_alias, 'pointer') and m.counterparty_alias.pointer:
                    merchant = m.counterparty_alias.pointer.name
            elif m.description:
                merchant = m.description
                
            # Card actions usually have amount_billing for the account currency
            all_txs.append({
                "external_id": f"card_{m.id_}",
                "amount": m.amount_billing.value if m.amount_billing else "0.00",
                "currency": m.amount_billing.currency if m.amount_billing else "EUR",
                "date": m.maturity_date if hasattr(m, 'maturity_date') and m.maturity_date else "", # Fallback if missing
                "merchant": merchant,
                "description": f"Card payment at {m.city}" if hasattr(m, 'city') and m.city else "Card Payment"
            })

        # Sort by date (descending) - simple string sort works for Bunq date format
        all_txs.sort(key=lambda x: x['date'], reverse=True)
        
        return all_txs[:limit]
    except Exception as e:
        print(f"Error fetching transactions: {e}")
        return []

def get_account_details():
    if not setup_bunq():
        return None
    try:
        account = BunqContext.user_context().primary_monetary_account
        
        iban = ""
        if account.alias:
            for alias in account.alias:
                if alias.type_ == "IBAN":
                    iban = alias.value
                    break
                    
        return {
            "description": account.description,
            "balance": account.balance.value,
            "currency": account.balance.currency,
            "iban": iban
        }
    except Exception as e:
        print(f"Error fetching account details: {e}")
        return None

def get_balance():
    if not setup_bunq():
        return None
    try:
        from bunq.sdk.model.generated.endpoint import MonetaryAccountBank
        user_context = BunqContext.user_context()
        monetary_account_id = user_context.primary_monetary_account.id_
        account = MonetaryAccountBank.get(monetary_account_id)
        bal = account.value.balance
        return {"balance": float(bal.value), "currency": bal.currency}
    except Exception as e:
        print(f"Error fetching balance: {e}")
        return None

def get_payment_attachments(payment_id: int, monetary_account_id: int = None):
    if not setup_bunq():
        return []
    try:
        from bunq.sdk.model.generated.endpoint import AttachmentMonetaryAccount
        from bunq.sdk.model.generated.endpoint import AttachmentMonetaryAccountContent

        user_context = BunqContext.user_context()
        if monetary_account_id is None:
            monetary_account_id = user_context.primary_monetary_account.id_

        attachments = AttachmentMonetaryAccount.list(
            monetary_account_id=monetary_account_id,
            payment_id=payment_id,
        )

        results = []
        for att in attachments.value:
            att_id = att.id_
            content_response = AttachmentMonetaryAccountContent.list(
                monetary_account_id=monetary_account_id,
                attachment_monetary_account_id=att_id,
            )
            raw_bytes = content_response.value
            content_type = getattr(content_response, "content_type", "application/octet-stream")
            results.append({
                "id": att_id,
                "content_type": content_type,
                "data_b64": base64.b64encode(raw_bytes).decode("utf-8"),
            })
        return results
    except Exception as e:
        print(f"Error fetching attachments for payment {payment_id}: {e}")
        return []
