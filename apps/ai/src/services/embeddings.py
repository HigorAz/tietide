"""Sentence-transformers embedding wrapper with lazy model load."""

from __future__ import annotations

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    model_name: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    """Wraps sentence-transformers; loads the model lazily on first call."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self.model_name = model_name
        self._model = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._load()
        vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return [vector.tolist() for vector in vectors]

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading embedding model: %s", self.model_name)
            self._model = SentenceTransformer(self.model_name)
        return self._model
