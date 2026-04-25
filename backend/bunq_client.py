import os
from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.bunq_context import BunqContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.model.generated.endpoint import PaymentApiObject as Payment

def setup_bunq():
    api_key = os.getenv("BUNQ_API_KEY")
    if not api_key:
        return False
        
    try:
        if os.path.exists("bunq.conf"):
            api_context = ApiContext.restore("bunq.conf")
        else:
            api_context = ApiContext.create(ApiEnvironmentType.SANDBOX, api_key, "Bunq Pilot")
            api_context.save("bunq.conf")
            
        BunqContext.load_api_context(api_context)
        return True
    except Exception as e:
        print(f"Failed to setup bunq API: {e}")
        return False

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
        print(f"Error fetching balance from SDK: {e}")
        return None

def get_recent_transactions(limit=10):
    if not setup_bunq():
        return []
    
    try:
        user_context = BunqContext.user_context()
        monetary_account_id = user_context.primary_monetary_account.id_
        
        payments = Payment.list(monetary_account_id=monetary_account_id, count=limit)
        
        formatted_tx = []
        for p in payments.value:
            amount = p.amount.value if p.amount else "0.00"
            currency = p.amount.currency if p.amount else "EUR"
            date = p.created.split(" ")[0] if p.created else "Unknown"
            
            merchant = "Unknown"
            if p.counterparty_alias and p.counterparty_alias.display_name:
                merchant = p.counterparty_alias.display_name
                
            desc = p.description if p.description else "No description"
            
            formatted_tx.append({
                "date": date,
                "amount": amount,
                "currency": currency,
                "merchant": merchant,
                "desc": desc
            })
            
        return formatted_tx
    except Exception as e:
        print(f"Error fetching bunq transactions: {e}")
        return []
        
def get_payment_attachments(payment_id: int, monetary_account_id: int = None):
    """
    Returns a list of attachments for a given payment.
    Each item: { "id": int, "content_type": str, "data_b64": str }
    """
    if not setup_bunq():
        return []
 
    try:
        user_context = BunqContext.user_context()
        if monetary_account_id is None:
            monetary_account_id = user_context.primary_monetary_account.id_
 
        # Step 1: list the attachment metadata for this payment
        attachments = AttachmentMonetaryAccount.list(
            monetary_account_id=monetary_account_id,
            payment_id=payment_id,
        )
 
        results = []
        for att in attachments.value:
            att_id = att.id_
 
            # Step 2: fetch binary content for each attachment
            content_response = AttachmentMonetaryAccountContent.list(
                monetary_account_id=monetary_account_id,
                attachment_monetary_account_id=att_id,
            )
 
            raw_bytes = content_response.value  # bytes
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
