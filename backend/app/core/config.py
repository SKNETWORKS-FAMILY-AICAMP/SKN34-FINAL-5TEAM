from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 기반 설정. .env 파일에서 값을 읽어온다."""

    model_config = SettingsConfigDict(env_file=".env")

    app_env: str = "local"
    log_level: str = "INFO"  # DEBUG / INFO / WARNING / ERROR
    cors_origins: str = "http://localhost:3000"  # 브라우저에서 이 API를 부를 수 있는 주소 (쉼표로 구분)
    database_url: str = "postgresql+psycopg2://cheongyak:cheongyak@localhost:5432/cheongyak"
    applyhome_api_key: str = ""
    lh_api_key: str = ""  # LH API를 다른 공공데이터포털 계정에서 승인받았을 때. 비어 있으면 applyhome_api_key 사용
    fine_api_key: str = ""
    openai_api_key: str = ""
    # fastembed 임베딩 모델 이름. 비우면 벡터 검색을 끄고 공고 필드 검색만 쓴다.
    # 평가(docs의 RAG 결과보고서)로 고른 모델이다. 모델을 바꾸면 벡터 DB를 --force로 다시 만들고 기준값도 다시 정해야 한다
    rag_embedding_model: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    vector_db_path: str = ""  # 벡터 DB 저장 폴더. 비우면 backend/data/vectordb
    kakao_rest_api_key: str = ""  # 주소 → 좌표 (카카오 로컬)
    odsay_api_key: str = ""  # 대중교통 경로 (ODsay LAB, 서버용 키)


settings = Settings()
