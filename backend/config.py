import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Server Network Settings
    # SERVER_HOST is the externally accessible IP (e.g. 192.168.1.2 or new network IP)
    SERVER_HOST: str = "192.168.1.2"
    SERVER_PORT: int = 8000
    # SERVER_BIND_HOST is the interface Uvicorn binds to (0.0.0.0 enables LAN access)
    SERVER_BIND_HOST: str = "0.0.0.0"

    # LLM Settings
    LLM_PROVIDER: str = "ollama"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "llama3.2"
    LLM_BASE_URL: str = "http://127.0.0.1:11434/v1"

    # Storage Settings
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'chat.db'}"

    @property
    def public_url(self) -> str:
        return f"http://{self.SERVER_HOST}:{self.SERVER_PORT}"

def get_settings() -> Settings:
    return Settings()

settings = get_settings()

