# buzz-canvas-conversation — tasks

선행: `buzz-conversation`(main 병합), `buzz-canvas`(구현이 main에 들어간 뒤). `buzz-inspector`는 선행이 아니다(2026-11-01 user). 순서는 PoC → 초안 → 순수 함수 → main → renderer → 코멘트 제거 → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 의존성은 더하지 않는다.

## P. PoC

- [ ] P1. 칩 필드 PoC(design §5): `.scratch/anchor-field/`에 contenteditable 칩 필드를 독립 페이지로 만들고 Electron에서 확인한다.
  - 확인 항목: 한글 조합 중 칩 삽입 대기와 조합 끝 뒤 삽입, 칩 바로 앞에서의 IME 조합, 칩 앞뒤 커서와 화살표, 칩 단위 Backspace/Delete·⌥⌫·⌘⌫·Shift+화살표, ⌘Z·⇧⌘Z로 칩 넣기·지우기 되돌리기, 텍스트는 순수 텍스트·이미지는 첨부로 가는 붙여넣기, Doan 입력창 사이 잘라 붙이기에서 칩 유지, `/` 프리셋 목록 열기와 combobox ARIA, 줄바꿈으로 capsule→box 전환 때 같은 요소·포커스·조합 유지, `{text, anchors}` 왕복.
  - 결과(통과/실패, 날짜, 환경)를 design §5에 적는다. 실패하면 대안을 사용자에게 묻는다.
  - 검증: command undecided — needs user confirmation(`.scratch/` probe를 Playwright `_electron`과 CDP `Input.imeSetComposition`으로 돌린다. 네이티브 IME는 사람이 직접 확인).

── commit: `docs(feature): buzz-canvas-conversation anchor field PoC result` ──

## D. 초안

