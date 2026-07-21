# 프로젝트: KB AI Challenge — 금융 소비자 보호 에이전트

## 목표
금감원 분쟁조정 사례·해결기준·금소법을 지식그래프(Neo4j)로 구축하고,
사용자의 민원 상황을 입력받아 (1) 쟁점 분류 (2) 유사 사례 검색
(3) 근거 법조항 제시 (4) 예상 배상비율 범위 (5) 절차 안내를
그래프 경로 기반 근거와 함께 제공하는 서비스.
모든 답변은 그래프에서 추적 가능한 근거가 있어야 함(환각 방지가 핵심 차별점).

## 스택
- 데이터: Python 3.11 (requests, BeautifulSoup4, pyhwp)
- 그래프: Neo4j AuraDB (Cypher)
- LLM: Claude API (claude-sonnet-4-6), 구조화 추출은 JSON 출력 강제
- 백엔드: FastAPI / 프론트: React + Vite + Tailwind (예정)

## 데이터 소스
- 분쟁조정결정례/사례: fss.or.kr/fss/bbs/B0000390/list.do?menuNo=201193 (813건, pageIndex 페이지네이션)
- 분쟁해결기준: fss.or.kr/fss/job/fncCnflPrcdnt/list.do?menuNo=201194 (20건)
- 금소법/시행령: law.go.kr Open API (키는 .env의 LAW_API_KEY)

## 규칙
- - 크롤링: fss.or.kr은 WAF가 python-requests TLS 지문과 자기식별 UA를 차단함.
  반드시 curl_cffi (Chrome impersonation, 기본 UA 유지) 사용.
  요청 간 1.5초 이상 딜레이, 재시도 3회 제한 유지. 신규 수집 스크립트도 동일 방식.
- 파싱 실패 파일은 삭제하지 말고 data/failed/로 이동 + failures.log 기록
- 모든 스크립트는 재실행 가능하게(이미 받은 파일 스킵)
- 원본 파일명 유지, 메타데이터(게시글 번호/제목/권역/유형/등록일)는 별도 json으로