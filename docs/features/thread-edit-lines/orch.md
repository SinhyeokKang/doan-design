# 스레드 편집 줄 수 — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)

- 시작 해시: `051122061` (feat/thread-edit-lines, lead가 develop에서 만들었다)
- 통합 브랜치: `feat/thread-edit-lines`
- PR 대상: develop
- 모델 경계: Claude만 쓴다(교차 허가 없음).
- 함께 도는 conductor: feat/scrollbar-hover. 공유 파일은 `docs/DESIGN.md`뿐이다. 충돌하면 develop의 글을 두고 이쪽 글을 더한다.

## 결정 로그

| # | 질문 | 답 | 출처 |
|---|---|---|---|
| 1 | T0 녹화 실행 명령 | 직접 probe 스크립트. `node .scratch/thread-edit-lines/record.mjs --provider <p> --cli <path> --case <cases>`로 runners.ts와 같은 방식(Claude Agent SDK `query`, `codex app-server` JSON-RPC, ACP stdio)으로 provider를 띄운다. 임시 홈에 로그인을 복제하고, 임시 저장소의 `git diff --numstat`과 센 줄 수를 비교한다. 원시 프레임은 `.scratch/thread-edit-lines/out/`에 둔다. | 사용자 |
| 2 | T0 대상 버전 | Claude Code 2.1.284(`~/code/doan-design/.scratch/context-window-ring/old/claude`)와 설치된 2.1.332, Codex 0.158.0(같은 old prefix)과 0.171.0, Copilot 1.0.89(old prefix)와 1.0.114, Cursor 설치본(2026.11.22), Antigravity 설치본 | conductor 판단 — tasks.md T0와 `minimumVersions.ts` |
| 3 | T4 드래프트 | 이미 확정했다(2026-11-25, 사용자). 이 run에서는 배치를 만들지 않는다. | design.md '드래프트 요청' |
| 4 | T6 승격 | conductor가 직접 한다(§4·§5 문서 커밋). | orchestrate 스킬 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T0 PoC | `.scratch/thread-edit-lines/`, `app/src/main/conversation/fixtures/`(새 녹화 파일과 README 항목), `docs/features/thread-edit-lines/{spec,design}.md`, `docs/BACKLOG.md`(빠진 provider) | 없음 | Opus high — 실제 계정 복제·정리와 5개 provider의 프로토콜 판단이 필요하고, 틀리면 실제 로그인이 깨지거나 범위가 잘못 정해진다 | 각 provider 통과 기준(tasks.md T0), 복제본 삭제 확인, `npm --prefix app test`(픽스처만 추가) | 대기 |
| B | T1 형식, T2 순수 함수 | `types.ts`, `store.ts`, 새 `activityResult.test.ts`, 새 줄 수 모듈과 테스트(main `editLines.ts`, renderer 표시 함수) | 없음(T2의 녹화 입력은 A 뒤 deferred) | Opus medium — 히스토리 호환과 Myers 상한은 판단이 필요하지만 범위가 좁다 | `npm --prefix app test`, typecheck, lint | 대기 |
| C | T3 정규화 | `transport.ts`, `acp.ts`, `transport.test.ts`, `acp.test.ts`, `service.*.test.ts` | A, B | Opus high — 세 provider 정규화와 저장 실패 시 턴 종료 경로가 걸려 있다 | `npm --prefix app test`, typecheck, lint | 대기 |
| D | T5 renderer | `threadItems.ts`, `turnStatus.ts`, `ConversationThread.tsx`, `styles.css`, 관련 테스트, `state.test.ts`·`summary.test.ts`·새 `seenEvents.test.ts`, `docs/design/conversation.md`, `docs/DESIGN.md` | B (`/runtime-test`는 C 뒤 deferred) | Opus medium — 구조로 바뀌는 머리와 `/design-sync` 측정 | `npm --prefix app test`, typecheck, lint, `/design-sync`, `/runtime-test` | 대기 |
| T6 | 승격과 정리 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/thread-edit-lines/` 삭제 | A–D | conductor | `verify.mjs`, `docs/features/` 참조 없음 | 대기 |

리뷰 워커: B·C·D 각각 `/code-review`를 독립 워커로 돌린다(Opus medium, 보고만).

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬이다.
- C는 A·B를 통합한 뒤 시작한다(녹화 프레임과 형식·세기 함수가 모두 필요하다).
- D는 B를 통합한 뒤 시작하고 C와 병렬이다(main 정규화와 renderer는 겹치지 않는다). D의 `/runtime-test`는 C 통합 뒤 deferred 항목으로 보낸다.
- `docs/BACKLOG.md`는 A가 쓰고, T6에서 conductor가 마무리한다(A가 끝난 뒤라 겹치지 않는다).

## 체크박스 대응

T0 → A, T1·T2 → B, T3 → C, T4 → 완료(결정 3), T5 → D, T6 → conductor.

## 검증 기록

(통합 때 적는다)
