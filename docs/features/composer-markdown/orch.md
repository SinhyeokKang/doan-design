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
- B 재검토(Round 2): 보류 키 처리의 경계 결함 3건. 가정을 더 쌓지 않고 실제 순서를 쟀다: 사용자가 macOS 한글 IME로 Electron 45 이벤트 기록 창에 입력했다(`.scratch/runtime-test/ime-events/events-macos-korean.log`). Shift+Enter·Tab·Enter 모두 같은 순서다: 조합 중 keydown(229) → 같은 음절 확정 → compositionend → 즉시 합성 keyup → 같은 키 keydown 재전달(조합 아님) → (Enter면) insertLineBreak/insertParagraph → compositionend의 0ms 타이머 → 실제 keyup. 조합 중에는 insertLineBreak가 오지 않는다. 지금 코드는 Tab을 두 번 들여쓴다(합성 keyup이 보류를 풀고, 재전달과 타이머가 각각 실행). B 고침 2차: 조합 중 키는 기억만 하고 재전달된 키에서 편집한다. 재전달이 없으면 타이머에서 한 번 한다.
- C 3차: 깊은 중첩 버블의 그린 들여쓰기는 4단계에서 멈춘다(편차 3, D가 기록).
- 한글 IME 확인 방식(사용자 결정): `/runtime-test`에서 conductor가 `orca computer --restore-window`(앞으로 가져오는 방식)로 자판 키를 보내 확인한다. 이 방식은 조합이 유지되고 이벤트 순서가 사람의 입력과 같았다(`.scratch/runtime-test/ime-events/events-computer-use-foreground.log`). 백그라운드 전달은 키마다 포커스를 잃어 조합이 끊긴다. 키마다 `delivery`를 확인하고, 막히면 건너뛰지 않고 사용자에게 턴을 넘긴다.
- `/runtime-test` 1차(로그인 프로필, 이 워크트리 빌드, CDP + `orca computer --restore-window`, `.scratch/runtime-test/cm/`):
  - 네 composer(Home, Overview, 캔버스 패널, 프로토타입 창)에서 목록 키 동작 18개씩 PASS(72/72): •·번호 그리기, Shift+Enter 이어 쓰기와 undo 한 번, Tab·Shift+Tab, 깊이 0 Shift+Tab 포커스 이동, 빈 항목 종료, ol +1, 하위 ol 1부터, 본문 맨 앞 Backspace, ← 기호 건너뛰기, 4자리 숫자, Ctrl+Tab.
  - 한글 IME(완료 조건 7): macOS 2벌식, 앞으로 가져온 창에 자판 키. Shift+Enter, Tab, Shift+Tab, Shift+Enter 바로 뒤 Tab, 들여쓸 수 없는 줄의 Tab(포커스 이동) 모두 마지막 음절이 남고 한 번만 처리됐다. 첫 시도는 입력 소스가 영문이라 막혀 사용자에게 넘겼다.
  - 실제 보내기(캔버스 패널, Claude Code): 버블이 ul·ol 중첩, 내어쓰기, 적힌 번호, `**`·백틱 평문으로 그려졌다. 버블 선택 텍스트가 저장된 원문과 같았다. 제목과 큐 행(사용 한도 예약 행, 일반 큐 행)은 기호 없는 평문이었다. Claude Code 주간 한도에 걸려 답은 오지 않았다. 큐 2건과 대화는 지웠다.
- 사용자 디자인 변경(실제 앱을 보고): 버블과 입력창 둘 다, 첫 깊이 인덴트를 지금 둘째 깊이 자리에서 시작하고, 기호(•, N.)와 글자 사이 간격을 줄인다. 초안을 이 결정에 맞춰 고친다(편차로 남기지 않는다). D 2차에서 했다(`d6bf59ece`~`54e8fb378`): 모든 기호가 `--space-6` 한 단계 안쪽에서 시작하고, 기호 열은 `--space-3`(12px), 번호는 일반 숫자 폭. 초안도 고쳤다.
- 사용자 결정: 버블 번호는 기호 열 안에서 오른쪽 정렬한다(브라우저 기본 ol처럼). 입력창은 줄바꿈된 줄이 줄 맨 앞으로 돌아가는 기존 규칙을 그대로 둔다. D 3차에서 한다.
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
| B-rev | B 리뷰 | 없음 | B | Codex Astra high — 여러 컴포넌트에 걸친 입력 처리, 실수하면 입력이 깨진다 | `/code-review` 보고 | 1차 🔴1 🟡3 → 고침 1차 통합 → 2차 🟡3(보류 키) → 실측 IME 순서로 고침 2차 `e123dd934`·`adbc4bb16` → 3차 🔴0 🟡2 → 고침 3차 `213597d03`·`31fba0d94`(conductor가 diff 확인) |
| C | tasks 6, 7 | `homeComposer.ts`(`composeRequest`), `messageText.ts`(`messageLine` 연결), `ConversationThread.tsx`(`UserMessage`)와 테스트, 큐·초안 복원 테스트(프로토타입 포함). 버블 CSS는 보류 항목 | A | Opus medium — 명세가 구체적이고 영향 범위가 B보다 좁다 | test, typecheck, lint | 통합 `79e67ad86`·`1be729481`(통합 HEAD 관련 테스트 23 files / 762 PASS). 버블 CSS 보류 |
| C-rev | C 리뷰 | 없음 | C | Codex Astra medium — 교차 계열 독립 리뷰 | `/code-review` 보고 | 1차 🔴1 🟡3 → C 2차 통합 → 재검토 🔴1(명령과 같은 이름의 스킬, 이전부터의 결함) 🟡1(깊은 중첩 본문 폭 0) → C 3차 `56ac1586a`·`ed5916ae7` 통합(conductor가 diff 확인) |
| D | tasks 8 | `styles.css` 측정 수정, `docs/design/conversation.md`, `docs/design/canvas-conversation.md`, 회귀 테스트 | B, C 통합 | Opus medium — 측정 절차가 정해진 작업 | `/design-sync` 기록 | 1차 통합 `6ba950145`~`ce5ac2771`(CSS 수정 없음, 편차 4건 기록) → 2차(사용자 간격 변경) 진행 |
| conductor | tasks 9, 10, 11 | BACKLOG, PRODUCT, ARCHITECTURE, DESIGN 색인, feature 디렉터리 삭제 | D | — | `/runtime-test`, verify, grep | 대기 |

## 파일 겹침과 순서

- A → (B ∥ C) → C 보류 항목(버블 CSS) → D → conductor.
- B와 C는 `styles.css`만 겹칠 수 있다. B가 가진다. `messageText.ts`는 A(`plainTitle`)와 C(`messageLine`)가 바꾸지만 A 통합 뒤에 C가 시작한다.
