import os
from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.bunq_context import BunqContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.model.generated.endpoint import PaymentApiObject as Payment

_bunq_ready = False

def setup_bunq():
    global _bunq_ready
    if _bunq_ready:
        return True
    api_key = os.getenv("BUNQ_API_KEY")
    if not api_key:
        return False
    try:
        if os.path.exists("bunq.conf"):
            api_context = ApiContext.restore("bunq.conf")
            api_context.save("bunq.conf")  # Persist refreshed session token
        else:
            api_context = ApiContext.create(ApiEnvironmentType.SANDBOX, api_key, "Bunq Pilot")
            api_context.save("bunq.conf")
        BunqContext.load_api_context(api_context)
        _bunq_ready = True
        return True
    except Exception as e:
        print(f"Failed to setup bunq API: {e}")
        return False

def _reset_bunq():
    """Force re-initialization on next API call (e.g. after session expiry)."""
    global _bunq_ready
    _bunq_ready = False

def _get_monetary_account_class():
    import bunq.sdk.model.generated.endpoint as ep
    for name in ("MonetaryAccountBankApiObject", "MonetaryAccountBank", "MonetaryAccount"):
        cls = getattr(ep, name, None)
        if cls is not None:
            return cls
    # Last resort: print what's available so we can fix it
    ma_classes = [x for x in dir(ep) if "onetary" in x or "Account" in x]
    print(f"[bunq] Available account classes: {ma_classes}")
    return None

def _get_request_inquiry_class():
    import bunq.sdk.model.generated.endpoint as ep
    for name in ("RequestInquiryApiObject", "RequestInquiry"):
        cls = getattr(ep, name, None)
        if cls is not None:
            return cls
    ri_classes = [x for x in dir(ep) if "equest" in x or "nquiry" in x]
    print(f"[bunq] Available request classes: {ri_classes}")
    return None

def get_balance():
    if not setup_bunq():
        return None
    try:
        user_context = BunqContext.user_context()
        account = user_context.primary_monetary_account
        # Some SDK versions expose balance directly on primary_monetary_account
        if hasattr(account, "balance") and account.balance is not None:
            bal = account.balance
            return {"balance": float(bal.value), "currency": bal.currency}
        # Otherwise fetch via the MonetaryAccountBank endpoint
        MAB = _get_monetary_account_class()
        if MAB is None:
            return None
        result = MAB.get(account.id_)
        bal = result.value.balance
        return {"balance": float(bal.value), "currency": bal.currency}
    except Exception as e:
        print(f"Error fetching balance from SDK: {e}")
        _reset_bunq()
        return None

def create_request_inquiry(amount: str, description: str, counterparty_email: str) -> int:
    """Returns the created request inquiry ID."""
    if not setup_bunq():
        raise RuntimeError("bunq SDK not configured")
    RI = _get_request_inquiry_class()
    if RI is None:
        raise RuntimeError("RequestInquiry class not found in installed bunq SDK")
    from bunq.sdk.model.generated.object_ import Amount, Pointer
    account_id = BunqContext.user_context().primary_monetary_account.id_
    result = RI.create(
        amount_inquired=Amount(amount, "EUR"),
        counterparty_alias=Pointer("EMAIL", counterparty_email, "Sugar Daddy"),
        description=description,
        allow_bunqme=False,
        monetary_account_id=account_id,
    )
    return result.value

def _extract_display_name(alias) -> str:
    """Extract display name from MonetaryAccountReference (SDK v1.28+) or LabelMonetaryAccount."""
    if alias is None:
        return "Unknown"
    # SDK v1.28+: MonetaryAccountReference has label_monetary_account and pointer
    lma = getattr(alias, 'label_monetary_account', None)
    if lma:
        name = getattr(lma, 'display_name', None)
        if name:
            return name
    ptr = getattr(alias, 'pointer', None)
    if ptr:
        name = getattr(ptr, 'name', None)
        if name:
            return name
    # Older SDK: LabelMonetaryAccount has display_name directly
    name = getattr(alias, 'display_name', None)
    return name or "Unknown"


def get_recent_transactions(limit=10):
    if not setup_bunq():
        return []
    try:
        account_id = BunqContext.user_context().primary_monetary_account.id_
        payments = Payment.list(monetary_account_id=account_id, params={'count': limit})
        formatted_tx = []
        for p in payments.value:
            amount = p.amount.value if p.amount else "0.00"
            currency = p.amount.currency if p.amount else "EUR"
            date = p.created.split(" ")[0] if p.created else "Unknown"
            merchant = _extract_display_name(p.counterparty_alias)
            desc = p.description or "No description"
            formatted_tx.append({
                "id": str(p.id_),
                "date": date, "amount": amount, "currency": currency,
                "merchant": merchant, "desc": desc,
            })
        return formatted_tx
    except Exception as e:
        print(f"Error fetching bunq transactions: {e}")
        _reset_bunq()  # Force re-init on next call in case of session expiry
        return []
