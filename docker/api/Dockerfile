# ==============================================================================
# Midas — FastAPI Gateway & Telemetry SSE Hub Container
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install minimal OS dependencies for health checking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY src/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code tree
COPY src /app/src

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
