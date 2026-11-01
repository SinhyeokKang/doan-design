# buzz-canvas-conversation — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 시작 hash: `ac7008ea`(main)
- 통합 브랜치: `feat-buzz-canvas-conversation`
- 지휘자: Claude Code(Opus). 병합하지 않는다(push + PR까지).

## 결정 기록

1. P1 검증(2026-11-01 user): `.scratch/anchor-field/`의 독립 페이지를 `node .scratch/anchor-field/probe.mjs`(Playwright `_electron`, 격리 userData·HOME, CDP `Input.imeSetComposition`)로 확인한다. 네이티브 한글 IME 항목은 사람이 직접 확인하고, 확인하지 않으면 미검증으로 남긴다.
2. 모델 경계(2026-11-01 user, "Codex 워커 허가"): 이 지휘 세션에서 Codex 워커를 쓸 수 있다. 구현은 Claude가 맡고, Codex는 다른 계열의 독립 리뷰와 기계적인 배치(BM)에 쓴다. Codex를 쓸 때마다 아래 배치 표에 적는다.
3. 공급자 로그인(2026-11-01 user): V2는 실제 HOME과 `.scratch/provider-profile/userData`(Claude·Codex 로그인 확인함, 2026-11-01)를 재사용한다. 이 feature가 이 프로필을 쓰는 마지막 feature이므로 PR 병합 전에 앱에서 로그아웃하고 프로필을 지운다(병합은 사용자가 한다).
4. 지휘자 판단 — 코멘트 제거(X)를 renderer(R)보다 먼저 한다. 근거: X1이 `App.tsx`·`CanvasController.ts`의 코멘트·핀 경로를 지우는데 R2·R4가 같은 파일을 고친다. 지우는 것을 먼저 하면 파일 겹침 없이 병렬 웨이브를 짤 수 있고 R의 범위도 준다. tasks의 커밋 순서만 바뀌고 항목은 그대로다.
5. 지휘자 판단 — R4를 둘로 나눈다. BR4a(캔버스 스크립트·`CanvasController`·`canvasMessage`·`canvasPicker`)는 BR2와 병렬로, 화면 연결(도구모음 버튼, 입력창 피커 버튼, `App.tsx`, ⌘L, 스레드 칩 locate, accent 목록, CSS)은 BR2 통합 뒤 같은 워커의 새 Task(BR4b)로 보낸다. 근거: BR2와 겹치는 파일은 연결 부분뿐이다.
6. 지휘자 판단 — V3: 워커가 앵커를 다루는 eval scenario가 있는지 먼저 본다. 없으면 실제 라운드를 생략하고 이유를 tasks V3 줄과 `docs/USABILITY-EVAL.md` 열린 이슈에 남긴다(tasks V3 그대로). self-test는 항상 돌린다.
7. 지휘자 판단 — Codex 모델 id: `~/.codex/config.toml`의 기본은 `gpt-6-astra`이고 `models_cache.json`(2026-10-28)에는 astra·sol이 없다. 실행할 때 `launch.effective`로 확인하고, 거절되면 그 결과를 여기에 적는다.
8. 지휘자 판단 — Z(승격과 정리)는 지휘자가 문서 커밋으로 한다(orchestrate §4·§5 docs freshness와 승격).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 리뷰 | 상태 |
|---|---|---|---|---|---|---|---|
| BP | P1 | `.scratch/anchor-field/`, design.md §5 | — | Claude Opus high: contenteditable·IME 판단, 틀리면 R1 전체가 흔들린다 | `node .scratch/anchor-field/probe.mjs` + 사람 IME | 지휘자가 결과 대조 | 대기 |
| BT | T1–T5 | 새 파일 `canvasConversation.ts`·`rightPanelOpen.ts`·`anchorField.ts`·`canvasPicker.ts`·공용 모듈(`chipLabel`·`messageLine`·앵커 상한)과 테스트, `overviewConversation.ts`·`dockedRules.ts`·`homeComposer.ts`와 테스트, `rendererImports.test.ts` | — | Claude Opus medium: 규칙이 design §3에 다 있고 테스트가 고정한다 | `npm --prefix app test`, typecheck | Codex gpt-6-astra medium | 대기 |
| BX | X1, X2 | renderer 코멘트 파일과 테스트, `App.tsx`, `CanvasController.ts`(+test), `activity.ts`, `ShellSidebar.tsx`, `canvasTree.ts`, `ds/checks.test.ts`·`ds/controls.test.ts`, `styles.css`(코멘트 규칙), `preload/index.ts`, `main/index.ts`, `main/menuState.ts`, `main/reviewState.ts`, `main/comments/`, `app/src/comments/`, grep이 가리키는 main·`app/runtime` 파일. `eval/`·docs·스킬은 건드리지 않는다 | — | Claude Opus high: main·renderer 걸친 제거, 가드 타이밍 함정(POSTMORTEM) | `verify.mjs --eval`, tasks X2 grep | Codex gpt-6-astra medium | 대기 |
| BM | M1 | `main/conversation/ipc.ts`(+test), 대화 제목을 만드는 main 모듈, `main/menuState.ts`(+test), `main/index.ts`(메뉴 항목) | BT, BX | Codex gpt-6-astra medium: 계약 하나와 메뉴 조건, 테스트로 고정되는 기계적 변경 | `npm --prefix app test`, typecheck | Claude Opus medium | 대기 |
| BR1 | R1 → R2a | `ComposerParts.tsx`, Home·Overview·docked 입력창 파일과 테스트, `anchorField.ts`(확장), `Onboarding.tsx`·`Onboarding.test.tsx`, `styles.css` | BP, BT | Claude Opus high: 칩 필드는 포커스·IME 회귀 위험이 크다 | `npm --prefix app test`, typecheck, R1 `/runtime-test` probe | Codex gpt-6-astra medium | 대기 |
| BR2 | R2, R3 | `App.tsx`, 새 캔버스 대화 호스트, 대화 패널·`CanvasHeader.tsx`·`CanvasAgent.tsx`·`ConversationThread.tsx`·`DockedComposer.tsx`, `canvasConversation.ts`·`rightPanelOpen.ts`, 본 것 관련 테스트(`homeRun`·`CanvasConversationList`·`ProjectOverview`), `ds/checks.test.ts`, `styles.css` | BM, BR1 | Claude Opus high: 늦은 응답·본 것·오류 표 전체, 이 feature의 중심 | `npm --prefix app test`, typecheck | Codex gpt-6-astra medium | 대기 |
| BR4a | R4 핵심 | `main/canvasScript.ts`(+test), `CanvasController.ts`(+test), `canvasMessage.ts`(+test), `canvasPicker.ts`(+test) | BX, BT | Claude Opus high: seq·hover·포커스 의도 함정(POSTMORTEM 2026-10-23) | `npm --prefix app test`, build | BR4b와 함께 Codex gpt-6-astra medium | 대기 |
| BR4b | R4 연결 | `CanvasTools.tsx`, 입력창 피커 버튼, `App.tsx`, ⌘L, 스레드 칩 locate, `ds/checks.test.ts`, `styles.css` | BR2, BR4a | BR4a와 같은 워커 | `npm --prefix app test`, build | 위와 같음 | 대기 |
| BV1 | V1 | `.scratch/design-sync/`, 측정으로 고치는 renderer 파일, `docs/DESIGN.md` | BR4b | Claude Opus high: 초안 대조와 수정 판단 | `node .scratch/design-sync/<screen>/measure.mjs` | design-sync 안의 리뷰 | 대기 |
| BV2 | V2 | `.scratch/runtime-test/buzz-canvas-conversation/` | BV1 | Claude Opus medium: 실제 앱 probe, 실제 로그인 프로필 사용 | `verify.mjs --eval` 뒤 probe | 지휘자 대조 | 대기 |
| BV3 | V3 | `eval/`(필요하면), `docs/USABILITY-EVAL.md` | BR4b | Claude Sonnet medium: scenario 확인과 self-test | `node eval/run.ts --self-test` | 지휘자 대조 | 대기 |
| 지휘자 | Z1–Z5 | PRODUCT·ARCHITECTURE·DESIGN·README·스킬·부모 문서 | 모두 | — | tasks Z의 grep | — | 대기 |

