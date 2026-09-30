from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 기반 설정. .env 파일에서 값을 읽어온다."""

    model_config = SettingsConfigDict(env_file=".env")

    app_env: str = "local"
    database_url: str = "postgresql+psycopg2://cheongyak:cheongyak@localhost:5432/cheongyak"
    applyhome_api_key: str = ""
    lh_api_key: str = ""  # LH API를 다른 공공데이터포털 계정에서 승인받았을 때. 비어 있으면 applyhome_api_key 사용
    fine_api_key: str = ""


settings = Settings()
