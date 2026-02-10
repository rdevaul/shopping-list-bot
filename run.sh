#!/bin/bash
# Run the shopping list bot stack

set -e

# Start backend
echo "Starting backend..."
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8200 &
BACKEND_PID=$!
cd ..

# Start bot
echo "Starting Telegram bot..."
cd bot
python telegram_bot.py &
BOT_PID=$!
cd ..

# Start mini-app dev server (optional, for development)
if [ "$1" = "--dev" ]; then
    echo "Starting mini-app dev server..."
    cd mini-app
    npm run dev &
    MINI_PID=$!
    cd ..
fi

echo "All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Bot PID: $BOT_PID"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $BOT_PID $MINI_PID 2>/dev/null" EXIT
wait
