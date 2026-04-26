"""Singleton service state — warm-up status and demo cache shared across requests."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from src.services.demo_cache import DemoDocumentationCache


@dataclass
class ServiceState:
    warmed_up: bool = False
    warmup_error: str | None = None
    demo_cache: DemoDocumentationCache = field(default_factory=DemoDocumentationCache)


@lru_cache(maxsize=1)
def get_service_state() -> ServiceState:
    return ServiceState()
