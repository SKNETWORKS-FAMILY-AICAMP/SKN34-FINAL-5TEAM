from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 기반 설정. .env 파일에서 값을 읽어온다."""

    model_config = SettingsConfigDict(env_file=".env")

    app_env: str = "local"
    database_url: str = "postgresql+psycopg2://cheongyak:cheongyak@localhost:5432/cheongyak"
    applyhome_api_key: str = ""
    fine_api_key: str = ""
    openai_api_key: str = ""
    rag_embedding_model: str = ""
    kakao_rest_api_key: str = ""  # 주소 → 좌표 (카카오 로컬)
    odsay_api_key: str = ""  # 대중교통 경로 (ODsay LAB, 서버용 키)


settings = Settings()
