# 설계 초안 작업실 · 산출물 뷰어 (TEAM4_AGENT_FRONT)

FastAPI 백엔드(`TEAM4_AGENT/backend`)가 만든 산출물을 화면으로 보고 고치는 프런트엔드다. 백엔드와 별도 폴더로 두고 `/api/v1`로만 통신한다. 페이지가 둘이다.

| 주소 | 페이지 | 스타일 |
| --- | --- | --- |
| `/` (`index.html`, `src/app/`) | **설계 초안 작업실**: 로그인 · 홈 · 기능 명세서 · ERD(테이블 편집·전체 ERD) · 최종 산출물 · 산출물 보기(개요·요구사항·확인 질문·최종 ERD·DDL·추적·이슈·판단 기록·개발 스펙). 3단 화면(왼쪽 사용자·대시보드 / 가운데 / 오른쪽 진행 상황·버전·토큰) | Tailwind v4, [design-system/pages/workspace.md](design-system/pages/workspace.md) |
| `/viewer.html` (`src/main.tsx`) | 이전 산출물 뷰어. 같은 내용이 작업실 '산출물 보기'로 옮겨져 메뉴에서는 링크하지 않는다 (아래 '화면' 표는 이 뷰어 기준) | `src/styles.css`, [design-system/MASTER.md](design-system/MASTER.md) |

```bash
# 1) 백엔드 (다른 터미널): TEAM4_AGENT에서 DB를 띄운 뒤 backend에서 서버
docker compose up -d db                # 서비스 DB (PostgreSQL, TEAM4_AGENT/compose.yaml)
cd backend && uvicorn app.main:app --reload   # http://127.0.0.1:8000

# 2) 프론트
npm install
npm run dev                            # http://localhost:5173  (뷰어: /viewer.html)
```

개발 서버는 `/api` 요청을 로컬 FastAPI(`http://127.0.0.1:8000`)로 넘긴다 (`vite.config.ts`의 proxy).
백엔드 포트가 다르면 `.env.local`에 `VITE_API_PROXY`, 백엔드를 다른 주소에 두고 빌드하면 `VITE_API_BASE`에 API 전체 주소를 적는다 ([.env.example](.env.example)).

### 버전 번호 (단계별로 이어 붙임)

| 번호 | 단계 | 만드는 곳 |
| --- | --- | --- |
| `v1`, `v2` … | 기능 명세 초안 | 홈 '새 문서 분석' (`POST /runs` → `run --until function_designer`) |
| `v1.1`, `v1.2` … | 그 기능 명세로 만든 ERD | 기능 명세 '내보내기 → ERD 만들기', ERD '저장하고 새 버전 만들기' |
| `v1.3` (버전 기록 `stage: function_designer`) | 확인 질문 답을 LLM으로 반영한 기능 명세 (그 아래 `v1.3.1` ERD, `v1.3.1.1` 최종) | 기능 명세 오른쪽 위 'AI로 답 반영' (선택) |
| `v1.2.1` … (`stage: final`) | 그 ERD로 만든 최종본: 추적·의미 검토, API 설계·개발 스펙 9개 | ERD 화면 'ERD 최종 확정' (`POST /projects/review`) |

단계 화면의 오른쪽 '설계 버전'은 그 단계 번호만 보여준다. 예전 전체 실행(v1~v4)은 기능 명세와 ERD를 함께 만들어서, ERD 목록 끝에 '기능 명세와 함께 만든 초안'으로 나온다.