- [x] D1. `/design-draft buzz-canvas-conversation`: `.doan/canvases/buzz-canvas-conversation.html`(design §0 프레임, §2 '오류 처리'의 보이는 경우 포함). 문구는 clarify 프리셋으로. 사용자가 확정한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`, `go run ./cli/cmd/doan ls --repo .`.

── commit: `docs(design): buzz-canvas-conversation draft` ──

## T. 순수 함수

- [ ] T1. `pickCanvasConversation`, `canvasConversationMenu`, `shouldMarkSeen`, `panelOpenFor`, `openButtonBadge`, `capsuleAction`, `newConversationMode`(design §3 표). Overview와 같은 부분은 `overviewConversation.ts`에서 함수로 나눠 함께 쓴다.
  - 검증: `npm --prefix app test`.
- [ ] T2. 공용 모듈(main 모듈을 끌어오지 않는 곳)의 `chipLabel`(요소 이름 매핑)과 `messageLine`, 앵커 상한 값. `anchorField.ts`의 `toMessage`·`fromMessage`(32개 상한 포함). `combineQueued` 결과와 반환된 초안 왕복 포함.
  - 검증: `npm --prefix app test`. `app/src/renderer/rendererImports.test.ts`의 EXTRA_ROOTS에 새 renderer 파일(`anchorField.ts`, `canvasPicker.ts`)을 더한다(POSTMORTEM 2026-10-30 renderer import).
- [ ] T3. `pointAnchor`(프레임 밖은 앵커 없음), `resolveChipTarget`(스크립트 `anchors` 응답 판단), `pickerAvailability`.
  - 검증: `npm --prefix app test`.
- [ ] T4. `canvasConversationError`(design §2 '오류 처리' 표에서 오류 코드가 있는 행마다 한 경우, resume 모드 거절 통일, 목록에 없음·ID 중복). 오류 코드가 없는 행의 테스트 위치: 고르기 중 다시 로드·이동·같은 ID 이동은 R4의 `CanvasController.test.ts`, 권한 답 실패와 `readError`는 R2, 모델 목록 실패는 기존 `dockedPicker` 테스트, 칩 대상 없음은 T3.
  - 검증: `npm --prefix app test`.
- [ ] T5. `draftKey`(캔버스 새 대화는 (root, 캔버스 id), Overview 새 대화는 root, 터미널 세션 모드), `draftProblem`(친 텍스트 조각만 `{{` 검사).
  - 검증: `npm --prefix app test`(기존 `dockedRules.test.ts`·`homeComposer.test.ts` 갱신).

── commit: `feat(renderer): canvas conversation, anchor and error models` ──

## M. main

- [ ] M1. `startConversation` `mode: "new"`가 `validateSendExtras`를 거쳐 `model`·`effort`·`attachments`를 받는다(`resume`은 그대로 거절). 시작할 때 대화 제목을 `messageLine`으로 만든다. 메뉴: Edit > Add Selection to Conversation(⌘L)과 캔버스 페이지의 File > New Conversation(⌘N) 조건(`menuState`).
  - 검증: `npm --prefix app test`(`ipc` 테스트에 new의 세 값 수락·resume 거절, `menuState.test.ts`에 캔버스 페이지 조건), `npm --prefix app run typecheck`.

── commit: `feat(main): canvas new conversations take model, effort and attachments` ──

## R. renderer

- [ ] R1. 칩 필드: `ComposerField`를 P1 결과대로 칩 필드로 바꾼다. Home·Overview·캔버스 입력창이 같은 필드를 쓴다. textarea 시절의 포커스·IME·모양 전환 규칙과 `chipRemoval`(커서가 맨 앞일 때만)을 유지한다.
  - 고칠 테스트: `HomeComposerView.interaction`, `DockedComposer.test.tsx`·`DockedComposer.interaction.test.tsx`, `Home.test`, `ProjectOverview.test`, `homeComposer.test`.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, 짧은 `/runtime-test` probe(Home·Overview·캔버스에서 CDP 한글 조합, 조합 중 Enter, `/` 목록, 빈 필드 Backspace로 프리셋·첨부 지우기, 파일 붙여넣기, capsule→box에서 포커스 유지). 테스트에는 DOM이 없으므로 probe 없이 통과로 보고하지 않는다.

── commit: `feat(renderer): composer field with inline anchor chips` ──

- [ ] R2a. 공용 선택 카드(design §0 '선택 카드 라디오'): `ProjectChoice`(`Onboarding.tsx`)와 `styles.css`의 `ob-choice`에서 오른쪽 체크를 빼고 왼쪽 위 라디오로 바꾼다(썸네일 카드는 라디오 → 썸네일 → 텍스트). 온보딩·Add Projects·캔버스 세션 이어 가기가 모두 같은 카드를 쓴다. `Onboarding.test.tsx`의 마크업·CSS 기대값을 고친다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(renderer): choice cards with a start radio` ──

- [ ] R2. 캔버스 대화 호스트와 패널: 헤더 대화 드롭다운, 스레드, docked 입력창, 새 대화(`startConversation` `mode: "new"` + `canvas`, 모델·effort·첨부), 세션 연결이 있으면 터미널 세션 이어 가기(`conversationResumeTarget` 한 번 조회와 재사용, 응답 전 Send 막음, `mode: "resume"`), `legacy-external` 대화의 고정 트리거·첨부 비활성, 이어 가기, 보관 대화 읽기와 복원, 현재 대화가 일하는 중 새 대화 막기, 프로젝트 대화가 그리는 중·승격 안내, 대기열·반환된 초안, 본 것, 목록에 없음·ID 중복의 비활성 입력창, 늦은 응답 처리(root·canvas revision). 오류 처리 표 전체.
  - 경우: 캔버스 전환 중 늦은 응답, 같은 캔버스에서 메뉴로 다른 대화·New를 고르는 동안 시작·전송 응답, 캔버스 A→B→A, 승격 직후 열기와 패널을 연 채 승격, 캔버스 이동(같은 ID), 목록 읽기 실패 뒤 Retry, 권한 답 전송 실패, `readError`, 캔버스별 새 대화 초안.
  - 본 것 규칙 변경: 지금의 "bound canvas를 방문하면 본 것"과 행에서 열 때의 `markSeenThrough`를 패널 기준으로 바꾸고 `homeRun.test.ts`, `CanvasConversationList.test.tsx`, `ProjectOverview.test.tsx`를 고친다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] R3. 패널 여는 규칙과 진입점: Overview 행, 알림·토스트 Open, 승격 알림 Open, 작업 안내 캡슐 Open, 사이드바 행(답 대기·안 본 끝일 때만), ⌘N이 요청된 대화와 함께 캔버스를 열고 패널을 편다. 권한 요청 진입은 그 요청으로 스크롤하고 첫 선택지에 포커스. 답 대기 중 캡슐은 Stop 대신 Open(`buzz-canvas` 변경). 캔버스 페이지에서 임시 상태줄을 그리지 않는다(문제 워크스페이스 화면은 그대로). 접힌 패널의 열기 버튼에 새 소식 점과 접근 이름.
  - 검증: `npm --prefix app test`. `app/src/renderer/ds/checks.test.ts`의 accent 자리 목록(`violetAllowed`)에 열기 버튼 점을 더한다.

── commit: `feat(renderer): canvas conversation panel` ──

- [ ] R4. 입력창 피커와 고르기 상태: 캔버스 스크립트의 내부 고르기 명령(시작·취소)과 응답 `picked`(자기 seq, `selected`·`anchor`·hover 불변), `CanvasController` 도구 상태 `select | pick`, 안내, Esc 순서와 취소 조건, 포커스 복귀, 점 앵커(프레임 안만). 도구모음 Add to conversation과 ⌘L. 칩 locate(`anchors` 채널, `select-anchor` 없이 이동만, 점 고리)와 "No longer in the canvas". 쓸 수 있는 때와 `aria-disabled` 툴팁, 칩 32개 상한.
  - 경우: Esc나 토글 뒤, 또는 다른 화면으로 간 뒤 도착한 고르기 응답은 버린다. 다시 로드·같은 ID 이동이면 새 문서에 적용한다. 선택 seq와 hover seq를 섞지 않는다(POSTMORTEM 2026-10-23 Hover). command 응답은 seq만이 아니라 응답 표시로 묶는다. 포커스 복귀는 시작할 때의 의도를 들고 가고 포커스가 옮겨졌거나 IME 조합 중이면 포기한다(POSTMORTEM 2026-10-23 R-L). 렌더 전 스냅샷을 읽지 않는다(POSTMORTEM 2026-10-25). 고르기 클릭과 칩 locate가 선택·`doan active`를 바꾸지 않는다. 1.2초 강조·4초 문구는 fake timer와 넉넉한 테스트 한도로 본다(POSTMORTEM 2026-10-30 Timing).
  - 검증: `npm --prefix app test`(`CanvasController.test.ts`, 캔버스 스크립트 테스트), `npm --prefix app run build`. `ds/checks.test.ts`의 accent 자리 목록에 칩과 고르기 표시를 더한다.

── commit: `feat(renderer): pick and add canvas anchors to the conversation` ──

## X. 코멘트 화면 제거 (design §1 남김·지움 표)

- [ ] X1. renderer: `CommentsPanel`, `CommentPins`, `ReviewBar`, `HandOffDialog`, `useComments`, `CommentsSession`, `commentAnchors`와 테스트, `App.tsx`·`CanvasController`의 코멘트·핀 경로(`setComments`·`recordResolved`·`drawPins`, `anchors` 채널은 남김), `activity.ts`의 resolved 집계와 테스트, 사이드바 캔버스 행의 코멘트 수 접근 설명(`ShellSidebar.tsx`)과 코멘트 읽기 오류 행(`canvasTree.ts`), 초안 가드. `ds/checks.test.ts`·`ds/controls.test.ts`의 코멘트 항목(`comment-pin`, `.comments-btn`, `handoff-notice`)과 accent 자리 목록의 코멘트 항목을 지운다.
  - 초안 가드를 걷어낸 뒤 캔버스 열기·선택·이동이 같은 순서로 동작하는지 테스트로 확인한다(POSTMORTEM 2026-10-23 draft guards).
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] X2. preload·main: `comments:*`·`comments:invalidated` IPC, `review-state:*` IPC와 `main/reviewState.ts`, `transitionGuard`(Quit·`folders:remove`는 바로 진행), Go 메뉴 Resolved Comment(`resolvedNav`), `main/comments/`의 코멘트 전용 함수(`authorizeComments`, `commentDocument`). 캔버스 identity·document bindings, `app/src/comments/projection.ts`의 `copyText`(eval H6·H7), 코멘트 파일과 CLI용 Go 코드는 남긴다.
  - 문자열 검색(POSTMORTEM 2026-10-30): `grep -rn "comments-\|comment-pin\|CommentsPanel\|CommentPins\|ReviewBar\|review-\|reviewMarker\|HandOff\|handoff-notice\|useComments\|CommentsSession\|comments:\|onCommentsInvalidated\|setComments\|recordResolved\|CommentBinding\|drawPins\|setCommentDraftGuard\|transitionGuard\|authorizeComments\|commentDocument\|select-comment\|resolvedNav\|app/src/comments" app/src app/runtime eval .agents/skills docs`. 남는 줄마다 이유를 적는다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval`(Go 테스트와 eval이 import하는 app 코드 포함), 위 grep에서 남은 줄이 모두 이유가 적힌 의도한 것.

── commit: `refactor: remove the app's comment UI` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-canvas-conversation.html`의 프레임을 빌드한 앱에서 맞춘다. 공용 선택 카드는 온보딩 Your projects와 Add Projects 폴더 안 저장소 카드도 측정한다(라디오 16px, 제목 첫 줄 가운데, 라디오 → 썸네일 → 텍스트).
  - 검증: `node .scratch/design-sync/<screen>/measure.mjs`.

