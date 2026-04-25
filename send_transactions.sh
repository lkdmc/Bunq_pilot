#!/bin/bash

SESSION_TOKEN="83692a73b2f25340158dab7835c90160c0146d69cbd793e91f21ec1c7cdd9c3d"
USER_ID="3628409"
MONETARY_ACCOUNT_ID="3620132"
BASE_URL="https://public-api.sandbox.bunq.com/v1"

send_payment() {
  local req_id=$1
  local amount=$2
  local description=$3

  curl -s -X POST "$BASE_URL/user/$USER_ID/monetary-account/$MONETARY_ACCOUNT_ID/payment" \
    -H "Content-Type: application/json" \
    -H "User-Agent: hackathon" \
    -H "X-Bunq-Language: en_US" \
    -H "X-Bunq-Region: nl_NL" \
    -H "X-Bunq-Geolocation: 0 0 0 0 000" \
    -H "X-Bunq-Client-Request-Id: $req_id" \
    -H "X-Bunq-Client-Authentication: $SESSION_TOKEN" \
    -d "{\"amount\":{\"value\":\"$amount\",\"currency\":\"EUR\"},\"counterparty_alias\":{\"type\":\"EMAIL\",\"value\":\"sugardaddy@bunq.com\",\"name\":\"Sugar Daddy\"},\"description\":\"$description\"}"

  echo " ✓ $req_id: $description (€$amount)"
  sleep 0.5
}

echo "=== Sending January 2026 transactions ==="
send_payment "req-001" "950.00" "Vesteda Huur 01-01-2026"
send_payment "req-002" "134.00" "Vattenfall Energie 05-01-2026"
send_payment "req-003" "89.99"  "Albert Heijn 08-01-2026"
send_payment "req-004" "22.80"  "Evides Waterbedrijf 10-01-2026"
send_payment "req-005" "312.00" "Belastingdienst Inkomstenbelasting 15-01-2026"
send_payment "req-006" "128.50" "Zilveren Kruis Zorgverzekering 18-01-2026"
send_payment "req-007" "45.00"  "Jumbo Supermarkt 22-01-2026"
send_payment "req-008" "49.00"  "KPN Thuis Internet 28-01-2026"

echo ""
echo "=== Sending February 2026 transactions ==="
send_payment "req-009" "950.00" "Vesteda Huur 01-02-2026"
send_payment "req-010" "98.50"  "Eneco Maandfactuur 03-02-2026"
send_payment "req-011" "67.80"  "Zalando 07-02-2026"
send_payment "req-012" "89.00"  "Gemeente Rotterdam Gemeentebelasting 10-02-2026"
send_payment "req-013" "13.50"  "Pathe Cinema Rotterdam 14-02-2026"
send_payment "req-014" "142.00" "Menzis Zorgpremie 18-02-2026"
send_payment "req-015" "33.00"  "Aldi Nederland 24-02-2026"
send_payment "req-016" "37.50"  "Ziggo Televisie en Internet 27-02-2026"

echo ""
echo "=== Sending March 2026 transactions ==="
send_payment "req-017" "950.00" "Vesteda Huur 01-03-2026"
send_payment "req-018" "19.40"  "Vitens Waterrekening 04-03-2026"
send_payment "req-019" "245.00" "Coolblue 08-03-2026"
send_payment "req-020" "156.00" "RDW Motorrijtuigenbelasting 12-03-2026"
send_payment "req-021" "52.00"  "Restaurant De Kas 15-03-2026"
send_payment "req-022" "43.20"  "Centraal Beheer Autoverzekering 18-03-2026"
send_payment "req-023" "21.60"  "DekaMarkt Supermarkt 22-03-2026"
send_payment "req-024" "109.00" "DUO Studielening Aflossing 28-03-2026"

echo ""
echo "=== Sending April 2026 transactions ==="
send_payment "req-025" "950.00" "Vesteda Huur 01-04-2026"
send_payment "req-026" "134.00" "Vattenfall Energie Voorschot 03-04-2026"
send_payment "req-027" "175.00" "Decathlon Rotterdam 07-04-2026"
send_payment "req-028" "47.00"  "Waterschap Hollandse Delta 11-04-2026"
send_payment "req-029" "28.50"  "Cafe de Jaren Amsterdam 16-04-2026"
send_payment "req-030" "59.99"  "Rituals Cosmetics 22-04-2026"

echo ""
echo "=== All 30 transactions sent! ==="