# small-ui-tweaks — tasks

시작 전: design '결정'(1–8, 사람, 2026-11-06)을 따른다. 구현 시작 시점은 `work-update`가 main에 병합된 뒤다(design §6).

순서: UI 초안(항목 1) → 순수 함수 → 화면(CSS·배선) → 실제 앱 확인 → 문서 승격. 형식(schema·fixture) 변경은 없다. 세 항목은 독립이므로 항목별로 커밋한다.

## D. UI 초안(항목 1)

- [x] D1a. `/design-draft small-ui-tweaks`: design §5 '초안 요청'대로 `.doan/canvases/small-ui-tweaks.html`(frame `panel-280`, `panel-320`, `overview`, `home`, `separation`)을 그렸다(2026-11-06, 커밋 전).
  - 검증: `doan check --json --repo .`(임시 `DOAN_RUNTIME`)에 이 캔버스의 finding이 없고 그리기 전과 같은 finding만 남았으며, `doan ls --json --repo .`가 canvas id `small-ui-tweaks`, 너비 1440, frame 다섯 개를 요청과 같게 보였다.
- [x] D1b. 사람이 초안을 보고 확정했다(2026-11-06): 행 사이 1px 구분선 C(결정 5), 하이픈 줄바꿈 유지(결정 6). 초안은 C를 고른 안으로 표시하고 A·B를 비교로 남겼다(`--revise`).
  - 검증: design에 '결정할 점'이 없고, '초안 요청'의 상태가 "사람 확인(2026-11-06)"이다. 초안은 `docs(design): small-ui-tweaks draft`로 커밋한다.

- [x] D2a. `/design-draft small-ui-tweaks --revise`: 항목 4(이름 하이라이트)를 C 행에 그리고, `separation`에 clone·slice·진짜 `.anchor-chip`·긴 이름 비교 줄을 더했다(2026-11-06, 커밋 전).
  - 검증: `doan check --json --repo .`(임시 `DOAN_RUNTIME`)에 이 캔버스의 finding이 없고, `doan ls --json --repo .`의 frame 다섯 개가 그대로다.
- [x] D2b. 사람이 앱에서 항목 4를 보고 확정했다(2026-11-06, "이거지 가독성이 확올라가노"): anchor chip의 값으로 만든 inline 하이라이트, clone(design 결정 7·8). 초안 머리와 note에 확정을 적었다.
  - 검증: design에 '결정할 점'이 없고, '초안 요청'의 상태에 항목 4 확인 날짜가 있다.

커밋 경계: D1·D2(초안, `.doan/canvases/small-ui-tweaks.html`만).

## A. 순수 함수(항목 2, `/tdd` → `/implement`)

- [ ] A1. `dotField.ts`의 `partitionDots(dots, spots, radius)`(자리 목록, 가장 가까운 거리), `opposingCursor(spot, width, height)`(점대칭), 머리 주석(Doan이 더한 부분). `agentIndicator.ts`의 `drawDotField(…, spots, …)`(design §2.2, §3 1–3).
  - 검증: `npm --prefix app test`에서 `dotField.test.ts`·`agentIndicator.test.ts`가 통과한다. 새 경우: 빈 목록이면 모두 far이고 far만 한 번 칠함, 경계는 far, 한가운데에서 둘째 자리가 첫째 자리와 같은 점, 셋째 줄에서 반대 방향, `autoCursor(cycle − t)`와 같음, 그 밖의 시각에는 겹치지 않음, `DOT_FIELD.rows`가 홀수, 겹친 곳의 alpha가 0.5·크기가 2를 넘지 않음. 새 테스트가 구현 전 red였음을 기록한다.

