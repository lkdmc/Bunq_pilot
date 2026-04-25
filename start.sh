#!/bin/bash

trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM

echo "[backend] starting uvicorn on :8000"
(cd backend && uvicorn main:app --reload --reload-include "*.env") &

echo "[frontend] starting vite on :5173"
(cd frontend && npm run dev) &

wait
