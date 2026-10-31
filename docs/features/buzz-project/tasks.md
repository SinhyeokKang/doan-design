# buzz-project — tasks

선행: `buzz-conversation`(C10)이 main에 병합된 뒤 구현한다. 순서는 형식 → 순수 함수 → renderer → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다.

## D. 초안

- [ ] D1. `/design-draft buzz-project`: `.doan/canvases/buzz-project.html`(design §0 프레임). 스레드·docked는 `buzz-conversation.html` 보드를 따른다. 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`.

── commit: `docs(design): buzz-project draft` ──

## T. 형식과 순수 함수

- [ ] T1. `UiState`에 root별 마지막 프로젝트 대화 선택 필드를 더한다(`app/src/restore/uiState.ts` 검증).
  - 검증: `npm --prefix app test` (필드 없는 파일 읽기, 잘못된 값 버리기, 저장된 root 밖 버리기).
- [ ] T2. `pickOverviewConversation`, `projectConversationMenu`, `canvasConversationRows`, `overviewAfterListChange`(design §3).
  - 검증: `npm --prefix app test`.

── commit: `feat(renderer): overview conversation selection and canvas conversation rows` ──

## R. renderer

- [ ] R1. Overview 메인: 헤더(프로젝트, 워크트리 칩 메뉴, 대화 드롭다운), `ConversationThread`, `DockedComposer`(기존·새 대화 모드), 새 대화 상태의 추천 칩, 중복 ID 알림 자리, 화면에 보일 때 `markSeen`, ui-state 기억.
  - 검증: `npm --prefix app test` (정적 마크업, 렌더 사이 대화 전환), `npm --prefix app run typecheck`.
- [ ] R2. 오른쪽 캔버스 목록: 행(캔버스당 현재 대화 하나), 썸네일, 열 수 없는 행, 빈 상태, 목록 키보드, 캔버스 열기.
  - 검증: `npm --prefix app test`.
- [ ] R3. 제거: Overview 카드 목록, FirstPrompt 사용처, Feedback 패널과 `feedbackGroups`, 카드 코멘트 수, Overview 상태줄. 셀렉터 문자열 검색(design §6). 남은 사용처가 있는 코드는 지우지 않는다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`.
- [ ] R4. Home Send 뒤 Overview가 그 대화를 열고, 승격되면 메인이 새 대화 상태가 된다.
  - 검증: `npm --prefix app test`.

── commit: `feat(renderer): project overview as the project conversation screen` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-project.html` 프레임과 `buzz-conversation.html`의 docked·스레드 보드를 빌드한 앱에서 맞추고 DESIGN.md를 갱신한다.
  - 검증: `/design-sync` 절차의 측정 스크립트(`node .scratch/design-sync/<screen>/measure.mjs`).
- [ ] V2. `/runtime-test`: 빌드한 앱에서 확인한다.
  - 스레드 화면이 비지 않는다(CSP). Markdown과 링크가 열린다.
  - docked 입력창의 실제 포커스·한글 조합이 모양 전환 뒤에도 유지된다(buzz-conversation에서 넘김).
  - Home Send → Overview, 승격 → 초기화, 다시 로드 뒤 기본 대화 복원.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test` probe.

## Z. 승격과 정리

- [ ] Z1. 현재 규칙으로 고친다.
  - PRODUCT §5 항목 1·3: Overview, Feedback 제거, Home Send 뒤 흐름, 상태줄.
  - ARCHITECTURE §7: ui-state 필드, Overview 구성.
  - DESIGN.md: 'Design navigation'과 'Feedback panel' 절, 부모 design.md 'DESIGN.md 절과 담당' 표의 buzz-project 행.
  - 부모 `buzz-restyle/tasks.md` C7을 체크한다.
  - 검증: `grep -n "folder-grouped cards\|The Overview's right panel is Feedback" docs/PRODUCT.md` 결과 없음. `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] Z2. `docs/features/buzz-project/`를 지운다.
  - 검증: 디렉터리가 없다.

── commit: `docs: promote buzz-project` ──
