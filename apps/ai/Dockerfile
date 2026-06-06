# syntax=docker/dockerfile:1.7
# ---- Builder stage ---------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ai/requirements.txt ./requirements.txt
# Install the CPU-only torch build BEFORE the rest so sentence-transformers does
# not pull the multi-GB CUDA wheels (nvidia-*/cuda-*). The service only uses
# torch for CPU embeddings (all-MiniLM-L6-v2); the LLM runs in Ollama. This keeps
# the image ~1GB instead of ~9GB and, crucially, lets the image build fit on CI
# runners — the CUDA build exhausted the runner disk and the build was killed.
RUN python -m venv /venv \
    && /venv/bin/pip install --upgrade pip \
    && /venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch \
    && /venv/bin/pip install -r requirements.txt

# ---- Runtime stage ---------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/venv/bin:$PATH \
    AI_PORT=8000 \
    HF_HOME=/app/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/sentence-transformers

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system tietide \
    && useradd --system --gid tietide --uid 1001 --home /app tietide \
    && mkdir -p /app/.cache \
    && chown -R tietide:tietide /app

WORKDIR /app

COPY --from=builder /venv /venv
COPY --chown=tietide:tietide apps/ai/src ./src
COPY --chown=tietide:tietide apps/ai/pyproject.toml ./pyproject.toml

USER tietide

# The sentence-transformers embedding model (all-MiniLM-L6-v2) downloads on first
# use into HF_HOME / SENTENCE_TRANSFORMERS_HOME, which point at the tietide-owned
# /app/.cache (created above). That writable cache is the actual fix for the
# original PermissionError: '/app/.cache' — the non-root user could not create
# the default HF cache. We deliberately do NOT prefetch the model at build time:
# that made the image build depend on a slow, rate-limited HuggingFace download
# in CI. The first request pays a one-off download, hidden by the background
# warm-up in the lifespan.

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl --fail http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
