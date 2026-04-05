from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_collection: str = "tietide_docs"
    embedding_model: str = "all-MiniLM-L6-v2"
    log_level: str = "info"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
