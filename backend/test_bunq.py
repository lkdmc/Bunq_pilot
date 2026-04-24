import os
from dotenv import load_dotenv
from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.bunq_context import BunqContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.model.generated.endpoint import PaymentApiObject as Payment

load_dotenv()

def main():
    api_key = os.getenv("BUNQ_API_KEY")
    if not api_key:
        print("BUNQ_API_KEY missing")
        return

    try:
        if os.path.exists("bunq.conf"):
            api_context = ApiContext.restore("bunq.conf")
        else:
            api_context = ApiContext.create(ApiEnvironmentType.SANDBOX, api_key, "Test Device")
            api_context.save("bunq.conf")
            
        BunqContext.load_api_context(api_context)
        
        user_context = BunqContext.user_context()
        print("User:", user_context)
        print("Is person:", user_context.is_only_user_person())
        
        monetary_account_id = user_context.primary_monetary_account.id_
            
        print(f"Monetary account ID: {monetary_account_id}")
        
        payments = Payment.list(monetary_account_id=monetary_account_id, count=5)
        for p in payments.value:
            print(p.amount.value, p.description)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
