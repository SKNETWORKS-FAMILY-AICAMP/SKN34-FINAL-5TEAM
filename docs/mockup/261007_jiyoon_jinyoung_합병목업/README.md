# jiyoon + jinyoung 목업 합병 버전 (2026-10-07)

- 온라인 보기(클릭해서 흐름 체험): https://claude.ai/artifact/Gn3zDBajwyYg7MWg8csTR6
  - 화면을 고르고 Play(▶)를 누르면 버튼·메뉴로 화면 이동 가능
- 정리 문서: `docs/261007_10_청약플랫폼_목업_합병_정리.pdf`

## 사용자 흐름
랜딩(HomeB) → 홈 6단계 진단(Home) → 결과 미리보기(일부 잠금) → 로그인 → **내 맞춤 대시보드(MyHome)** → 공고 AI 분석 / AI 청약 상담 / AI 전략 리포트

## 화면 파일 (`project/`)
| 파일 | 화면 | 출처 |
|---|---|---|
| Home.dc.html | ⓪ 홈 · 6단계 진단 → 결과 미리보기 → 로그인 | jiyoon 목업 (feat/frontend 반영분) |
| HomeB.dc.html | ⓪-B 랜딩형 홈 대안 | 신규 (Monarch 레이아웃 참고) |
| MyHome.dc.html | ⑤ 로그인 후 내 맞춤 대시보드 | **합병** — jinyoung 대시보드·퀵메뉴·공고카드 + jiyoon 디자인·AI 판정 |
| AIChat.dc.html | ② AI 청약 상담 (RAG) | jiyoon 목업 |
| NoticeAI.dc.html | ③ AI 공고문 분석 | jiyoon 목업 |
| AgentReport.dc.html | ④ 멀티 에이전트 전략 리포트 | jiyoon 목업 |
| Main.dc.html | (이전안) 한 페이지 진단 | jiyoon 목업 초안 |
| canvas.json | 캔버스 배치 정보 | — |

`hero-apartments-clean.jpg`: 배경 사진 (Unsplash 무료 라이선스, 건물 브랜드 로고 제거). 파일 안에서는 `/_blob/...` 주소로 참조함.

## 참고
- `.dc.html`은 디자인 캔버스 전용 형식이라 브라우저에서 단독으로 열리지 않음 → 보기는 위 링크로.
- "(예시)" 공고, 출퇴근 시간, 내 위치(상/중/하), 평균 가점 31점·당첨선 52점, 공고문 인용 문구, `[ ]` 값은 예시/자리표시.