── commit: `fix(renderer): match the buzz-canvas-conversation draft` ──

- [ ] V2. `/runtime-test`(빌드한 앱, 격리, 로그인한 공급자는 memory 'provider login probes' 절차): 새 대화 시작(모델·effort·첨부)과 이어 보내기, 보관 대화 복원, 권한 요청 답과 캡슐 Open, 칩(피커·Add to conversation·⌘L) 전송과 에이전트가 받은 앵커, 칩 locate와 못 찾음, Overview 행·승격 Open으로 패널이 펴짐, 접힌 패널에서 본 것 기록 안 함, 한글 IME와 칩, 오류 표에서 만들 수 있는 경우. 결과는 `.scratch/runtime-test/buzz-canvas-conversation/`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과 뒤 `/runtime-test` probe.
- [ ] V3. `/agent-eval`(마지막 통합 전, AGENTS.md 'Workflow'): 앱이 실제 앵커를 처음 보내고, 피커는 `doan active`를 바꾸지 않는다. 앵커를 다루는 scenario가 없으면 실행을 생략하는 이유를 이 줄에 적고 `docs/USABILITY-EVAL.md`에 열린 이슈로 남긴다.
  - 검증: `node eval/run.ts --self-test` 통과(self-test PASS, exit 0), 실행했다면 `node eval/run.ts` 라운드 결과.

