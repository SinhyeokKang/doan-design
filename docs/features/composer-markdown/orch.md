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
- A-rev(🔴 0, 🟡 5, 🟢 1, 보고서 `.scratch/review-A.md`): 🟡1~4와 🟢는 A 워커가 고친다(고침 1차).
  - 🟡5(캐럿이 기호 앞일 때 Shift+Enter는 평소 줄바꿈): 그대로 둔다. conductor 재량 — 기호 앞 위치는 텍스트 모델대로 둔다는 시작 점검 2와 같은 원칙이고, 아래 항목은 그대로 남는다.
  - Tab·Shift+Tab이 자손을 함께 옮기고 번호를 같은 깊이 앞 항목 + 1(없으면 1)로 다시 쓰는 동작: 유지한다. conductor 재량 — 새 하위 목록은 1부터라는 spec 2와 맞고, 내어쓴 뒤에도 번호가 이어진다.
  - 탭 문자 폭: 다음 4열 경계까지로 센다(CommonMark §2.2). 승격 때 ARCHITECTURE에 그렇게 적는다.
- C 측정(Electron): 초안의 버블 grid/subgrid CSS는 복사를 깨뜨린다(`- \na`, 9/9 실패). inline-block 배치는 9/9 원문과 같다. 버블 CSS 보류 항목은 grid 없이 쓰고, 한 목록 안 본문을 가장 넓은 기호에 맞추는 초안 동작은 다른 방법으로 맞추거나 편차로 기록한다.
- B 측정: Electron 45에서 contenteditable의 Ctrl+Tab은 스스로 포커스를 옮기지 않는다. 그래서 `ComposerField`가 직접 옮긴다(`moveFocus`). 실제 앱의 포커스 순서는 `/runtime-test`에서 확인한다.
- B: 조합 중 Shift+Enter·Tab은 하나만 보류하고 compositionend 뒤에 처리한다. macOS가 키를 다시 보내는 시점에 기대므로 사용자의 실제 IME 확인이 필요하다.
- C의 버블 CSS 보류 항목과 C-rev 고칠 점은 C-rev가 끝난 뒤 한 번에 C에 보낸다(C는 먼저 `feat/composer-markdown`으로 rebase한다).
- C-rev(🔴1 🟡3, `.scratch/review-C.md`): 🔴 `- /compact` 목록 메시지가 표시 문구 때문에 명령으로 분류된다. 🟡1·2 Overview 큐 행·임시 제목에 기호가 남는다. 🟡3 실제 선택 복사 검증 범위가 좁다. C 2차에서 고친다.
  - 리뷰어의 사용자 결정 항목(칩이 든 메시지의 복사 기준): conductor 재량 — spec 9의 "보낸 원문과 같다"는 목록 기호와 깊이 공백에 대한 말이다. 칩은 지금처럼 이름으로 보이고 복사된다. 승격 때 이 기준을 문장으로 분명히 쓴다.
- `styles.css` 소유: B 통합 뒤 C 2차(버블 CSS)로 넘겼다. B-rev 고칠 점에 `styles.css`가 있으면 C 2차가 끝난 뒤 보낸다.
- B-rev(🔴1 🟡3, `.scratch/review-B.md`): 🔴 실제 ⌘C를 보내는 DOM 테스트가 사용자의 macOS 클립보드를 덮어썼다(한 번 실제로 덮어씀, 복원 불가). 🟡1 조합 중 보류 키가 서로 덮어쓰고, 재전달 키의 중복 판정이 타이머 순서에 기댄다. 🟡2 읽기 전용 전환·unmount 뒤에도 보류한 줄바꿈이 초안을 바꿀 수 있다. 🟡3 Ctrl+Tab이 포커스를 받을 수 없는 후보에서 멈춘다. B 고침 1차에서 고친다(`styles.css`는 건드리지 않는다).
- C 2차: Electron 복사·배치 probe 86/86 PASS(`.scratch/handoff-C.md` Round 2). 칩은 `inline-flex`라 Chromium이 칩 이름을 따로 한 줄로 복사한다(목록이 없어도 같은, 이전부터의 동작). 범위 밖이라 그대로 두고 PR 본문에 적는다. Overview 큐 행도 캔버스 패널처럼 칩을 이름으로 보인다(`messageLine` 공유의 결과).
- 초안 편차 후보(D가 기록): 3자리 번호 목록의 기호 열이 초안보다 1~2.5px 넓다. 버블 배치가 grid가 아니라 inline-block이다.
- Codex 재검토 재시작이 update prompt로 막혔다(`orchestration send` 재열기). 같은 모델로 새 `worker-start`를 띄웠다.
- B 고침 1차: 보류 키를 누름마다 줄에 쌓고 keyup으로 중복을 가린다. 가정한 IME 순서 6가지는 `.scratch/handoff-B.md` 'Fix round 1'에 있다. `/runtime-test`에서 사용자가 macOS 한글 IME로 확인한다.
- `/runtime-test`(tasks 9)와 최종 `/verify`(tasks 10), 승격(tasks 11)은 conductor가 한다. IME 확인에 사용자가 필요하고, 승격은 문서 커밋이다.

