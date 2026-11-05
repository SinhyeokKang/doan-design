# small-ui-tweaks — spec

사람의 요청(세 항목을 한 feature로 묶는다):

1. "제안 프롬프트 버튼 2행까지 개행"
2. "캔버스 에이전트 작업 안내 Dot animation, 반대방향 노드 하나 추가. 서로 중앙에서 만났다가 교차해서 지나가는 거임."
3. "사이드바 empty dashed box pt 넓히기 또는 빈 폴더 열었을 때 굳이 empty 박스 자체를 보여주지 않기."
4. "하이라이트 치고 싶음. 연보라 배경에 보라색 medium" (2026-11-06, 제안 프롬프트 버튼의 project 이름·캔버스 이름), "앵커 칩 프리미티브를 재사용할 수 있으면 하되, 힘들 듯?"

항목 2·3은 해석이 둘 이상이었다. 사람이 정한 해석은 design '결정'에 있고(2026-11-06), 아래 완료 조건은 그 결정을 따른다. 항목 3의 "pt"는 문구 위 간격이 아니라 상자 자체의 위아래 padding(py)이다(사람).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다. 세 항목 모두 이미 있는 앱 화면의 모양과 움직임만 바꾼다. CLI, skill, 형식(schema)은 바뀌지 않는다.
- 항목 3은 빈 상자를 계속 보이므로 PRODUCT §5 item 1의 "each with a count … and shown even when empty"(`docs/PRODUCT.md:173`)와 그대로 맞는다.

## 사용자

- **사람(앱 사용자)**만 대상이다. 에이전트(CLI·skill)가 받는 것은 바뀌지 않는다.
  - 항목 1: Home, project Overview, 캔버스 conversation panel의 제안 프롬프트에서 긴 문장을 더 많이 읽는다.
  - 항목 2: 캔버스에서 에이전트가 일하는 동안 보드의 점 무늬에서 밝은 자리 두 개가 서로 반대로 움직이며 가운데에서 엇갈린다.
  - 항목 3: 캔버스가 없는 group의 빈 줄 상자가 위아래로 더 넉넉해진다.
  - 항목 4: 제안 프롬프트에서 어느 project나 캔버스를 가리키는지 연보라 하이라이트로 바로 찾는다.

## 문제(지금 관찰된 사실)

1. **제안 프롬프트가 한 줄에서 잘린다.** `.suggestion-label`이 `white-space: nowrap`과 `text-overflow: ellipsis`로 한 줄만 보인다(`app/src/renderer/styles.css:744`). 문장에는 project 이름이나 캔버스 이름이 들어간다("Document the design system of <project>", "Review the <canvas> canvas", `app/src/renderer/homeComposer.ts:340-348`). 그래서 캔버스 conversation panel(최소 280px)이나 좁은 Overview에서는 캔버스 이름이 잘려 어느 캔버스인지 읽기 어렵다. 전체 문장은 Home에서는 tooltip(`HomeComposerView.tsx:562`), Overview와 panel에서는 `title` 속성(`ProjectOverview.tsx:401`, `CanvasConversationPanel.tsx:434`)으로만 보인다. 초안도 한 줄을 정했다(`.doan/canvases/suggested-prompt-variants.html` variant C "Long sentences keep one line"; 두 줄로 줄이는 것은 variant B였다).
2. **점 무늬에는 밝은 자리가 하나뿐이다.** 에이전트 표시의 점 무늬(dot field)는 보드 전체에 12px 간격 점을 그리고, 반지름 320px의 밝은 자리(가상 커서) 하나가 5줄을 지그재그로 320px/s로 훑는다(`CanvasAgent.tsx:96-100`, `dotField.ts:29-59` `autoCursor`, `agentIndicator.ts:108` `DOT_FIELD`, DESIGN.md 'Canvas area and right panel' References 'Dot field'). 반대로 움직이는 두 번째 자리는 없다.
3. **빈 group의 dashed 상자는 위아래 padding 8px, 높이 34px이다.** 빈 group의 줄("No design system yet", "No canvases yet", `sidebarGroups.ts:18-21`)은 dashed 상자이고, 바깥 여백이 위 2px · 오른쪽 10px · 아래 8px · 왼쪽 34px, 안쪽 padding이 8px/12px이다(`styles.css:501`, DESIGN.md 'App shell' 'Sidebar groups' "margins 2/10/8/34 (160×34px at the default width)"). 캔버스가 하나도 없는 폴더를 열면 두 group 모두 이 상자를 보인다(`ShellSidebar.tsx:351`, `ShellSidebar.test.tsx:136-146`).

