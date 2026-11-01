# buzz-canvas-conversation — tasks

선행: `buzz-conversation`(main 병합), `buzz-canvas`(구현이 main에 들어간 뒤). `buzz-inspector`는 선행이 아니다(2026-11-01 user). 순서는 PoC → 초안 → 순수 함수 → renderer → 코멘트 제거 → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 의존성은 더하지 않는다.

## P. PoC

- [ ] P1. 칩 필드 PoC(design §5): `.scratch/anchor-field/`에 contenteditable 칩 필드를 독립 페이지로 만들고 Electron에서 확인한다. 한글 조합 중 칩 삽입 대기와 조합 끝 뒤 삽입, 칩 앞뒤 커서와 화살표, 칩 단위 Backspace/Delete, 순수 텍스트 붙여넣기, 줄바꿈으로 capsule→box 전환 때 같은 요소·포커스·조합 유지, `{text, anchors}` 왕복. 결과(통과/실패, 날짜, 환경)를 design §5에 적는다. 실패하면 대안을 사용자에게 묻는다.
  - 검증: command undecided — needs user confirmation(`.scratch/` probe를 Playwright `_electron`과 CDP `Input.imeSetComposition`으로 돌린다. 네이티브 IME는 사람이 직접 확인).

── commit: `docs(feature): buzz-canvas-conversation anchor field PoC result` ──

## D. 초안

- [x] D1. `/design-draft buzz-canvas-conversation`: `.doan/canvases/buzz-canvas-conversation.html`(design §0 프레임, §2 '오류 처리'의 보이는 경우 포함). 문구는 clarify 프리셋으로. 사용자가 확정한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`, `go run ./cli/cmd/doan ls --repo .`.

── commit: `docs(design): buzz-canvas-conversation draft` ──

## T. 순수 함수

- [ ] T1. `pickCanvasConversation`, `canvasConversationMenu`, `shouldMarkSeen`, `panelOpenFor`, `openButtonBadge`, `newConversationMode`(design §3 표). Overview와 같은 부분은 `overviewConversation.ts`에서 함수로 나눠 함께 쓴다.
  - 검증: `npm --prefix app test`.
- [ ] T2. `toMessage`·`fromMessage`, `chipLabel`(앵커 직렬화와 이름). `combineQueued` 결과와 반환된 초안 왕복 포함.
  - 검증: `npm --prefix app test`.
- [ ] T3. `pointAnchor`, `resolveChipTarget`, 앵커 상한(`validAnchor`와 같은 상한, selector는 맞는 조상으로).
  - 검증: `npm --prefix app test`.
- [ ] T4. `canvasConversationError`(design §2 '오류 처리' 표의 행마다 한 경우).
  - 검증: `npm --prefix app test`.

── commit: `feat(renderer): canvas conversation, anchor and error models` ──

## R. renderer

- [ ] R1. 칩 필드: `ComposerField`를 P1 결과대로 칩 필드로 바꾼다. Home·Overview·캔버스 입력창이 같은 필드를 쓴다. textarea 시절의 포커스·IME·모양 전환 규칙을 유지한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(renderer): composer field with inline anchor chips` ──

- [ ] R2. 캔버스 대화 호스트와 패널: 헤더 대화 드롭다운, 스레드, docked 입력창, 새 대화(`startConversation` `mode: "new"` + `canvas`), 세션 연결이 있으면 터미널 세션 이어 가기(`conversationResumeTarget`, `mode: "resume"`), 이어 가기, 보관 대화 읽기와 복원, 대기열·반환된 초안, 본 것, 늦은 응답 처리(root·canvas revision). 오류 처리 표 전체.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 경우: 캔버스 전환 중 늦은 응답, 승격 직후 열기, 캔버스 이동(같은 ID), 목록 읽기 실패 뒤 Retry.
- [ ] R3. 패널 여는 규칙과 진입점: Overview 행, 알림·토스트 Open, 승격 알림 Open, 사이드바 슬롯이 요청된 대화와 함께 캔버스를 열고 패널을 편다. 캔버스 페이지에서 임시 상태줄을 그리지 않는다(문제 워크스페이스 화면은 그대로). 접힌 패널의 열기 버튼에 새 소식 점과 접근 이름.
  - 검증: `npm --prefix app test`.

