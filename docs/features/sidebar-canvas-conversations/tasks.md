# sidebar-canvas-conversations — tasks

`/feature-review` → `/design-draft`(사용자가 앱에서 확인)는 하위 1 구현과 나란히 한다. 작업 3부터는 하위 1 `canvas-concurrent-conversations`가 develop에 병합된 뒤 `/ship bypass`로 간다(앱 렌더러와 ui-state만 바뀌지만 feature 문서가 있다). guide, 스킬 스텁, CLI 출력, 소켓이 바뀌지 않으므로 `/agent-eval`은 하지 않고 PR 본문에 그 이유를 적는다. 커밋 경계는 `/ship`을 따른다.

- [ ] 1. `/design-draft`: design.md '초안 요청'의 9개 프레임. 검증: `doan check --repo . --json`, `doan ls --repo . --json`(프레임 ID 9개), 사용자가 앱에서 확인했고 그 사실이 design.md에 있다.
  - 커밋 경계: 초안.
- [ ] 2. 하위 1 병합 뒤 맞추기: 하위 1이 바꾼 코드(제목 메뉴 순서 함수, 기본 대화 고르기, 요청된 대화 경로, 사이드바 캔버스 행 클릭, 대화 요약의 필드)와 이 design.md의 인용을 develop에 맞춘다. 검증: design.md의 모든 파일:줄 인용이 develop과 같다.
  - 커밋 경계: 문서 맞추기.
- [ ] 3. `/tdd`: design.md '순수 함수' 1–5를 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트(와 그 테스트를 담은 파일)에서만 실패한다.
  - `viewedCanvasConversations`: 대화 0·1·2개, ID로 묶기와 경로로 묶기, 두 행이 같은 ID를 가질 때, 최근 활동 순, 신호.
  - `placeSlots`: 펼침(캔버스 행 신호 비움), 접힘, 목록 없음, 프로젝트 행 규칙 그대로.
  - `canvasDisclosure`, 키보드 순서와 화살표(캔버스 행 →/←, 대화 행 →/←, 휴지통 ←, 쓸 수 없는 휴지통 건너뛰기).
  - ui-state: `sidebar.conversationsFolded` 파싱(참만, 잘못된 값만 버림), 저장, 첫 읽기 전 저장 없음(POSTMORTEM 2026-11-01).
  - `ShellSidebar.test.tsx`: 대화 행 렌더, 선택된 행, 셰브론 선택자(`:focus-visible`), 휴지통이 시각적으로만 숨음, 목록 접힘과 행 삭제 뒤 포커스.
  - 커밋 경계: `test:`.
- [ ] 4. `/implement`: 순수 함수, `ShellSidebar.tsx`, `conversationList.ts`, `App.tsx` 연결, ui-state, 스타일. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: 구현 하나.
- [ ] 5. `/design-sync`: 9개 프레임을 실제 앱과 맞추고 DESIGN.md 사이드바 절에 잰 값을 적는다. 검증: `node .scratch/design-sync/sidebar-canvas-conversations/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이뿐이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 6. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL, `DOAN_RUNTIME`)에서 가짜 에이전트 CLI로 한 캔버스에 대화 3개를 두고 확인한다. 검증: `node .scratch/runtime-test/sidebar-canvas-conversations/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷 포함).
  - 목록이 보고 있는 캔버스 아래에만, 2개 이상일 때만 보인다. 상태가 바뀌면 행 표시가 바뀐다. 펼친 동안 캔버스 행 신호 없음, 접으면 가장 강한 신호.
  - 셰브론(hover, 키보드)으로 접고 편다. 다른 캔버스를 열어도, 앱을 다시 띄워도 접힘이 유지된다.
  - 대화 행을 누르면 패널이 그 대화로 펼쳐지고 `document.activeElement`가 답 카드나 composer다. Back은 이전 화면으로 간다.
  - 휴지통: hover와 키보드(→)로 닿고, 확인 창, 작업 중 대화는 쓸 수 없음. 포커스가 있던 행이 지워지면 다음 행으로.
  - 180 px에서 긴 제목이 잘린다.
- [ ] 7. `/code-review` → `/refactor`. `/refactor`가 앱 코드를 고치면 6번의 영향받은 항목을 다시 확인한다. 검증: 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 8. 결론을 승격하고 `docs/features/sidebar-canvas-conversations/`를 삭제한다. 문서마다 커밋한다.
  - PRODUCT §5 item 1 사이드바(보고 있는 캔버스 아래 대화 목록, 2개 이상, 접힘 값 공유, 셰브론, 대화 행 누르기와 휴지통), 슬롯 문장(신호 자리 규칙과 '확인 필요' 1의 결과).
  - DESIGN.md 사이드바 절(5번에서 잰 값).
  - ARCHITECTURE §7 'Navigation persistence and IPC'의 UI state 필드 목록에 `sidebar.conversationsFolded`.
  - 검증: `test ! -d docs/features/sidebar-canvas-conversations`, `grep -c "conversationsFolded" docs/ARCHITECTURE.md`가 1 이상, `rg -n 'sidebar-canvas-conversations' -g '!docs/features/**' -g '!.doan/**' .`가 아무것도 찾지 않는다.
  - 커밋 경계: 문서 승격.
- [ ] 9. `/verify`(승격 뒤 마지막 HEAD). 검증: `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.
