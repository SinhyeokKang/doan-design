# buzz-project — tasks

선행: `buzz-conversation`(C10)이 main에 병합된 뒤 구현한다. 순서는 형식 → 순수 함수 → renderer → 제거 → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다.

## D. 초안

- [x] D1. `/design-draft buzz-project`: `.doan/canvases/buzz-project.html`(design §0 프레임, 2026-10-31 사용자 확정, 리뷰 반영 수정 포함).
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`.

## T. 형식과 순수 함수

- [ ] T1. `UiState`에 최상위 선택 필드 `conversationByRoot`를 더한다(`app/src/restore/uiState.ts`, `savedUiState`, root 제거 때 정리).
  - 검증: `npm --prefix app test` (필드 없는 파일, 잘못된 id, 저장된 root 밖, root 제거).
- [ ] T2. `pickOverviewConversation`, `projectConversationMenu`, `canvasConversationRows`, `overviewAfterListChange`, `shortAgo`, 목록 키보드(design §3 표의 경우를 모두).
  - 검증: `npm --prefix app test`.

── commit: `feat(renderer): overview conversation selection and canvas conversation rows` ──

## R. renderer

- [ ] R1. Overview 헤더와 메인: 프로젝트·브랜치 칩(워크트리 메뉴, `showShellOverview`)·대화 드롭다운, `ConversationThread`, `DockedComposer`(기존·새 대화 모드, placeholder), 새 대화 추천(Home 조건), 승격 알림 줄, 중복 ID 알림 자리, 목록 로딩·실패, 문제 상태 프로젝트의 Send 막기, ⌘N(File > New Conversation), 본 것 규칙, ui-state 기억.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 경우: 렌더 사이 대화 전환(POSTMORTEM 2026-10-25), 비동기 목록 읽기 중 사람이 고른 대화를 덮지 않음, 워크트리 전환 때 새 대화 초안이 root별로 남았다가 돌아오면 복원, 실행 중에 워크트리 전환, `.doan/ds/`만 있는 프로젝트의 추천, 캔버스는 있고 대화가 없는 프로젝트, 긴 제목 말줄임과 전체 제목 접근 이름, 대화가 많을 때 메뉴 스크롤.
- [ ] R2. 오른쪽 캔버스 목록: 행(공급자 로고, 이름, 상태, 짧은 시각, 미리보기), 썸네일(목록 행만, 오른쪽 스크롤러 관찰, `object-fit: cover`, 빈 스타일과 접근 이름), 특별한 행, 빈 상태, roving tabindex 키보드, `openShellCanvas`로 열기와 `markSeen`.
  - 검증: `npm --prefix app test` (정적 마크업: 빈 썸네일의 "Preview loading"·"Preview unavailable", 열 수 없는 행의 `aria-disabled`와 이유, 열 수 있는 읽기 실패 행, `role="list"`).
- [ ] R3. 승격 처리: 초안 이동, 포커스 유지, 이동 알림, 본 것 seq, 기억 지우기.
  - 검증: `npm --prefix app test`.
- [ ] R4. 진입점: Home Send, 권한 토스트·알림 클릭, "Open the running conversation", LNB 상태 슬롯이 요청된 대화를 넘긴다. 같은 Overview 안이면 메인 대화만 바꾸고 `scrollToItem`. 다른 대화의 응답 대기 토스트. Home Send 뒤 포커스를 입력 칸으로(`focusCurrent` 셀렉터 변경).
  - 검증: `npm --prefix app test` (다른 프로젝트·다른 워크트리 Overview가 보일 때의 Home Send는 대상 root로 옮기고 그 root의 기억만 쓴다, 알 수 없는 대화의 알림 클릭).

── commit: `feat(renderer): project overview as the project conversation screen` ──

## X. 제거

- [ ] X1. design §1의 삭제 목록을 지운다: Overview 카드, FirstPrompt 전체(카드·대기·복사 채널·`promptSentence`·`newDesign`의 `subject` 경로), Feedback 패널과 `feedbackGroups`, `comments:project` 읽기, 캔버스 없는 코멘트의 앱 경로, `overviewOrder.ts`(다시 쓰지 않으면), Overview 상태줄. 캔버스 Comments의 ID 변경 알림에서 Show를 빼고 문구를 `doan check` 안내로 바꾼다.
  - 셀렉터 문자열 검색(POSTMORTEM 2026-10-30): `grep -rn "fb-\|feedback\|ocard\|fp-card\|firstPrompt\|FirstPrompt\|orphan" app/src`. 캔버스 Comments 패널이 함께 쓰는 `comments-*` 클래스는 남긴다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, 위 grep에서 남은 줄이 모두 의도한 것.

── commit: `refactor(renderer): drop overview cards, feedback panel and first prompt` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-project.html` 프레임 9개와 `buzz-conversation.html`의 docked·스레드 보드를 빌드한 앱에서 맞추고 DESIGN.md를 갱신한다. `overview-narrow`(960×600)에서 제목이 먼저 줄어드는지 잰다.
  - 검증: `/design-sync` 절차의 측정 스크립트(`node .scratch/design-sync/<screen>/measure.mjs`).