## Z. 승격과 정리 (문서마다 커밋, `buzz-canvas` Z1 반영 뒤의 본문 기준)

- [ ] Z1. PRODUCT: §1 문제 2·4(코멘트 → repo 파일 화살표), §3 In scope 2·3(Deliver)·6과 끝 문단의 "temporary conversation strip on other workspace screens", §4 Loop(코멘트 대신 캔버스 대화와 칩), §5 머리 "view + comment", 항목 1 'Project conversations'의 캔버스 페이지 상태줄·"A canvas conversation cannot be read or continued in the app yet"·슬롯과 본 것("a canvas conversation when its canvas opens"), 항목 3의 "a canvas conversation opens its canvas"·행이 본 것을 기록한다는 문장·"The app cannot open a canvas's earlier conversations yet", 항목 4 Canvas info의 "inspect or comment on it", 항목 6 Hand Off, Dogfooding "viewed and commented on in the Doan app", §6 Review 관련 열린 질문. 실제 앱에서 확인하지 못한 표면은 §6에.
  - 검증: `grep -n "no anchor picker\|Hand off\|Hand Off\|comment on it\|commented on\|cannot be read or continued" docs/PRODUCT.md`에서 남은 줄이 없거나 의도한 것.
  - ── commit: `docs(PRODUCT): canvas conversations and anchors in the app` ──
- [ ] Z2. ARCHITECTURE: §7 'Agent conversation runtime and IPC'의 "there is no anchor picker or anchor chips"와 'IPC contract'의 new 모드 extras, 'Renderer primitives'의 칩 필드, 캔버스 대화 호스트, 캔버스 스크립트의 내부 고르기 명령, §3 'Comment documents, pins and drafts', 'Review state IPC', 방문 시 본 것 기록 문장, 초안 가드 문장, 코멘트 IPC 제거, Quit 가드.
  - 검증: `grep -n "anchor picker\|review-state\|draft guard\|comments:" docs/ARCHITECTURE.md`에서 남은 줄이 의도한 것.
  - ── commit: `docs(ARCHITECTURE): canvas conversation panel and anchor field` ──
- [ ] Z3. DESIGN.md: 캔버스 대화 패널, 칩, 고르기 상태, 오류 문구, 'Choice cards', 'Accent places', 'Comments'·'Comments Review'·'Hand off dialog'·'Revision continuity' 절, 코멘트 확인 대화상자 크기·Hand off 스크롤·그리지 않은 표면 목록의 코멘트 항목 정리.
  - 검증: `grep -n -i "comment\|hand off\|review bar" docs/DESIGN.md`에서 남은 줄이 의도한 것.
  - ── commit: `docs(DESIGN): record the canvas conversation panel` ──
- [ ] Z4. README와 harness: README의 "comments with pins, review and hand-off" 문장, 앱 코멘트로 초안 피드백을 받는 절차가 있는 스킬(`.agents/skills/design-draft`, `design-sync`, `ux-audit`, `feature`)을 대화와 칩 기준으로 고친다.
  - 검증: `grep -rn -i "comment" README.md .agents/skills/*/SKILL.md`에서 남은 줄이 CLI 코멘트(`doan comments`)뿐이다.
  - ── commit: `docs: canvas conversations replace app comments in README and skills` ──
- [ ] Z5. 부모 `buzz-restyle`: tasks C12 체크, spec 표 12번 선행에서 `buzz-inspector`를 빼고(2026-11-01 user) 9번의 선행·순서 메모를 고친다, 공통 결정 2의 "코멘트 카드·제출·핀이 accent 자리로 남는다" 문장 삭제, design.md 'DESIGN.md 절과 담당' 표 갱신. `docs/features/buzz-canvas-conversation/`를 지운다.
  - 검증: 디렉터리가 없다.
  - ── commit: `docs(feature): complete buzz-canvas-conversation` ──