4. **제안 프롬프트의 이름이 문장과 같은 모양이다.** 문장은 문자열 하나(`SuggestedPrompt.label`, `homeComposer.ts:329`)이고, 세 화면이 그대로 `.suggestion-label` 안에 넣는다(`HomeComposerView.tsx:561`, `ProjectOverview.tsx:403`, `CanvasConversationPanel.tsx:436`). 바뀌는 값인 project 이름("Document the design system of <project>", `homeComposer.ts:346`)과 캔버스 이름("Review / Polish the <canvas> canvas", `homeComposer.ts:347-348`, `canvasTree.ts:30` `canvasLabel`)이 고정 문구와 같은 표준 글자색과 굵기다(`styles.css:745` 주석 "the sentence stays standard ink (2026-10-29 user)").

## 완료 조건

### 항목 1. 제안 프롬프트 두 줄

- Home, Overview, 캔버스 panel의 제안 프롬프트 문장이 행 너비 안에서 줄바꿈하고, 최대 두 줄까지 보인다. 두 줄을 넘으면 둘째 줄 끝이 말줄임표로 끝난다.
- 공백 없이 긴 이름(예: `design_system_canvases`)도 행 밖으로 넘치지 않고 줄 안에서 끊긴다.
- 한 줄에 들어가는 문장의 행은 지금과 같다(padding 8/12/8/8, gap 12, 24px 아이콘 타일, DESIGN.md 'Home' 'Suggestions'). 두 줄 행은 글 줄 하나(20px)만큼 높아진다.
- 이웃한 제안 행 사이에 1px 구분선이 있다(design 결정 5). 색은 `--border-standard`이고, 행 사이 gap 4px 안에서 위 행과 2px·아래 행과 1px 떨어지며, 양 끝을 12px 들인다. 첫 행 위와 마지막 행 아래에는 없다. hover·pressed·focus에서도 선은 그대로 보인다(숨기는 규칙 없음).
- 하이픈이 있는 캔버스 이름은 하이픈 뒤에서 줄이 바뀔 수 있다(design 결정 6).
- 전체 문장은 지금처럼 Home의 tooltip과 Overview·panel의 `title`에 남는다.
- Home에서 글을 쳐도 composer가 움직이지 않는다(DESIGN.md 'Home' 'Composer stays put'). 제안이 두 줄이 되어 group 높이가 달라지면 `HomeStage`가 다시 잰다(`HomeComposerView.tsx:107-130`).
- 초안 `.doan/canvases/small-ui-tweaks.html`의 C 안(구분선)을 사람이 확정했다(2026-11-06). 구현은 그 모양을 따른다.
- 검증: `npm --prefix app test`의 CSS 테스트(`Home.test.tsx` 'suggestion CSS')가 두 줄 규칙과 구분선을 고정하고, 실제 앱에서 panel 280px와 Overview 960×600으로 긴 캔버스 이름의 행이 두 줄·말줄임표로 보이는 것을 잰다(`/runtime-test`).

### 항목 2. 점 무늬의 두 번째 자리

- 에이전트 표시가 보이는 동안 점 무늬에 밝은 자리가 둘 있다. 둘째 자리는 첫째 자리와 같은 길을 거꾸로 간다(보드 중심에 대한 점대칭, `(width − x, height − y)`). 둘은 가운데 줄(5줄 중 셋째)에서 서로 반대 방향으로 움직이다 보드 한가운데에서 만나고, 엇갈려 지나간다.
- 두 자리가 겹치는 곳의 점은 더 가까운 자리 기준으로 밝기와 크기를 받는다. 그래서 점의 최대 크기 2px와 최대 alpha 0.5(DESIGN.md 'Canvas area and right panel' 'Dot field')를 넘지 않는다.
- 속도(320px/s), 줄 수(5), 반지름(320px), 간격(12px), 색은 그대로다.
- `prefers-reduced-motion`에서는 지금처럼 밝은 자리 없이 멈춘 점 무늬만 그린다. 숨은 workspace·window에서 loop가 멈추는 규칙(ARCHITECTURE §3 'Agent indicator', `agentIndicator.ts:135-138`)도 그대로다.
- notice 캡슐(`.doan-agent`)의 모양, 글, 8px 점은 바뀌지 않는다.
- 검증: `npm --prefix app test`의 `dotField.test.ts`·`agentIndicator.test.ts`가 둘째 자리의 위치, 한가운데에서 만나는 시각, 겹친 자리의 최대값, reduced motion에서 자리가 없음을 고정한다. 실제 앱에서 두 자리가 보이고 프레임이 떨어지지 않는지 잰다(`/runtime-test`).