- [ ] R3a. 공용 선택 카드(design §0 '선택 카드 라디오'): `ProjectChoice`(`Onboarding.tsx`)와 `styles.css`의 `ob-choice`에서 오른쪽 체크를 빼고 왼쪽 위 라디오로 바꾼다. 온보딩·Add Projects·캔버스 세션 이어 가기가 모두 같은 카드를 쓴다. `Onboarding.test.tsx`의 마크업·CSS 기대값과 docs/DESIGN.md 'Choice cards'를 함께 고친다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(renderer): canvas conversation panel` ──

- [ ] R4. 입력창 피커와 고르기 상태(캔버스 표시, 안내, Esc, 점 앵커), 도구모음 Add to conversation, 칩 locate와 "Not in the current canvas". 캔버스 로드 문제 중 비활성 이유.
  - 검증: `npm --prefix app test`, `npm --prefix app run build`.

── commit: `feat(renderer): pick and add canvas anchors to the conversation` ──

## X. 코멘트 화면 제거

- [ ] X1. renderer: `CommentsPanel`, `CommentPins`, `ReviewBar`, `HandOffDialog`, `useComments`, `CommentsSession`, `commentAnchors`와 테스트, `App.tsx`·`CanvasController`의 코멘트·핀 경로, 초안 가드.
- [ ] X2. preload·main: `comments:*` IPC, 앱 코멘트 서비스 연결, Quit의 코멘트 가드, Go 메뉴 Resolved Comment(`resolvedNav`). 코멘트 파일과 CLI용 Go 코드는 남긴다.
  - 문자열 검색(POSTMORTEM 2026-10-30): `grep -rn "comments-\|CommentsPanel\|CommentPins\|ReviewBar\|HandOff\|useComments\|CommentsSession\|comments:\|setCommentDraftGuard\|resolvedNav" app/src app/runtime`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`(Go 테스트 포함), 위 grep에서 남은 줄이 모두 의도한 것.

── commit: `refactor: remove the app's comment UI` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-canvas-conversation.html`의 프레임을 빌드한 앱에서 맞춘다.
  - 검증: `/design-sync` 절차의 측정 스크립트.

── commit: `fix(renderer): match the buzz-canvas-conversation draft` ──

- [ ] V2. `/runtime-test`(빌드한 앱, 격리, 로그인한 공급자는 memory 'provider login probes' 절차): 새 대화 시작과 이어 보내기, 보관 대화 복원, 권한 요청 답, 칩(피커·Add to conversation) 전송과 에이전트가 받은 앵커, 칩 locate와 못 찾음, Overview 행·승격 Open으로 패널이 펴짐, 접힌 패널에서 본 것 기록 안 함, 한글 IME와 칩, 오류 표에서 만들 수 있는 경우. 결과는 `.scratch/runtime-test/buzz-canvas-conversation/`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test` probe.

## Z. 승격과 정리 (문서마다 커밋)

- [ ] Z1. PRODUCT: §3 In scope 2·6과 "A canvas page does not show its conversation yet", §4 Loop(코멘트 대신 캔버스 대화와 칩), §5 항목 1 'Project conversations'의 "A canvas conversation cannot be read or continued in the app yet", 항목 4·5(코멘트 CRUD·Review·Hand Off), 실제 앱에서 확인하지 못한 표면은 §6에.
  - ── commit: `docs(PRODUCT): canvas conversations and anchors in the app` ──
- [ ] Z2. ARCHITECTURE: §7 'Agent conversation runtime and IPC'의 "there is no anchor picker or anchor chips", 'Renderer primitives'의 칩 필드, 캔버스 대화 호스트, 코멘트 IPC 제거, Quit 가드.
  - ── commit: `docs(ARCHITECTURE): canvas conversation panel and anchor field` ──
- [ ] Z3. DESIGN.md: 캔버스 대화 패널, 칩, 고르기 상태, 오류 문구, 'Comments'·'Comments Review'·'Hand off dialog'·'Revision continuity' 절 정리.
  - ── commit: `docs(DESIGN): record the canvas conversation panel` ──
- [ ] Z4. 부모 `buzz-restyle`: tasks C12 체크, spec 표 12번 선행에서 `buzz-inspector`를 빼고(2026-11-01 user) 9번의 선행·순서 메모를 고친다, 공통 결정 2의 "코멘트 카드·제출·핀이 accent 자리로 남는다" 문장 삭제, design.md 'DESIGN.md 절과 담당' 표 갱신. `docs/features/buzz-canvas-conversation/`를 지운다.
  - 검증: 디렉터리가 없다.
  - ── commit: `docs(feature): complete buzz-canvas-conversation` ──