D1은 이미 끝났다(초안 확정).

## 겹침과 순서

- 웨이브 1(병렬): BP · BT · BX. 서로 겹치는 파일이 없다.
- 웨이브 2(병렬): BM(BT·BX 통합 뒤) · BR1(BP·BT 통합 뒤). BX와 BM은 `main/index.ts`·`menuState.ts`가 겹쳐서 순서를 둔다. BR1은 `styles.css` 때문에 BX 통합 뒤에 시작한다.
- 웨이브 3(병렬): BR2 · BR4a. BR4a는 BR2의 파일(`App.tsx`·`styles.css`·`ds/checks.test.ts`·입력창)을 건드리지 않는다.
- 웨이브 4: BR4b(BR2 통합 뒤, BR4a 워커의 새 Task).
- 웨이브 5: BV1 → BV2(실제 앱 probe가 겹치지 않게 순서), BV3는 BV1과 병렬.
- 그 뒤 지휘자 Z, 최종 `/verify --eval`, push와 PR.

## 진행 기록

- 2026-11-01 웨이브 1 시작: BP `ctx_6c2ce584dff3`(bcc-bp), BT `ctx_3792df711d75`(bcc-bt), BX `ctx_4d3550a3ed34`(bcc-bx). 셋 다 Claude Opus, `launch.effective` 확인.
- 지휘자 판단(BX 질문): IPC 제거로 호출자가 없어진 `main/comments/`의 service·files·author·mkdir·mkdir-child·transitions와 테스트를 지우고, `app/electron.vite.config.ts`의 mkdir-child 입력을 BX가 지운다. 근거: AGENTS '내 변경이 만든 고아만 지운다'. eval·패키징이 쓰는 것은 남긴다.
- BT 완료(`bc3859a4`): 공용 모듈은 `app/src/main/conversation/messageText.ts`(타입 import만, `prompt.ts`가 LIMITS를 다시 내보냄). 워커를 retain해 리뷰 수정에 재사용한다. 리뷰: Codex gpt-6-astra medium `ctx_1739ced8f125`(bcc-bt, `launch.effective` 확인 — astra id 유효).
- BR1에 넘길 것: 사람이 직접 친 `{{n}}`이 칩 수 안이면 마커와 구별되지 않는다. 필드가 toMessage 전에 친 조각을 검사한다.
- BP 완료, 통합 `f724f726`(원 `a447e35d`): probe 10/10 통과(CDP IME 에뮬레이션, Electron 45). 네이티브 한글 IME는 사용자 확인 대기(미검증). PoC 코드는 지휘자 `.scratch/anchor-field/`로 복사했다(R1이 옮겨 쓴다).
- 지휘자 판단(BP 발견 1): 메뉴를 마우스로 고른 Edit > Undo·Redo는 Chromium 기본 스택이 비면 필드에 닿지 않는다. R1은 칩 필드에 포커스가 있을 때 메뉴 Undo·Redo를 renderer로 보내 필드의 실행 취소 기록을 쓴다. 근거: design §2 '편집'의 ⌘Z·⇧⌘Z 규칙을 메뉴에서도 지킨다.
- 지휘자 판단(BP 발견 2): contenteditable combobox에서 Chromium이 `aria-autocomplete`를 노출하지 않는다. role·expanded·controls·activedescendant는 textarea와 같다. 감싸는 구조(ARIA 1.1)로 바꾸지 않고 이 차이를 받아들이며, 승격 때 DESIGN/ARCHITECTURE에 알려진 차이로 적는다. 근거: design §2가 요구하는 것은 `aria-activedescendant`이고, 감싸는 구조는 필드 재마운트·포커스 위험을 더한다.
