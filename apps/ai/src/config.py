from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_collection: str = "tietide_docs"
    embedding_model: str = "all-MiniLM-L6-v2"
    log_level: str = "info"
    # Shared secret the API must present (X-Internal-Token) to call this service.
    # Empty disables the check — acceptable only in local dev/tests; production
    # must set it. The API sends the same value from INTERNAL_AI_TOKEN.
    internal_ai_token: str = ""
    # Cap on the JSON-serialized definition for /generate-docs, to bound
    # prompt-injection blast radius and memory use (W2.6).
    max_definition_bytes: int = 100_000
    # Constrain Ollama decoding to the documentation JSON schema (Ollama >= 0.5).
    # Guarantees the exact section shape and removes parse-failure 502s. Disable
    # if the deployed Ollama is older — generation falls back to format="json".
    ollama_structured_output: bool = True

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