- [ ] A2. 항목 4: `homeComposer.ts`의 `SuggestedPrompt.parts`와 `suggestedPrompts`가 조각을 만든다(design §2.1b, §3 4).
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`가 통과한다. 새 경우: 화면 캔버스가 없을 때 세 고정 문장의 조각 하나, design system이 없을 때 project 이름 조각, critique·polish의 `canvasLabel` 조각, 하이픈·밑줄 이름, 조각을 이으면 `label`, `text`가 바뀌지 않음. 새 테스트가 구현 전 red였음을 기록한다.

커밋 경계: A1, A2 각각.

## U. 화면

- [ ] U1. 항목 1: `styles.css`의 `.suggestion-label`을 두 줄 규칙으로(`-webkit-line-clamp: 2`, `overflow-wrap: anywhere`, `nowrap`·`text-overflow` 제거), 행 사이 1px 구분선(`.suggestion`의 `position: relative`, `.suggestion + .suggestion::before`; design §2.1, 결정 5). 행의 `align-items: center`와 gap 4px는 그대로다(결정 3).
  - 검증: `npm --prefix app test`에서 `Home.test.tsx` 'suggestion CSS'에 더한 기대(두 줄 규칙, `.suggestion + .suggestion::before`의 `height: 1px`·`background: var(--border-standard)`·`inset-inline: var(--space-3)`, `.home-suggestions`·`.ov-suggestions`의 gap `var(--space-1)` 그대로)가 통과하고(바꾸기 전 red), `npm --prefix app run typecheck`가 통과한다.
- [ ] U2. 항목 2: `CanvasAgent.tsx`의 `DotField` draw callback이 `autoCursor`의 자리와 `opposingCursor`의 자리를 `drawDotField`에 넘기고, reduced motion(`elapsed === null`)에서는 빈 목록을 넘긴다(design §2.2, §7).
  - 검증: `npm --prefix app test`에서 `CanvasAgent.test.tsx`·`CanvasAgent.hooks.test.tsx`가 통과하고, `npm --prefix app run typecheck`가 통과한다.
- [ ] U3. 항목 3: `styles.css:501`의 `.shell-group .shell-empty` padding을 `var(--space-3)`으로(위아래 8 → 12px, 좌우 12px 그대로, margin 그대로; design §2.3, 결정 4).
  - 검증: `npm --prefix app test`에서 `ShellSidebar.test.tsx` 'an empty group's line is a dashed box'에 더한 `padding: var(--space-3)` 기대와 margin `var(--space-half) 10px var(--space-2) 34px`가 그대로라는 기대가 통과하고(바꾸기 전 red), group 밖 `.shell-empty`에 dashed가 없다는 기존 기대도 통과한다.

- [ ] U4. 항목 4: `ComposerParts.tsx`의 `SuggestionLabel`, 세 화면(`HomeComposerView.tsx:561`, `ProjectOverview.tsx:403`, `CanvasConversationPanel.tsx:436`)이 그것을 쓰고, `styles.css`의 `.suggestion-value`와 745행 주석, `ds/checks.test.ts` `violetAllowed`에 `.suggestion-value`(design §2.1b, 결정 7·8). U1 뒤에 한다.
  - 검증: `npm --prefix app test`에서 `Home.test.tsx`(Home 제안 render에 `.suggestion-value`가 있고 버튼 이름이 문장 그대로, `.suggestion-value`의 값이 `.anchor-chip`과 같고 `box-decoration-break: clone`), `ProjectOverview.test.tsx`·`CanvasConversationPanel.test.tsx`의 제안 render 기대, `ds/checks.test.ts`가 통과하고(바꾸기 전 red), `npm --prefix app run typecheck`가 통과한다.

커밋 경계: U1(항목 1), U2(항목 2), U3(항목 3), U4(항목 4)를 각각 따로.

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`로 바뀐 동작만 짧게 본다(격리 userData·HOME·SHELL·`DOAN_RUNTIME`, probe는 `.scratch/runtime-test/small-ui-tweaks/`).
  - (a) 항목 1: 초안(D1)에서 정한 모양대로인지 본다. 구분선이 첫 행 위와 마지막 행 아래에는 없고, 행 사이에서 1px `--border-standard`, 양 끝 12px 들임, 위 행과 2px·아래 행과 1px인지 잰다. 긴 이름의 캔버스가 있는 임시 repo에서 캔버스 panel을 280px로 줄이고 새 대화 상태의 제안 행이 두 줄과 말줄임표로 끝나는지, 공백 없는 이름이 행 밖으로 넘치지 않는지, 한 줄 행의 padding·gap이 그대로인지 computed style로 잰다. Overview 960×600과 Home 1238×780도 한 번씩 본다. Home에서 글을 쳐도 composer card의 위치가 그대로인지 잰다.
  - (d) 항목 4: panel 280에서 이름이 두 줄에 걸친 행(예: "Review the context-window-ring canvas")의 두 조각이 각각 padding 6px와 6px 모서리를 가지는지, 색·굵기가 anchor chip과 같은지 computed style로 잰다. hover·pressed·focus에서 하이라이트가 그대로인지, 접근 이름이 문장 그대로인지(CDP accessibility) 본다.
  - (b) 항목 2: 터미널 작업 신호(`doan work start`, 격리 `DOAN_RUNTIME`)로 점 무늬를 띄우고, 두 자리가 보이는 화면과 한가운데에서 만나는 순간 앞뒤의 화면을 남긴다. rAF 간격을 10초 이상 기록해 16ms를 넘는 프레임 비율을 적는다. reduced motion을 켠 창에서 자리 없는 멈춘 무늬인지 본다. 사람이 병합 전에 실제 앱에서 움직임을 본다(design §5).
  - (c) 항목 3: 캔버스가 없는 폴더를 project로 더해 펼치고, 두 group의 상자 크기(160×42px), padding 12/12, 바깥 여백 2/10/8/34와 글이 상자 가운데에 있는지 잰다. Not set up project의 상태 줄이 그대로인지 본다.
  - 검증: 위 측정값과 화면이 `.scratch/runtime-test/small-ui-tweaks/`에 남고, 자동으로 확인하지 못한 것(실제 시스템 reduced motion 설정 등)은 미검증으로 보고한다. (b)에서 16ms를 넘는 프레임이 눈에 띄게 늘면 멈추고 보고한다(design §2.2 성능 위험).
- [ ] R2. 공유 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## Z. 문서 승격

- [ ] Z1. design §11대로 DESIGN.md('Home' 'Suggestions', 'Project Overview'·'Canvas conversation panel'의 suggestions 행, 'Accent places', 'Canvas area and right panel' 'Agent glow and dots'와 References 'Dot field', 'App shell' 'Sidebar groups')를 지금 규칙과 R1 측정값으로 고친다(영어). PRODUCT.md와 ARCHITECTURE.md는 바뀌지 않는다. 초안 `.doan/canvases/small-ui-tweaks.html`은 남긴다(다른 초안처럼 이력으로). 그 뒤 `docs/features/small-ui-tweaks/`를 지운다.
  - 검증: `rg -n "ellipsized on one line|160×34px|a virtual cursor of radius" docs/DESIGN.md`가 아무것도 찾지 않고, `rg -n "small-ui-tweaks" docs AGENTS.md README.md`가 지워진 디렉터리를 가리키는 링크를 찾지 않는다.

커밋 경계: Z1(문서마다 따로, AGENTS.md 'Commit conventions').