### 항목 3. 사이드바 빈 group 상자

- 빈 group의 dashed 상자는 계속 보인다. 안쪽 padding이 위아래 12px(`--space-3`), 좌우 12px이 되어 상자가 기본 사이드바 너비에서 160×42px이 된다(지금 160×34px). 글은 상자 가운데에 있다.
- 바깥 여백(위 2 · 오른쪽 10 · 아래 8 · 왼쪽 34px), 테두리, 모서리, 글 크기와 색은 그대로다.
- project가 Not set up일 때의 상태 줄(같은 `.shell-empty` class, 상자 없음, padding 6/10/10/34)은 바뀌지 않는다.
- Overview의 Canvas conversations 빈 상자(`.rp-empty`, `styles.css:1097`)는 바뀌지 않는다.
- 검증: `npm --prefix app test`의 `ShellSidebar.test.tsx` CSS 테스트가 `padding: var(--space-3)`을 고정하고, 실제 앱에서 빈 폴더 project를 펼쳐 상자 크기(160×42px)와 padding 12/12를 잰다(`/runtime-test`).

### 항목 4. 제안 프롬프트의 이름 하이라이트

- 초안 `.doan/canvases/small-ui-tweaks.html`의 C 행 하이라이트를 사람이 확정했다(2026-11-06, design 결정 7·8). 구현은 그 모양을 따른다. anchor chip component는 쓰지 않고 그 값만 쓴다.
- 제안 문장의 project 이름과 캔버스 이름이 연보라 배경(`--surface-accent-subtle`)에 보라 글자(`--text-accent-subtle`), medium 굵기(`--type-weight-medium`)로 보인다. 모서리 6px, 좌우 padding 6px(`--space-1h`)는 anchor chip(`.anchor-chip`, `styles.css:580`)과 같다. 고정 문구("Get to know this project", "Plan the first screen", "Document the design system")에는 하이라이트가 없다.
- 하이라이트는 문장과 함께 줄을 바꾼다. 이름이 두 줄에 걸치면 줄마다 조각이 따로 padding과 모서리를 가진다(design 결정 8). 두 줄을 넘으면 지금처럼 둘째 줄 끝이 말줄임표다.
- 행 사이 구분선(결정 5), 두 줄 규칙(항목 1), hover·pressed 채움과 focus 고리는 그대로이고, 하이라이트는 그 채움 위에 놓인다.
- 버튼의 접근 이름, Home의 tooltip, Overview·panel의 `title`, React key는 지금처럼 문장 전체 그대로다. 제안을 눌렀을 때 composer에 들어가는 글(`SuggestedPrompt.text`)도 그대로다.
- `.anchor-chip` 규칙과 composer의 chip(`chipField`)은 바뀌지 않는다.
- 검증: `npm --prefix app test`에서 `homeComposer.test.ts`가 문장 조각(이름이 표시된 조각을 이으면 `label`과 같음)을 고정하고, 세 화면의 render 테스트가 `.suggestion-value`와 바뀌지 않은 접근 이름을 보고, `Home.test.tsx`의 CSS 테스트와 `ds/checks.test.ts`의 accent 자리 목록이 통과한다. 실제 앱에서 panel 280px로 이름이 두 줄에 걸친 행을 잰다(`/runtime-test`).

## 하지 않는 것

- 제안 프롬프트의 문장, 개수, 고르는 규칙, tooltip 조건(잘리지 않아도 보이는 Home tooltip 포함)은 바꾸지 않는다.
- 제안 프롬프트를 세 줄 이상 보이거나 펼치는 동작은 없다.
- 점 무늬의 속도·크기·색, glow, notice 캡슐의 점(`.doan-agent-dot`)과 글은 바꾸지 않는다. notice의 글과 커서는 `work-update`가 바꾼다.
- 사이드바 group의 개수, 순서, 접힘 기억, 빈 줄 문구, 빈 상자를 보이는 조건은 바꾸지 않는다.
- 항목 2·3은 UI 초안을 그리지 않는다. 항목 1과 4만 초안이 있다(design §5 '초안 요청').
- 항목 4는 composer에 들어가는 글, preset chip, anchor chip, Quick Open이나 다른 곳의 캔버스 이름 표시를 바꾸지 않는다.