작업실이 하는 일 (이 브라우저에만 저장하는 것은 따로 적는다):
- **로그인**: 개발용. 어떤 이메일로도 들어가고 비밀번호는 저장하지 않는다 (`src/app/lib/session.ts`).
- **편집 저장**: 원본 design.json은 그대로 두고, 바뀐 기능·테이블·질문 답·확인 체크만 이 브라우저 localStorage에 저장한다 (`src/app/lib/draft.ts`).
- **ERD 저장하고 새 버전 만들기**: 고친 테이블·의견·제목을 `POST /api/v1/projects/versions`로 보내면 백엔드가 `rerun data_modeler`를 실행해 `v<기준>.N` 버전을 만든다 (Agent가 참조 정리·검증·DDL·보고서를 다시 만든다. 의견이 있거나 검토 단계에서 LLM을 부를 수 있다). 새 버전이 '설계 버전' 목록에 나오면 거기서 ERD를 확정한다.
- **새 문서 분석 (홈)**: 원본 문서·프로젝트 이름·사업 이름·DB 검증 여부를 `POST /runs`로 올린다. 백엔드가 기능 명세 초안까지 만들고 멈추면 그 버전이 열린다 (확인 질문은 추천안으로 가정).
- **확인 필요 (기능 명세 화면)**: 요구사항 확인(요구사항 질문·분류 `RC-…`·충돌 `CF-…`), 기능 명세 질문(`FQ-…`), **확인 필요 규칙**('(가정)' 한도를 넘어 추천안을 `(확인 필요)`로 남긴 규칙, 필수), 가정 규칙이 나온다. '남은 질문 추천안으로 답하기'로 질문을 한 번에 채울 수 있다. 확인 필요 규칙은 '추천안 맞음', 가정은 '가정 맞음'으로 표시한다. 데이터 설계(`DQ`)·기술 스택(`TQ`) 질문은 화면에서 답하지 않는다.
- **기능 명세 내보내기 → ERD 만들기**: 고친 기능 명세(design.json)를 `--design`으로 넘겨 ERD 새 버전을 만든다. 새로 답한 질문과 '추천안 맞음'으로 확인한 규칙(`confirm_rules`)은 백엔드가 LLM 없이 코드로 반영한다 (같은 답·확인한 규칙은 `(결정)` 표시, 다른 답은 그 규칙을 답으로). 진행 상황은 ERD 화면에 나오고 끝나면 새 ERD 버전이 열린다.
- **AI로 답 반영 (선택)**: 기능 명세 오른쪽 위. 답이 흐름·입력·데이터까지 바꿀 때 `rerun function_designer --answers`로 추천과 다른 답이 바꾼 기능만 LLM으로 다시 설계해 기능 명세 새 버전을 만든다 (확인한 규칙은 `--confirm-rules`로 함께).
- **ERD 최종 확정 (ERD 화면)**: `POST /projects/review`로 최종본 `v<ERD>.1`을 만든다. 백엔드가 추적 검토 → API 설계(바뀐 기능만) → 의미 검토를 하고 개발 스펙 9개를 쓴다. 끝나면 최종 산출물 화면이 열린다.
- **최종 확정하기 (최종 산출물 화면)**: 보고 있는 최종본을 확정했다고 표시한다. 단계 표시줄·산출물 보기 제목 옆에 '최종 확정됨'이 보인다 (이 브라우저에만 기록).
- **개발 스펙 (산출물 보기 → 개발 스펙)**: 최종본의 개발 AI용 문서 9개(AGENTS·PRD·ARCHITECTURE·DATABASE·API·openapi.yaml·ACCEPTANCE_CRITERIA·TASKS·DECISIONS)를 읽는 순서대로 보여 주고 복사·받기를 한다. '형식 정의 보기'는 `GET /spec-format`(백엔드 `SPEC_FORMAT.md`)이다. 기술 스택을 추천안으로 가정했으면 위에 표시한다. 최종본이 아닌 버전에서는 비어 있다.
- **산출물 파일 받기 (zip)**: 산출물 보기 제목 옆과 최종 산출물 화면 '산출물 파일'에 있다. 그 버전의 설계 산출물과 개발 스펙(있으면)을 `/file`로 받아 브라우저에서 `<프로젝트>_v<버전>_산출물.zip`으로 묶는다 (없는 파일은 뺀다).
- **최종 ERD** (최종 산출물 화면, 산출물 보기 탭): 이 버전에 저장된 데이터 모델의 관계도·테이블 지도. 산출물 보기 탭 아래 '테이블별 변경·설계 표준 검토'를 펼치면 이전 버전 대비 바뀐 컬럼, 사용자 수정·Agent 재설계(`meta.rework`), 설계 표준 준수(백엔드 `model_validator.py` 이슈 + 감사 컬럼·snake_case)와 DDL을 본다.
- **확정 여부·확인 체크·편집 초안**: 이 브라우저(localStorage)에만 남는다.
- **토큰 사용량**: 각 버전의 `review_report.md` 'LLM 사용량' 줄을 읽는다. 최종본은 최종 확정 단계(API 설계 + 의미 검토)에서 쓴 양이다.

