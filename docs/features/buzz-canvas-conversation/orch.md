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
- BT 리뷰(Codex astra): 🔴 2(직접 친 `{{n}}` 오인, `messageLine` 줄바꿈), 🟡 2(`not_logged_in` 만료 단정 문구, 첨부·`not_running` 행). 수정 라운드 1을 BT 터미널에 보냈다(`ctx_2b6fb1cc644d`). 지휘자 판단: 직접 친 마커 문제는 BR1로 넘기지 않고 BT 모델에서 닫는다.
- BT 수정 1 `9cd3f75a`. 지휘자 판단(문구 승인): 터미널 세션 거절 목록(handoff 'Fix round 1' 3번)과 `attachment_limit` notice "Only 10 files can be attached to a message. Remove some, then send again."를 승인했다. 근거: 출하된 "Only 10 files can be attached."·docked 로그인 문구와 같고, clarify대로 코드가 말하는 것만 쓴다. 재리뷰: Codex astra `ctx_f3344cfd6be5`(앞 리뷰 터미널이 stale이라 새로 띄움).
- BR1에 넘길 것: `dockedAvailability`가 segments를 넘기게 바꾼다. BR2에 넘길 것: `overviewRun.takeDraft`가 돌려받은 마커 번호를 다시 매기지 않는다(fromMessage/toMessage로 합친다). `attachment_limit`은 반환된 초안의 이유로만 온다.
- BT 재리뷰 통과(🔴 0, 추가 지적 없음).
- 네이티브 IME 확인(사용자, 진행 중): 3번 — 조합 중 첫 Enter에 조합 확정과 전송이 함께 일어나고, 보낸 텍스트("안녕")는 온전하다. PoC의 Enter 처리는 출하된 textarea와 같다(`isComposing`·keyCode 229). 출하된 입력창과의 동작 비교는 미검증으로 남기고, R1 이후 실제 앱(V2)이나 `docs/BACKLOG.md`에서 다룬다. 4번 — box에서 줄을 지워도 capsule로 돌아가지 않는 것은 출하 규칙(비었을 때만 capsule)이다.
- BX 완료 `d25ea9a0`(84 파일, −11401). 지휘자 판단: 이번 제거로 생긴 고아(`authorizeCanvas`, `stableDiskHash`·`DocumentBindings.current()`, `--border-pin`·`--halo-pin`, `view.ts` `commentsError`·`open`·`resolved`)는 다른 사용처가 없으면 지운다. 근거: AGENTS '내 변경이 만든 고아만 지운다'. 지휘자 판단(검증을 확실히): BX에 Quit·Remove·Go 메뉴·캔버스 클릭 경로의 짧은 `/runtime-test` probe를 더했다. 후속 `ctx_6fec4aa57d7c`, 리뷰 Codex astra `ctx_80992de088da`(범위 `...d25ea9a0`).
- 네이티브 IME 6번(사용자): ⌥⌫는 칩만 지운다(기대대로). ⌘⌫도 칩만 지웠다(기대: 줄 머리까지, 칩 앞 글자 유무 확인 중).
- 지휘자 판단(BX-2 질문): `DocumentBindings` 연쇄(current(), 인스펙터 문서 관찰, `X-Doan-Response`)는 남기고, 읽는 곳이 전혀 없는 것만 지운다. 근거: design §1 남김·지움 표(2026-11-01 user)가 document bindings를 남긴다. 연쇄를 지우면 캔버스 로드 타이밍(iframe 시작 일시정지)도 바뀌어 범위 밖이다. 읽는 곳이 없어진 `current()`는 사용자에게 따로 묻는다.
- 지휘자 판단(BX-2 질문 2): `CanvasRow.open`·`resolved`·`commentsError`를 지금 모두 지운다(38 파일 기계적 수정). BX는 먼저 BT가 들어간 통합 브랜치로 rebase한다. 근거: BR1·BR2 시작 전이라 겹침이 없고, 뒤 배치가 죽은 필드를 물려받지 않는다.
- 네이티브 IME 6번 결과(사용자): "한글 + 칩" 줄에서 칩 바로 뒤 ⌘⌫가 칩만 지운다 — 실패. 기대는 macOS 규칙대로 줄 머리까지(앞 한글 포함) 지우기다. CDP probe의 P1-4는 이 경우를 놓쳤다. R1 필수 수정: `deleteSoftLineBackward`·`deleteHardLineBackward`(와 ⌘⌦ 대응)는 Chromium 범위에 맡기지 않고 필드가 줄 머리·끝을 직접 계산해 칩과 글자를 함께 지운다. R1 probe에 "글자 + 칩 + 커서" ⌘⌫ 경우를 더한다.
- BX 리뷰(Codex astra) 통과: 🔴·🟡 0, 오래된 주석 1건(🟢). 후속 커밋은 끝난 뒤 따로 리뷰한다.
- 네이티브 6번 나머지(사용자): Shift+←로 칩이 한 번에 선택된다 — 통과. ⌥⌫ 칩만 지움 — 통과.
- 네이티브 7번(사용자): Doan 필드 사이 복사·붙여넣기는 칩으로, 외부 필드에는 텍스트로 들어간다 — 통과.
- 네이티브 5번(사용자): Undo·Redo 정상. R1의 메뉴 Undo·Redo 연결(BP 발견 1)은 probe에서 재현된 경우를 막기 위해 그대로 둔다.
- 네이티브 6번 ⌘⌫ 정밀화(사용자): "한글 + 칩 + 한글|"은 줄 전체를 지운다(통과). "한글 + 칩 + 한글 + 칩|"처럼 커서가 칩 바로 뒤면 마지막 칩만 지운다(실패). R1 필수 수정의 대상은 커서가 칩 바로 뒤에 있는 ⌘⌫(와 칩 바로 앞의 ⌘⌦)다.
- 결정(2026-11-01 user): 조합 중 Enter가 조합 확정과 함께 전송되는 지금 동작을 그대로 둔다. Z1에서 PRODUCT §5 Home의 "Enter during IME composition never sends"를 실제 동작(조합 중인 글자를 확정하고 보낸다, 글자는 빠지거나 겹치지 않는다)으로 고친다.
- 네이티브 1번(사용자): 조합 중 칩 삽입 대기와 확정 뒤 삽입 — 통과.
- 네이티브 2번(사용자): 칩 사이에 한글이 들어간다 — 통과. 네이티브 IME 확인 끝: 실패는 6번의 칩 바로 뒤 ⌘⌫ 하나(R1 필수 수정), 3번 Enter 동작은 사용자 결정으로 유지.
- 6번 ⌘⌫ 추가(사용자): 영어와 섞어도 칩 바로 뒤 ⌘⌫는 칩만 지운다. IME와 무관한 Chromium 범위 문제다(R1 필수 수정 그대로).
- 결정(2026-11-01 user): 칩 바로 뒤 ⌘⌫ 수정은 IME와 무관하므로 영어 자동 probe로만 확인하고, 한글 수동 재확인은 하지 않는다.
- BX 후속 1: rebase 뒤 `6b5fcdf9`(=d25ea9a0) + `6747eb10`(고아 정리, 44 파일). 실제 앱 probe 10/10(Go 메뉴, 사이드바 행, 캔버스 클릭·배경·중첩 iframe·⌥ 링크, Remove·Undo, Quit exit 0), `verify.mjs --eval` PASS. 미검증: 'Canvas changed while opening…' 경로(지금 UI로 만들 수 없음, 단위 테스트만). 관찰(이번 변경과 무관): 유일한 프로젝트를 지우면 워크스페이스에 "Frames"·"Pick a canvas from the list"가 토스트 뒤에 남는다. 후속 2(`canvasView` `idChanged`, `tokens.css` accent 주석)를 보냈다.
- BX 후속 2 `b592bfe1`: tokens.css accent 주석만 고침. `idChanged`는 선택 해제에 쓰여 고아가 아니라 남김.
- 지휘자 판단(BP 발견 1 다시 봄): 사용자 네이티브 확인에서 메뉴 Undo·Redo가 정상이었으므로 메뉴 라우팅은 넣지 않는다. BR1 runtime probe에서 한 번 더 보고, Redo가 닿지 않으면 그때 정한다. 근거: 라우팅은 BM의 `main/index.ts`와 겹치고, 확인된 문제가 없다.
- BX 후속 리뷰(Codex astra) 통과: 🔴·🟡 0, 오래된 주석 1건 → 후속 3으로 고침.
- 웨이브 1 통합 끝: BX `d52ba1ba`·`788b6785`·`f2d328ea`·`35e898bf`. BP·BT·BX 워크트리 정리 완료. 통합 HEAD `verify --eval` 실행 중.
- 웨이브 2 시작: BM Codex gpt-6-astra medium `ctx_85ecb7cc92f7`(bcc-bm), BR1 Claude Opus high `ctx_48b23f81f47a`(bcc-br1). 둘 다 `launch.effective` 확인.
- 지휘자 판단(BR1 질문): Home·Overview 입력창은 칩을 받지 않고, Doan 칩 클립보드를 칩 이름 텍스트로 붙인다. 클립보드에 원본 캔버스(root, 캔버스 id)를 싣고, 입력창의 캔버스가 같을 때만 칩으로 붙인다. 근거: spec 비목표 '다른 캔버스의 칩'과 design §2 '칩은 칩으로 남는다'를 함께 읽었다.
- 웨이브 1 통합 HEAD(`35e898bf`) `verify --eval` PASS(verify-tests, runtime-support, go-test, go-vet, typecheck, app-test, eval-tests, eval-self-test, build). 통합 앱의 실제 probe는 BX probe(통합 전 같은 코드)로 대신하고, 칩 필드가 들어가는 웨이브 2 뒤에 다시 본다.
- BM 완료 `98d8378e`(Codex). renderer 계약: `setMenuState`가 `selection`·`pickerAvailable`을 보내고, `addSelectionToConversation` 명령을 처리한다(R3/R4). 리뷰: Claude Opus medium.
- BM 리뷰(Claude Opus medium) 통과: 🔴·🟡 0, ⚪ 4. 지휘자 판단: 잘못된 `menu:state` 입력은 기존 플래그처럼 직전 상태를 유지한다(테스트로 고정). 주석 보강과 함께 BM 후속 1(`ctx_54ddcace0b51`). ⚪2(⌘N·⌘L renderer 연결)는 BR2·BR4b 브리프에, ⚪4(ARCHITECTURE 368·496)는 Z2에 넣는다.
- BM 통합: `73197dbc`, `2d45413d`. 워크트리 정리.
- 지휘자 판단: BR4a를 웨이브 3까지 기다리지 않고 BR1과 병렬로 시작했다(`ctx_d7d609d5ab3a`, bcc-br4). 근거: 선행(BT·BX)이 통합됐고, BR4a 파일(canvasScript·CanvasController·canvasMessage·canvasPicker)은 BR1과 겹치지 않는다.
- 결정(2026-11-01 user, BR4a 질문): 고르기 중 프레임 배경 클릭은 프레임 칩, 요소 클릭은 요소 칩, 프레임 안 ⇧-클릭은 그 자리의 점 칩이다. 지휘자 판단(문구, clarify 적용): 고르기 안내는 "Click a frame or an element, or Shift-click a spot"(kbd Esc, sr "Press Escape to cancel" 그대로). design.md §0·§2를 고쳤다. 초안의 `picker-mode` 안내 문구와 다른 점은 V1에서 사용자 결정에 따른 차이로 기록한다.
- BR1 발견: 빌드한 앱에서 Edit 메뉴 Redo가 칩 필드에 닿지 않는다(필드가 Chromium 실행 취소 스택을 막아 historyRedo가 오지 않음). textarea에서는 됐으므로 회귀다. 사용자 네이티브 확인과 결과가 달랐다(PoC 페이지에서는 Chromium 스택이 남아 있었던 것으로 보임). 지휘자 판단: BR1이 `main/index.ts` Edit 메뉴 Undo·Redo와 preload 채널 하나를 맡아, 칩 필드에 포커스가 있으면 필드로 보내고 아니면 `webContents.undo/redo`를 그대로 부른다. 근거: 회귀를 남기지 않고, BM이 통합돼 겹치는 배치가 없다.
- BR4a 완료 `c164ff2e`: 고르기 명령·응답, `select | pick`, locate(1.2초 강조, 12px 고리). 지휘자 판단: 리뷰를 BR4b와 합치지 않고 지금 핵심부터 Codex astra로 본다(검증을 확실히).
- BR4a 리뷰(Codex astra): 🔴 3(프레임 밖 요소가 칩이 됨, pick-start 도착 전 클릭이 선택을 바꿈, 같은 URL 문서 교체 뒤 고르기 끊김), 🟡 1(locate 무응답을 '없음'으로 취급). 지휘자 판단: locate 무응답은 '없음'이 아니라 따로 끝내고 BR4b는 조용히 끝낸다. 근거: clarify(확인되지 않은 원인을 말하지 않는다), design은 찾지 못함만 정한다. 수정 라운드 1 전송.
- BR4a 수정 1 `ae02b32c`: 넷 모두 red 테스트 먼저. 재리뷰 Codex astra.
- BR1 완료: R1 `70051c7d`(칩 필드, ⌘⌫·⌘⌦ 줄 범위 직접 계산, Edit 메뉴 Undo·Redo 라우팅, 회귀 수정 — postmortem 후보), R2a `e3021ebb`. verify PASS, 하네스 probe 9/9, 빌드 앱 probe 26/26. 미해결: (1) 줄 머리에 칩이 있으면 그 칩 앞에 커서를 둘 수 없다(Chromium 한계), (2) 사용자 네이티브 실패("글자+칩+글자+칩|" ⌘⌫)는 CDP로 재현되지 않아 수정 확인은 네이티브로만 가능. 리뷰 Codex astra `ctx_1f33402065d8`.
- BR4a 재리뷰: 🔴 1(같은 문서의 늦은 iframe load가 pick seq를 되감아 입력 차단이 고착됨, 메모리 진단으로 재현). 수정 라운드 2 전송.
- BR1 리뷰(Codex astra): 🔴 2(같은 값의 다른 초안으로 바꿔도 Undo 기록이 남음, 칩과 함께 복사한 직접 입력 마커가 붙여넣기에서 칩이 됨), 🟡 1(선택 교체 전 칩 상한 계산). 지휘자 판단(사용자 답 전, 리뷰도 같은 권고): 줄 머리 칩 앞 커서는 폭 0 filler로 고친다. 근거: 메시지 첫머리 칩 앞에 말을 덧붙이는 일이 흔하고 design §5 '칩 앞뒤 커서' 기대를 채운다. 수정 라운드 1 전송.
- 결정(2026-11-02 user): 줄 머리 칩 앞 커서를 고친다(BR1 수정 라운드 1에 이미 포함).
- BR4a 수정 2 `de04db75`(pickDocument 분리). 재리뷰 2 Codex astra.
- BR4a 재리뷰 2 통과(🔴 0). 통합한다.
- BR1 수정 1 `c17f468e`: 초안 키로 기록 수명 끊기, 클립보드에 검증된 segments 보존, 선택 교체 뒤 상한, 줄 머리 칩 filler. 하네스 13/13, 빌드 앱 probe 26/26. 부작용: 사용자가 친 U+200B를 필드가 버림. 재리뷰 Codex astra.
- 결정(2026-11-02 user): 입력창 칩도 누르면 locate하므로 hover 커서는 pointer, 누른 뒤 입력창 커서는 칩 바로 뒤. BR4b에 넣는다.
- 결정(2026-11-02 user): 칩 locate의 뷰 — 프레임 칩은 서랍 프레임 이동과 같은 `fitFrame`, 요소·점 칩은 지금 배율을 유지하고 가운데로 옮기되 요소가 화면보다 크면 전체가 보이게 배율을 줄인다. BR4b(필요하면 CanvasController locate 수정 포함)에 넣는다.
- 결정(2026-11-02 user): 요소 칩 아이콘을 lucide `SquareMousePointer`로 바꾼다(초안과 다른 점, V1에 기록). BR4b에 넣는다.
- 결정(2026-11-02 user): 초안을 결정에 맞춰 고친다(차이로 남기지 않음). 지휘자는 초안 코드를 고치지 않으므로 BD 워커(Claude Sonnet medium, 기계적 반영)에 맡기고 지휘자가 검토한다: 고르기 안내 문구, 요소 칩 아이콘, locate 캡션.
- BD 완료 `97b8fcb4`(초안: 고르기 안내, 요소 아이콘 16곳, locate 캡션). 지휘자 검토: 문구·캡션이 결정과 맞고 이 캔버스에 `doan check` 지적이 없다(실제 앱 렌더 확인은 생략, 아이콘·문구만 바뀜).
- 발견: 코멘트 제거로 예전 초안 4개의 프레임 16개가 `CommentsPanel.tsx`를 가리켜 `doan check` 오류가 됐고, `.doan/ds/color.html`이 지운 핀 토큰을 쓴다. 결정(2026-11-02 user): 코멘트 UI만 다룬 초안 3개(comments-readability, revision-continuity, revision-recheck)를 지우고 project-feedback의 id-change-notice 프레임을 뺀다. 핀 토큰 견본도 뺀다. main에 이미 있던 `Sidebar.tsx` 오류 9개는 범위 밖. BD 후속 1.
- BR1 재리뷰: 앞 지적 3건 해결. 새 🔴 1(일반 삭제로 줄 머리가 된 칩 앞에 줄바꿈이 생겨 메시지가 바뀜), 🟡 2(클립보드 앵커 중첩 타입 검증, 조합 중 초안 전환 검증). 지휘자 판단: 사용자가 친·붙인 U+200B는 지우지 않는다(filler 노드만 표시해 뺀다). 근거: PRODUCT §5 항목 1 '입력은 남는다', 리뷰 권고. 수정 라운드 2 전송.
- BD 후속 1 `a39cbf86`: 코멘트 초안 3개 삭제, project-feedback id-change-notice 프레임, color.html pins 프레임 제거. `doan check` 오류는 main에 있던 Sidebar.tsx 6개만 남음. 남은 참조: 코드 주석 7곳(App.tsx:152, canvasView.ts:63, CanvasConversationList.tsx:15·test:124, CanvasController.ts:721, shell.test.ts:430, watch.test.ts:291) → BR2 브리프에 넣는다. 문서 참조(DESIGN 661·714·738, DIRECTORY 36) → Z3·Z5. POSTMORTEM·USABILITY-EVAL은 기록이라 그대로.
- BR1 수정 2 `6f077513`: 하네스 17/17, 빌드 앱 26/26, verify PASS. 재리뷰 2 Codex astra.
- BR1 재리뷰 2 통과(🔴·🟡 0). 통합한다.
- BR1 통합: `fc9779a2`, `fce56e54`, `cf9f856e`, `38586ff4`. bcc-br1 워크트리는 사용자 네이티브 ⌘⌫ 확인용 하네스 때문에 남긴다(증거는 지휘자 `.scratch/runtime-test/bcc-BR1/`로 복사). 통합 HEAD `verify --eval` 실행 중.
- BR2 시작: Claude Opus high `ctx_5f2c2599c8aa`(bcc-br2).
- 웨이브 2 통합 HEAD(`38586ff4`, BT·BX·BM·BR1·BR4a·BD 포함) `verify --eval` PASS. 로그의 FAILED 줄 둘은 verify 러너 자체 테스트(verify-tests)의 의도된 실패다.
- BR2 완료 `176e84a3`(33 파일): ConversationStore 분리, CanvasRun·패널, 진입점·새 소식 점·메뉴 상태·상태줄 제거·본 것 규칙. 테스트 5009, 격리 probe 22/22. 미검증: 로그인 흐름(V2), 답 대기 점·중복 ID 입력창(실제 앱에서 만들 수 없음). 지휘자 판단(문구): 권한 답 전송 실패 "Couldn’t send your answer. Choose again."를 승인한다(clarify: 무엇이 실패했고 다음 동작, 출하된 "Couldn’t send your message. Try again."과 같은 꼴). 지휘자 판단: 중복 ID 입력창 비활성은 캔버스가 닫혀 도달하지 않으므로 받아들인다(design 표가 캔버스 페이지 자체의 중복 ID 안내를 따르게 한다). 리뷰 Codex astra.
- BR2 리뷰(Codex astra): 🔴 4(반복 진입 포커스, 같은 값 New 재선택 revision, start 뒤 오래된 목록, 목록 읽는 중 Send), 🟡 2(대기열 `{{n}}` 표시, Edit and resend 늦은 포커스). 수정 라운드 1 전송.
- BR2 수정 1 `4d0dcb8b`: 여섯 모두 red 먼저, 테스트 5016, probe 24/24. 재리뷰 Codex astra.
- BR2 재리뷰: R1·R2·R3·Y1·Y2 해결, R4 재발 경로 1건(목록 읽는 중 ⌘N 뒤 세션 조회가 먼저 끝나면 Send가 열림). 수정 라운드 2 전송.
- BR2 수정 2 `f577dd53`. 재리뷰 2 Codex astra.
- BR2 재리뷰 2 통과(🔴 0). 통합한다.
- BR2 통합: `73cc2ead`, `bc687c78`, `1d7411ae`. bcc-br2 정리.
- BR4b 시작(BR4a 워커 재사용, `ctx_25447f7999bc`, bcc-br4를 통합 브랜치로 rebase).
- 지휘자 판단(BR4b 질문): 고르기 중 캔버스 위 십자 커서는 캔버스 스크립트가 `adoptedStyleSheets`로 넣고 끝날 때 뺀다(BR4b가 canvasScript.ts를 맡음). 근거: design §2 '보드 커서가 십자'; DOM을 건드리지 않아 레이아웃 감시에 영향이 없다.
- 결정(2026-11-02 user): PRODUCT §6 'Open questions'를 `docs/BACKLOG.md`로 분리했다(정할 것 18 · 실제 앱 미검증 4 · 알려진 결함 6). PRODUCT §6은 BACKLOG를 가리키는 한 줄만 남겨 절 번호와 기존 'PRODUCT §6' 참조가 그대로 이어진다. AGENTS·feature·feature-review 스킬·README·ARCHITECTURE·이 feature 문서의 참조를 고쳤다. Z1·Z3은 미검증 표면과 코멘트 관련 항목을 BACKLOG에 맞춰 쓴다.
- BACKLOG 점검(2026-11-02, Claude Opus 에이전트, 이 브랜치 기준): 유지 19, 문구 수정 4, 대상 사라짐 5, 해결 0. 결정(user): 문구 3개(프리셋 대상 문구, Claude 권한 요약, Tab 순서)는 지금 고쳤다. Z1에서 할 일: 캔버스 미검증 표면 항목의 "the app cannot start a canvas conversation yet" 문장을 V2 결과로 고치고, 코멘트 화면 제거로 대상이 사라진 5개(잘못된/없는 캔버스 ID 구분, 다른 기기 시계와 리뷰 표시, Git으로 온 코멘트 new 표시, 카드 recovery-blocked 문구, `process.kill` ESRCH 조사)를 PRODUCT 코멘트 본문과 함께 지운다.
