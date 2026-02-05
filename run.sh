#!/bin/bash
# Launch both frontend and backend for Cartoons app

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Source dev environment (venv + API keys)
source "$SCRIPT_DIR/dev_env.sh"

# Function to cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend on http://localhost:8000..."
cd "$SCRIPT_DIR/app/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 2

# Start frontend
echo "Starting frontend on http://localhost:5173..."
cd "$SCRIPT_DIR/app/frontend"
npm run dev -- --host &
FRONTEND_PID=$!

echo ""
echo "============================================"
echo "  Cartoons App Running"
echo "============================================"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for either process to exit
wait