- 산출물은 백엔드의 서비스 DB(PostgreSQL)에서 읽는다. 백엔드 `.env`(TEAM4_AGENT/.env)에 `DATABASE_URL`이 없으면 백엔드 `output/` 폴더를 읽는다.
- 주소(`#/<프로젝트>/<버전>/<탭>/<항목 ID>`)를 공유하면 같은 화면이 열린다.

## 화면

| 탭 | 내용 | 데이터 |
| --- | --- | --- |
| 개요 | 완료 조건 7개, 산출물 개수, DB 검증, 담당자가 확인할 지적, 버전을 만든 순서 | `design.json`, 버전 기록(`GET /projects`) |
| 요구사항 | 기능/비기능/수행 의무 필터, 원문 근거(형광펜 = 원문 인용, 물결 밑줄 = 원문에서 확인 안 됨), 검수 기준, 연결된 기능 | `requirements` |
| 확인 질문 | 질문·선택지·답변 상태 | `questions` |
| 기능 명세 | 원문 번호 단위로 묶은 기능, 입출력·업무 규칙('가정' 표시)·처리 순서·예외 | `functions` |
| 데이터 모델 | 테이블 정의, 선택한 테이블과 연결된 테이블 ERD, 전체 ERD | `data_model`, `erd.mmd` |
| DDL | PostgreSQL DDL과 복사 | `schema.sql` |
| 추적 | 요구사항 → 기능 → 테이블. 항목을 누르면 이어진 것만 표시, 연결 누락만 보기 | `trace_links` |
| 이슈 | 의미 검토 지적(근거·제안·확인 담당)과 규칙 검사 이슈 | `issues` |
| 판단 기록 | 조정 Agent가 단계마다 고른 행동·이유·결과 | `decisions` |

ID(요구사항·기능·테이블·이슈)를 누르면 해당 탭의 그 항목으로 이동한다.

## API (FastAPI `/api/v1`)

화면이 쓰는 경로와 응답은 백엔드 README(`TEAM4_AGENT/README.md`)의 API 표와 같다. 호출은 모두 [src/api.ts](src/api.ts)를 거친다 (주소 앞부분 `VITE_API_BASE`, 기본 `/api/v1`).

| 경로 | 화면에서 쓰는 곳 |
| --- | --- |
| `GET /projects` | 홈·버전 목록 |
| `GET /design` | 모든 단계 화면 |
| `GET·HEAD /file` | DDL·전체 ERD·개발 스펙 문서·산출물 파일 목록·zip 받기 |
| `GET /spec-format` | 개발 스펙 '형식 정의 보기' |
| `POST /runs` + `GET /jobs` | 홈 '새 문서 분석' |
| `POST /projects/review` + `GET /jobs` | ERD '최종 확정' → 최종본 |
| `POST /projects/title` | 버전 제목 |
| `POST /projects/versions` + `GET /jobs` | 기능 명세 '내보내기 → ERD 만들기'·'AI로 답 반영', ERD '저장하고 새 버전 만들기' (`answers`·`confirm_rules`) |
| `GET /capabilities` | 기능 명세 수정본·추천안 확인 규칙을 넘길 수 있는지 |

오류 응답은 `{ "detail": "..." }`이다. 화면이 쓰는 타입은 [src/types.ts](src/types.ts)이고, 원본 계약은 백엔드 `app/schemas/`(기능별: requirement·function·data_model·review·version)다. 스키마가 바뀌면 같이 맞춘다.

## 구조

```
src/api.ts            API 호출 (VITE_API_BASE)
src/types.ts          design.json 타입
src/app/              설계 초안 작업실 (pages: 홈·기능 명세·ERD·최종 산출물·산출물 보기·개발 스펙, lib: 초안·확인 항목·작업·라우팅)
src/labels.ts         코드값 → 화면 표기 (보고서와 같은 말)
src/context.tsx       보고 있는 설계·탭 이동·추적 관계 색인
src/App.tsx           프로젝트·버전 선택, 탭, 주소(#) 처리
src/views/            탭별 화면
src/components/       공통 조각, Mermaid ERD
src/styles.css        화면 스타일. 색·글자·간격 토큰은 :root
design-system/        디자인 기준 (MASTER.md). 화면을 고치거나 새로 만들 때 먼저 본다
```
