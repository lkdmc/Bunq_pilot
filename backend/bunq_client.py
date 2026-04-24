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