- [ ] V2. `/runtime-test`: `npm --prefix app run build` 뒤 `app/out`을 Playwright `_electron`으로 띄운다(dev 서버가 아니라 빌드 앱이라야 CSP를 확인한다). 격리 userData·HOME·SHELL, `shell.openExternal`은 stub한다. 결과는 `.scratch/runtime-test/buzz-project/`에 남긴다.
  - CSP: 스레드 화면이 비지 않고 Markdown이 그려진다. `https` 링크가 main 채널로 간다(stub 호출 확인).
  - 포커스·IME: docked capsule에 포커스를 두고 조합을 시작한 뒤(`desktop.ts` 네이티브 입력, 안 되면 CDP `Input.imeSetComposition`이라고 밝힘) capsule→box 전환을 일으키고 조합을 끝낸다. 통과: `document.activeElement`가 같은 textarea 노드, 확정된 글자가 그대로, 자모 중복 없음. 네이티브 IME를 몰 수 없으면 미검증으로 남긴다.
  - 흐름: Home Send → Overview, 기존 캔버스 수정 승격 → 초기화·알림·초안 이동, 다시 로드·재시작 뒤 기본 대화 복원(기억한 대화가 승격됐으면 새 대화), 알림 클릭으로 대화 열기, 창 포커스가 있을 때만 본 것.
  - 실행 중·응답 대기 상태는 로그인한 공급자가 있어야 만든다. 못 하면 미검증으로 남긴다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test` probe.

## Z. 승격과 정리 (문서마다 커밋)

- [ ] Z1. PRODUCT: §3, §5 항목 0(First prompt), 1, 3, 5를 현재 규칙으로 고친다.
  - 검증: `grep -n "Feedback\|FirstPrompt\|First prompt\|folder-grouped\|Overview card\|zero-canvas\|Comments without a canvas" docs/PRODUCT.md`의 남은 줄이 모두 캔버스 Comments(C12까지 유지)에 관한 것.
  - ── commit: `docs(PRODUCT): project overview as the conversation screen` ──
- [ ] Z2. ARCHITECTURE: §2 캔버스 없는 코멘트 쓰기, §3 Overview 카드·썸네일 큐, §7 FirstPrompt·first-prompt IPC·프로젝트 코멘트·Overview counts·UiState `conversationByRoot`·"Its only UI is".
  - 검증: 같은 grep을 `docs/ARCHITECTURE.md`에 돌려 남은 줄을 확인한다.
  - ── commit: `docs(ARCHITECTURE): overview conversation screen and removals` ──
- [ ] Z3. DESIGN.md: 'Design navigation'(buzz-ds 이전 표시 삭제), 'Feedback panel', 'Onboarding'의 FirstPrompt 행, 'Home' Strip width의 Feedback 280px 언급. 부모 design.md 'DESIGN.md 절과 담당' 표의 buzz-project 행.
  - 검증: `grep -n "Feedback panel\|FirstPrompt" docs/DESIGN.md`의 남은 줄 확인, `grep -n 'buzz-ds 이전' docs/DESIGN.md`에 Design navigation이 없음.
  - ── commit: `docs(DESIGN): record the project overview` ──
- [ ] Z4. 부모 `buzz-restyle/tasks.md` C7 체크, 부모 spec 표 7·12번 현재화. `docs/features/buzz-project/`를 지운다.
  - 검증: 디렉터리가 없다.
  - ── commit: `docs(feature): complete buzz-project` ──
