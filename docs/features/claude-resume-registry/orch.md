# claude-resume-registry — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 해시: `b355b3bb` (origin/develop)
- 통합 브랜치: `feat/claude-resume-registry` (lead가 만들어 체크아웃함)
- 작업자: Claude만 쓴다. 모델 계열을 넘는 허가는 없다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | UI 초안(`/design-draft`)은 그리지 않는다. | 지휘자 판단 — 화면 구성이 바뀌지 않고 기존 알림의 문장만 바뀐다(design.md '디자인 프리셋'). |
| D2 | 작업 1은 확인하지 않는다. `workspace_changed` 문구는 방법을 단정하지 않는 쪽으로 정한다: "This conversation’s session belongs to another organization of your Claude Code account, so it can’t continue here. To continue it, sign in to the organization this conversation started in." | 사용자 답(조직이 여러 개인 계정으로 확인하지 못함). design.md §2. clarify 프리셋으로 확인함: 무엇이 실패했는지와 회복 방법을 말하고, 시스템이 모르는 방법은 단정하지 않는다. |
| D3 | 작업 4 PoC는 사용자가 데스크톱 앱 Code 세션을 연 상태에서 지휘자가 읽기 전용 probe로 직접 돌린다. | 사용자 답. probe는 `io.ts` `claudeOccupancy`의 검사 순서와 대조해 검토함(지휘자). |
| D4 | 조직 트랙(BA)은 PoC를 기다리지 않고 바로 시작한다. | lead 지시, design.md '작업 트랙'. |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| BA | 작업 2, 3 (조직 트랙, "elsewhere" 문구) | `app/src/main/conversation/prepare.ts`·`prepare.test.ts`·`ipc.ts`(+`ipc.test.ts`), `app/src/main/agentAuth/connection.ts`·`connection.test.ts`(필요할 때), `app/src/renderer/dockedRules.ts`·`dockedRules.test.ts`·`canvasConversation.test.ts`, `app/src/main/conversation/drafts.test.ts` | 없음 | Sonnet high — 명세가 문구와 분기까지 정해 둔 기계적 변경이고, 틀려도 안전이 아니라 안내 문구가 틀린다. | `npm --prefix app test`, `typecheck`, `lint` | 대기 |
| P4 | 작업 4 (PoC) | `design.md`만 | 사용자가 데스크톱 세션을 엶 | 지휘자 직접 — 사람의 조작과 실제 프로필 읽기가 필요하다. | probe 출력에 기록마다 걸린 단계 | 대기 |
| BR | 작업 5, 6 (레지스트리 판정) | `app/src/main/conversation/io.ts`·`io.test.ts`, `app/src/main/conversation/sessions.ts`·`sessions.test.ts` | P4 | Opus high — 틀리면 한 세션에 두 작성자가 붙는다(POSTMORTEM 2026-10-28). | `npm --prefix app test`, `typecheck`, `lint` | 대기 |
| RA / RR | BA·BR 독립 리뷰 (`/code-review`) | 보고만 | 해당 배치 | RA Sonnet high, RR Opus high — 구현 배치와 같은 난이도 판단. | 리뷰 보고서 | 대기 |
| T7 | 작업 7 (`/runtime-test`) | `.scratch/`만 | BA, BR 통합 | Sonnet high — 정해진 절차의 격리 실행이다. | 보고서와 스크린샷 | 대기 |
| D8 | 작업 8 (승격과 정리) | `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/BACKLOG.md`, `docs/features/claude-resume-registry/` | 전부 | 지휘자 직접 — 문서 신선도 커밋이다. | tasks.md 작업 8의 grep | 대기 |

작업 1은 D2로 닫는다(design.md §2에 결과를 적는 것은 BA 착수 전 지휘자가 한다).

## 파일 겹침과 순서

- BA와 BR은 파일이 겹치지 않으므로 병렬로 돈다. BR은 P4가 끝난 뒤 시작한다.
- T7은 두 배치를 통합한 `feat/claude-resume-registry`에서 돈다.
- D8은 T7 뒤에 한다.
