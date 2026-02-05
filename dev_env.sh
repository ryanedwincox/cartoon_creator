# Development environment setup for cartoon_creator
# Usage: source dev_env.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/app/backend/venv"
REQUIREMENTS="$SCRIPT_DIR/app/backend/requirements.txt"

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Error: This script must be sourced, not executed."
    echo "Usage: source dev_env.sh"
    exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    echo "Installing dependencies..."
    pip install -r "$REQUIREMENTS"
else
    source "$VENV_DIR/bin/activate"
fi

echo "Virtual environment activated: $VENV_DIR"

# Source .env for API keys (e.g. GEMINI_API_KEY)
ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo "Loaded environment from .env"
else
    echo "Warning: No .env file found at $ENV_FILE"
fi

# Install frontend dependencies if needed
FRONTEND_DIR="$SCRIPT_DIR/app/frontend"
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
fi
