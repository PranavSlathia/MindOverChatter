FROM python:3.11-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Install dependencies
RUN uv sync --frozen --no-dev

# Pre-download the bge-m3 embedding model to avoid cold start latency.
# The model is cached in /app/models via the model-cache volume at runtime,
# but this build step ensures the HuggingFace hub tooling works and the
# model is baked into the image layer.
ENV HF_HOME=/app/models
RUN uv run python -c "\
from sentence_transformers import SentenceTransformer; \
model = SentenceTransformer('BAAI/bge-m3'); \
print(f'Model downloaded: {model.get_sentence_embedding_dimension()} dims')"

# Copy application
COPY . .

EXPOSE 8004

# Point HF_HOME to the volume mount so the model cache persists across rebuilds
ENV HF_HOME=/app/models

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
