import os
import anthropic
from dotenv import load_dotenv

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

models_to_test = [
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-20240620",
    "claude-3-sonnet-20240229",
    "claude-2.1",
    "claude-2.0"
]

for m in models_to_test:
    try:
        response = client.messages.create(
            model=m,
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}]
        )
        print(f"Success with {m}: {response.content[0].text}")
        break
    except Exception as e:
        print(f"Failed with {m}: {e}")
