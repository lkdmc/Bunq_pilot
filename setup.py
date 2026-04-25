"""
bunq Spending Tracker — First-time Setup
Run: python setup.py
"""

import os
import json

ENV_FILE = ".env"
CONFIG_FILE = "bunq_config.json"

def ask(prompt, default=""):
    val = input(f"{prompt} [{default}]: ").strip() if default else input(f"{prompt}: ").strip()
    return val if val else default

def main():
    print("=" * 50)
    print("  bunq Spending Tracker — Setup")
    print("=" * 50)
    print()
    print("You'll need:")
    print("  1. A bunq sandbox API key (from POST /sandbox-user-person)")
    print("  2. Run Installation → Device → Session in Postman")
    print("  3. An Anthropic API key (console.anthropic.com)")
    print()

    # ── bunq credentials ──────────────────────────────
    print("── bunq Credentials ──────────────────────────────")
    session_token = ask("Session token (from step 4 - Add a session)")
    user_id       = ask("User ID")
    monetary_id   = ask("Monetary Account ID")
    api_key       = ask("bunq API Key (sandbox_...)")

    # ── Anthropic ──────────────────────────────────────
    print()
    print("── Anthropic API ─────────────────────────────────")
    anthropic_key = ask("Anthropic API Key (sk-ant-...)")

    # ── Private key ────────────────────────────────────
    print()
    print("── Private Key ───────────────────────────────────")
    print("Paste your private key PEM (from Postman env > private_key_client).")
    print("Press ENTER twice when done:")
    lines = []
    while True:
        line = input()
        if line == "" and lines and lines[-1] == "":
            break
        lines.append(line)
    private_key_pem = "\n".join(lines).strip()

    # ── Save private key to file ───────────────────────
    with open("private.pem", "w") as f:
        f.write(private_key_pem + "\n")
    print("✓ Saved private.pem")

    # ── Save .env ──────────────────────────────────────
    env_content = f"""ANTHROPIC_API_KEY={anthropic_key}
BUNQ_SESSION_TOKEN={session_token}
BUNQ_USER_ID={user_id}
BUNQ_MONETARY_ACCOUNT_ID={monetary_id}
BUNQ_API_KEY={api_key}
BUNQ_PRIVATE_KEY_PATH=private.pem
"""
    with open(ENV_FILE, "w") as f:
        f.write(env_content)
    print("✓ Saved .env")

    # ── Save config summary ────────────────────────────
    config = {
        "user_id": user_id,
        "monetary_account_id": monetary_id,
        "base_url": "https://public-api.sandbox.bunq.com/v1"
    }
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    print("✓ Saved bunq_config.json")

    print()
    print("=" * 50)
    print("  Setup complete! Now run:")
    print()
    print("  uvicorn main:app --reload --port 8000")
    print()
    print("  And in another terminal:")
    print("  ngrok http 8000")
    print("=" * 50)

if __name__ == "__main__":
    main()