## Codex 사용

- 2026-11-19 17:57 확인(`$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 11% 사용, 5시간 창 60% 사용(19:36 초기화). 사용할 수 있다.
- Codex는 독립 리뷰에 쓴다(교차 계열 리뷰가 실제 결함을 잡아 왔다). 구현 배치는 Claude가 맡는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 3, 4 | 새 renderer 모듈(목록 순수 함수)과 테스트, `skillWords.ts`(+test), `messageText.ts`의 `plainTitle`(+test) | 없음 | Opus high — CommonMark 깊이 규칙과 칩이 섞인 segment 위 캐럿 편집이 B·C 전체의 기반이다 | `npm --prefix app test`, typecheck | 통합 `4cab90fa4`·`02617b8ae` (워커 `cm-a`, 507 files / 14,722 tests PASS) |
| A-rev | A 리뷰 | 없음(보고만) | A | Codex Astra medium — 교차 계열 독립 리뷰, 순수 함수라 범위가 좁다 | `/code-review` 보고 | 1차 🔴0 🟡5 🟢1 → 고침 1차 `8977347c2`·`ef7b29d05` → 2차 🟡1(기호 뒤 탭) → 고침 2차 `a7e99a99f`·`ebb069dff`(conductor가 diff 확인) |
| B | tasks 5 | `chipField.ts`(+test), `ComposerParts.tsx`(+test), `styles.css`, 네 composer 공유 고정 테스트 | A | Opus high — contenteditable 캐럿·undo·IME 조합, PoC 5가지 처리 | test, typecheck, lint | 통합 `d35bf1952`·`e285dc591`(통합 HEAD 관련 테스트 29 files / 725 PASS) |
| B-rev | B 리뷰 | 없음 | B | Codex Astra high — 여러 컴포넌트에 걸친 입력 처리, 실수하면 입력이 깨진다 | `/code-review` 보고 | 1차 🔴1 🟡3 → 고침 1차 `71c2c6964`·`3594ead49`·`d2a3ae2c9` 통합 → 재검토 진행 |
| C | tasks 6, 7 | `homeComposer.ts`(`composeRequest`), `messageText.ts`(`messageLine` 연결), `ConversationThread.tsx`(`UserMessage`)와 테스트, 큐·초안 복원 테스트(프로토타입 포함). 버블 CSS는 보류 항목 | A | Opus medium — 명세가 구체적이고 영향 범위가 B보다 좁다 | test, typecheck, lint | 통합 `79e67ad86`·`1be729481`(통합 HEAD 관련 테스트 23 files / 762 PASS). 버블 CSS 보류 |
| C-rev | C 리뷰 | 없음 | C | Codex Astra medium — 교차 계열 독립 리뷰 | `/code-review` 보고 | 1차 🔴1 🟡3 → C 2차 통합 → 재검토 🔴1(명령과 같은 이름의 스킬, 이전부터의 결함) 🟡1(깊은 중첩 본문 폭 0) → C 3차 진행 |
| D | tasks 8 | `styles.css` 측정 수정, `docs/design/conversation.md`, `docs/design/canvas-conversation.md`, 회귀 테스트 | B, C 통합 | Opus medium — 측정 절차가 정해진 작업 | `/design-sync` 기록 | 대기 |
| conductor | tasks 9, 10, 11 | BACKLOG, PRODUCT, ARCHITECTURE, DESIGN 색인, feature 디렉터리 삭제 | D | — | `/runtime-test`, verify, grep | 대기 |

## 파일 겹침과 순서

- A → (B ∥ C) → C 보류 항목(버블 CSS) → D → conductor.
- B와 C는 `styles.css`만 겹칠 수 있다. B가 가진다. `messageText.ts`는 A(`plainTitle`)와 C(`messageLine`)가 바꾸지만 A 통합 뒤에 C가 시작한다.
