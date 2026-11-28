# 프리셋 드로어 구조 — tasks

순서: 드래프트 → 순수 함수 → UI → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. `/agent-eval`은 필요 없다(에이전트가 보는 것이 바뀌지 않는다).

## T1. 드래프트

- `/design-draft preset-drawer-layout`: `structure`, `states`, `search`, `composers`를 그린다. 사용자가 앱에서 확정한다.
- 검증: `doan check <드래프트 경로>`가 통과하고, `doan ls`의 프레임 id가 요청과 같다. 확정한 모습이 design.md에 적혀 있다.
- `[commit]` 드래프트와 design.md

## T2. 순수 함수

- `presetListView`의 탭과 섹션(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. `homeComposer.test.ts`의 기존 'grouped presets show Suggested and the five tabs' 등 탭 테스트를 새 구조로 바꾼다(의도한 변경). 경우: Suggested 없음(탭 줄 없음, 또는 + Project/Commands), 스킬·명령 없음, 스킬만, 명령만, 둘 다(탭 넷), 섹션 순서, 프리셋 없는 그룹은 머리 없음, 모르는 그룹 키, 그룹 없는 옛 CLI, notice와 스킬이 함께, 검색은 지금처럼 머리 없는 점수순(정확 일치 스킬 먼저), `/` 목록 검색과 목록이 그대로.
- `[commit]` `test:` → `feat:`

## T3. UI

- `ComposerParts.tsx`와 `styles.css`: 새 구조, 고정 폭, 검색 입력 기본 크기.
- 검증: `ComposerParts.test.tsx`(또는 새 테스트)에서 탭 이동(←/→ 순환), 행 이동(↑/↓ 끝에서 멈춤, 섹션 머리 건너뜀), 탭을 바꾸면 스크롤 맨 위, 폭이 스킬·명령 유무와 무관한 600 px(CSS), 드로어 검색 입력에 `data-ui-size`가 없고 `/` 목록 검색창은 그대로, listbox·tablist 이름. `ComposerSkills.test.tsx`의 포커스 복원과 고르기·닫기 테스트가 그대로 통과한다. `app/src/renderer/ds/surfaces.css`의 행 hover 선택자(`[role="listbox"]:not(:has(:focus)) > .doan-menu-item[role="option"][tabindex]:hover`)는 직계 자식만 잡아 `role="group"` 안의 행에 hover 채움이 사라지므로, 선택자를 넓히고 다른 listbox(Quick Open, `/` 목록, 메뉴)에서 hover가 그대로인지 테스트한다. `drawnTarget.test-support.ts`의 className fixture와 `ds/checks.test.ts`의 accent selector 목록을 새 구조에 맞춘다. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 측정과 실기 확인

- `/design-sync`: 새 드래프트와 computed style로 맞추고 `docs/design/conversation.md`의 'Popover'·'Tabs' 줄을 새 값으로 바꾼다. 검색 입력이 MCP Server URL 입력과 같은 높이·글자·여백인지 잰다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`: Home, Overview, 캔버스 대화 패널, 프로토타입 창에서 드로어를 열어 폭, 탭과 행 이동(포인터와 키보드), sticky 머리 아래 포커스 행이 보이는지, 좁은 프로토타입 창에서 탭 라벨 말줄임, 검색, 고르기를 확인한다.
  - 검증: 항목마다 기대값과 관측값, 스크린샷이 `.scratch/`에 있다.
- `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
- `[commit]` `docs(design): …`

## T5. 승격과 정리

- PRODUCT, `docs/design/conversation.md`, `docs/DESIGN.md`: design.md '형식, 규약, 결정에 미치는 영향'의 문장과 줄을 새 구조로 바꾼다.
- README: `.doan/canvases/readme-features.html`의 Presets 프레임을 고치고 `docs/assets/readme/`로 다시 내보낸다(500 KB 이하).
- BACKLOG: T4에서 확인하지 못한 항목을 더한다.
- `docs/features/preset-drawer-layout/`를 지운다.
- 검증: PRODUCT에 "five group tabs"와 "widens only while there are skills"가 남아 있지 않고 새 규칙이 있다. 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(BACKLOG): …`, `docs(feature): remove preset-drawer-layout after promotion`
