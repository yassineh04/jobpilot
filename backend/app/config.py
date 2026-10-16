from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://tracker:tracker@db:5432/tracker_db"
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FRONTEND_URL: str = "http://localhost:4300"

    # AI is optional and uses free providers through the OpenAI-compatible chat API:
    #   groq    free API key (console.groq.com), fast, good quality
    #   gemini  free API key (aistudio.google.com)
    #   ollama  fully local, no key: run the "local-ai" compose profile
    #   none    AI features disabled; everything else still works
    AI_PROVIDER: str = "none"
    AI_API_KEY: str = ""
    AI_MODEL: str = ""        # empty = provider default
    AI_BASE_URL: str = ""     # empty = provider default
    AI_TIMEOUT_SECONDS: float = 180.0

settings = Settings()
