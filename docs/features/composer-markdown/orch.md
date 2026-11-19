# composer Markdown — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261119-1](../chain-261119-1/chain.md) 링크 1
- 시작 해시: `2b11f18cd` (origin/develop `d4ea3e499`은 체인 파일만 바꿨다)
- 통합 브랜치: `feat/composer-markdown` (리드가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- conductor: Claude Code (Opus 5.5)

## 결정 기록

- 완료 조건 7(한글 IME): `/runtime-test` 때 사용자가 실제 앱에서 직접 확인한다. 확인하지 못하면 BACKLOG 'Not verified in the real app'에 남긴다(체인 '인계 기록' 시작 점검 1).
- ⌘←로 기호 앞에 입력하면 목록이 풀리는 동작은 그대로 둔다(시작 점검 2).
- 로그인 프로필은 로그아웃하거나 지우지 않는다(시작 점검 5).
- 순수 함수 파일 위치: conductor 재량 — `listLines`·`continueList`·`indentItem`·`removeMarker`·`bubbleBlocks`·`trimBlankLines`는 새 renderer 모듈에, `fieldRuns`는 `skillWords.ts`에, `plainTitle`은 design대로 `messageText.ts`에 둔다. 근거: design '순수 함수로 분리할 부분'.
- 배치 순서: conductor 재량 — 순수 함수(A)를 먼저 통합한 뒤 입력창(B)과 전송·버블(C)을 병렬로 돌린다. `styles.css`는 B가 가진다. C의 버블 CSS는 B 통합 뒤 C에 새 Task로 보낸다(보류 항목). 근거: 파일 겹침 규칙(`/orchestrate` §0 4).
- A는 리뷰 전에 통합했다: conductor 재량 — 게이트가 통과했고 B·C가 A를 기다리지 않게 하려고. A-rev 결과의 고칠 점은 A 워커가 새 커밋으로 고치고, 최종 리뷰·verify 전에 통합한다.
- Codex 모델: `gpt-6.2-astra` — `$CODEX_HOME/models_cache.json`의 가장 새 Astra.
- `/runtime-test`(tasks 9)와 최종 `/verify`(tasks 10), 승격(tasks 11)은 conductor가 한다. IME 확인에 사용자가 필요하고, 승격은 문서 커밋이다.

## Codex 사용

- 2026-11-19 17:57 확인(`$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 11% 사용, 5시간 창 60% 사용(19:36 초기화). 사용할 수 있다.
- Codex는 독립 리뷰에 쓴다(교차 계열 리뷰가 실제 결함을 잡아 왔다). 구현 배치는 Claude가 맡는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 3, 4 | 새 renderer 모듈(목록 순수 함수)과 테스트, `skillWords.ts`(+test), `messageText.ts`의 `plainTitle`(+test) | 없음 | Opus high — CommonMark 깊이 규칙과 칩이 섞인 segment 위 캐럿 편집이 B·C 전체의 기반이다 | `npm --prefix app test`, typecheck | 통합 `4cab90fa4`·`02617b8ae` (워커 `cm-a`, 507 files / 14,722 tests PASS) |
| A-rev | A 리뷰 | 없음(보고만) | A | Codex Astra medium — 교차 계열 독립 리뷰, 순수 함수라 범위가 좁다 | `/code-review` 보고 | 진행 (`gpt-6.2-astra` medium, `cm-a`에서) |
| B | tasks 5 | `chipField.ts`(+test), `ComposerParts.tsx`(+test), `styles.css`, 네 composer 공유 고정 테스트 | A | Opus high — contenteditable 캐럿·undo·IME 조합, PoC 5가지 처리 | test, typecheck, lint | 진행 (`cm-b`) |
| B-rev | B 리뷰 | 없음 | B | Codex Astra high — 여러 컴포넌트에 걸친 입력 처리, 실수하면 입력이 깨진다 | `/code-review` 보고 | 대기 |
| C | tasks 6, 7 | `homeComposer.ts`(`composeRequest`), `messageText.ts`(`messageLine` 연결), `ConversationThread.tsx`(`UserMessage`)와 테스트, 큐·초안 복원 테스트(프로토타입 포함). 버블 CSS는 보류 항목 | A | Opus medium — 명세가 구체적이고 영향 범위가 B보다 좁다 | test, typecheck, lint | 진행 (`cm-c`) |
| C-rev | C 리뷰 | 없음 | C | Codex Astra medium — 교차 계열 독립 리뷰 | `/code-review` 보고 | 대기 |
| D | tasks 8 | `styles.css` 측정 수정, `docs/design/conversation.md`, `docs/design/canvas-conversation.md`, 회귀 테스트 | B, C 통합 | Opus medium — 측정 절차가 정해진 작업 | `/design-sync` 기록 | 대기 |
| conductor | tasks 9, 10, 11 | BACKLOG, PRODUCT, ARCHITECTURE, DESIGN 색인, feature 디렉터리 삭제 | D | — | `/runtime-test`, verify, grep | 대기 |

## 파일 겹침과 순서

- A → (B ∥ C) → C 보류 항목(버블 CSS) → D → conductor.
- B와 C는 `styles.css`만 겹칠 수 있다. B가 가진다. `messageText.ts`는 A(`plainTitle`)와 C(`messageLine`)가 바꾸지만 A 통합 뒤에 C가 시작한다.
