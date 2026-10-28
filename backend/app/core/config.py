from pydantic import AliasChoices, Field
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
    # OpenAI와 같은 형식의 채팅 API 주소. Ollama(로컬)는 http://localhost:11434/v1 이고 키가 없어도 된다
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 30.0  # 로컬 CPU 모델은 한 답에 수십 초가 걸려서 .env에서 늘린다
    # fastembed 임베딩 모델 이름. 비우면 벡터 검색을 끄고 공고 필드 검색만 쓴다.
    # 평가(docs의 RAG 결과보고서)로 고른 모델이다. 모델을 바꾸면 벡터 DB를 --force로 다시 만들고 기준값도 다시 정해야 한다
    rag_embedding_model: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    vector_db_path: str = ""  # 벡터 DB 저장 폴더. 비우면 backend/data/vectordb
    kakao_rest_api_key: str = ""  # 주소 → 좌표 (카카오 로컬) · 카카오 로그인 client_id로도 쓴다
    # 카카오 지도·로드뷰(브라우저용 JavaScript 키). 원래 화면에 공개되는 키이고, 카카오 개발자 콘솔에 등록한 도메인에서만 동작한다.
    # 비우면 공고 상세의 로드뷰를 쓰지 않는다.
    # .env에는 KAKAO_JAVASCRIPT_KEY 이름으로 넣는 게 기본이고, 예전에 넣은 Java_Script_KEY 이름도 읽는다
    kakao_javascript_key: str = Field(default="", validation_alias=AliasChoices("kakao_javascript_key", "java_script_key"))
    kakao_oauth_redirect_uri: str = "http://localhost:8000/auth/kakao/callback"
    naver_client_id: str = ""
    naver_client_secret: str = ""
    naver_oauth_redirect_uri: str = "http://localhost:8000/auth/naver/callback"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    # 통신3사 PASS 휴대폰번호 로그인 (developers.passlogin.com). URL은 발급 문서에 맞게 바꿀 수 있다
    pass_client_id: str = ""
    pass_client_secret: str = ""
    pass_oauth_redirect_uri: str = "http://localhost:8000/auth/pass/callback"
    pass_authorize_url: str = "https://id.passlogin.com/oauth2/v1/authorize"
    pass_token_url: str = "https://id.passlogin.com/oauth2/v1/token"
    pass_userinfo_url: str = "https://id.passlogin.com/oauth2/v1/userinfo"
    frontend_url: str = "http://localhost:3000"  # OAuth 후 돌아갈 프론트 주소
    oauth_state_secret: str = "change-me-in-production"
    odsay_api_key: str = ""  # 대중교통 경로 (ODsay LAB, 서버용 키)
    google_translate_api_key: str = ""  # 영어 화면에서 공고명·주소 등 서버 데이터 번역 (Google Cloud Translation, 서버용 키). 비우면 번역 안 함


settings = Settings()
