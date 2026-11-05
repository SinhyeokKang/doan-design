# small-ui-tweaks — design

네 항목은 모두 앱 renderer만 바꾼다. 항목 4는 항목 1과 같은 제안 행을 바꾸고, 나머지는 서로 독립이다. 해석이 갈리던 점, 초안에서 드러난 점, 줄 수는 모두 사람이 정했다(아래 '결정').

## 결정

1. **항목 2의 대상은 보드 점 무늬의 밝은 자리다(사람, 2026-11-06).** 가상 커서(`CanvasAgent.tsx:96-100`, `dotField.ts:29` `autoCursor`)가 대상이고, notice 캡슐의 8px 점(`.doan-agent-dot`)은 바뀌지 않는다. 이유: 방향을 가지고 움직이는 "노드"는 점 무늬의 밝은 자리뿐이다.
2. **둘째 자리는 같은 길을 거꾸로 간다(점대칭 `(width − x, height − y)`, 사람, 2026-11-06).** 한 주기에 한 번 보드 한가운데에서 만나 엇갈린다(1238×780 창의 보드를 약 650×715px로 어림하면 약 22초마다). 이유: "반대방향"은 같은 길을 거꾸로 가는 것이고 "중앙"은 보드 한가운데 한 곳이다.
3. **여러 줄 제안 행의 아이콘 타일과 화살표는 행 가운데에 둔다(사람, 2026-11-06).** `.suggestion`의 `align-items: center`를 그대로 둔다. 이유: 한 줄 행이 그대로이고 위치 보정 규칙을 더하지 않는다.
4. **빈 group의 dashed 상자는 계속 보이고, 상자 자체를 위아래 안쪽 padding으로 키운다(사람, 2026-11-06).** 사람의 말: "dashed 상자 자체의 높이를 키운다는 말임. 문구의 pt가 아니고 py". padding 위아래 8px → 12px(`--space-3`), 상자 높이 34px → 42px. 바깥 여백(group 머리 아래 2px 등 2/10/8/34)과 좌우 padding 12px은 그대로다. 이유: 상자가 납작해 보이는 것이 문제였고, 위아래를 같이 넓혀야 글이 상자 가운데에 남는다.
5. **제안 행 사이에 1px 구분선을 둔다(사람, 2026-11-06, 초안 확인).** 색은 `--border-standard`, 두께 1px, gap 4px는 그대로이고, 선은 그 안에서 위 행과 2px, 아래 행과 1px 떨어지며 양 끝을 12px(`--space-3`) 들인다(공유 메뉴 구분선 `.doan-menu-sep`과 같은 색, 두께, 들임). hover·pressed·focus 행 옆의 선을 숨기는 규칙은 두지 않는다: 채움은 선에서 1–2px 떨어져 선이 그대로 보이고, focus 고리는 gap을 덮어 선 위로 지나간다. Home, Overview, panel 세 곳 모두 같다. 이유: 여러 줄 행이 쌓였을 때 버튼과 버튼 사이가 휴지 상태에서도 가장 뚜렷하게 나뉜다(비교한 안: 그대로, gap 8px).
6. **하이픈이 있는 캔버스 이름은 하이픈 뒤에서 줄이 바뀌어도 된다(사람, 2026-11-06).** "Review the context-" / "window-ring canvas"처럼 나뉜다. 이유: 이름을 한 덩어리로 묶으려면 label 모양과 세 화면의 TSX가 바뀌고, 좁은 panel에서는 이름이 결국 다시 잘린다.
7. **(항목 4) 제안 문장의 project 이름과 캔버스 이름을 anchor chip의 값으로 하이라이트하고, 문장과 함께 줄을 바꾼다(사람, 2026-11-06, 초안 확인).** 사람의 말: "하이라이트 치고 싶음. 연보라 배경에 보라색 medium", "앵커 칩 프리미티브를 재사용할 수 있으면 하되, 힘들 듯?", 초안을 보고 "이거지 가독성이 확올라가노". 새 inline 하이라이트 `.suggestion-value`가 `.anchor-chip`(`styles.css:580`)과 같은 값을 쓴다: `--surface-accent-subtle` 배경, `--text-accent-subtle` 글자, `--type-weight-medium`, 모서리 6px, padding 0 `--space-1h`. `.anchor-chip` component 자체는 쓰지 않는다. 그 규칙은 `inline-flex`, `white-space: nowrap`, `max-width: 180px`와 안쪽 span의 말줄임표라서 여러 줄에 걸쳐 줄을 바꿀 수 없고 긴 캔버스 이름을 자르며(초안을 다듬기 전 `separation` frame에 진짜 `.anchor-chip`을 넣어 비교했다, `e1f8a274`), composer의 편집할 수 없는 chip(`chipField`)이기 때문이다. `.anchor-chip` 규칙은 고치지 않고, 두 규칙의 값이 같다는 것을 CSS 테스트가 고정한다. 이유: 요청한 모양을 그대로 얻으면서 이름이 여러 줄에 걸쳐도 끝까지 보이고, composer chip을 건드리지 않는다.
8. **(항목 4) 이름이 줄을 넘으면 조각마다 padding과 모서리를 따로 가진다(`box-decoration-break: clone`, 사람, 2026-11-06, 초안 확인).** 초안의 하이라이트가 clone으로 그려졌고 사람이 그 모양을 확인했다. 이유: "context-" / "window-ring"처럼 조각마다 완결된 하이라이트로 보여 한 이름의 두 조각임을 읽기 쉽다(비교한 안: 기본값 slice, 줄 끝 조각이 각지고 padding이 없다).
9. **제안 문장은 세 줄까지 보인다(`-webkit-line-clamp: 3`, 사람, 2026-11-06).** 사람의 말: "생각보다 프롬프트 버튼 구분감이 생겼는데 과감히 3행까지 갈까?" 요청 1의 "2행까지"를 바꾼다. 세 줄을 넘으면 셋째 줄 끝이 말줄임표다. 이유: 행 사이 구분선(결정 5)으로 버튼끼리 구분되므로 더 높은 행도 읽히고, 하이라이트 padding 때문에 두 줄에서 잘리던 캔버스 이름 문장(panel 280의 "Polish the onboarding-welcome-variants canvas")이 끝까지 보인다.

## 1. 영향받는 부분

| 부분 | 변경 |
|---|---|
| 앱 renderer | 항목 1: `styles.css`의 `.suggestion-label`(744행). 항목 2: `dotField.ts`, `agentIndicator.ts`의 `drawDotField`(114-133행), `CanvasAgent.tsx`의 `DotField` draw callback(96-100행). 항목 3: `styles.css`의 `.shell-group .shell-empty`(501행). 항목 4: `homeComposer.ts`의 `SuggestedPrompt`와 `suggestedPrompts`(329-355행), `ComposerParts.tsx`의 새 공유 component, 세 화면의 제안 행(`HomeComposerView.tsx:561`, `ProjectOverview.tsx:403`, `CanvasConversationPanel.tsx:436`), `styles.css`의 `.suggestion-value`와 745행 주석, `ds/checks.test.ts`의 accent 자리 목록. |
| 앱 main, preload | 없음 |
| CLI(Go) | 없음 |
| skill | 없음 |
| 형식 | 없음(comment event, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지 모두 그대로) |

## 2. 항목별 설계

### 2.1 항목 1: 제안 프롬프트 세 줄

- 세 화면(Home `HomeComposerView.tsx:559-563`, Overview `ProjectOverview.tsx:400-403`, 캔버스 panel `CanvasConversationPanel.tsx:433-436`)이 같은 `.suggestion` 행과 `.suggestion-label`을 쓰므로 CSS 한 곳만 바꾼다. TSX는 바뀌지 않는다.
- `.suggestion-label`을 `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; overflow-wrap: anywhere;`로 바꾸고(결정 9) `white-space: nowrap`과 `text-overflow: ellipsis`를 뺀다. 선례는 Canvas conversations 행의 미리보기 `.cv-preview`(`styles.css:1095`)이고, 줄 수만 다르고 같은 선언을 쓴다. `flex: 1; min-width: 0`은 그대로 둔다.
- 행의 `align-items: center`는 그대로다(결정 3). 행 높이는 위아래 padding 16px에 글 줄 수 × 20px(한 줄이면 24px 타일)이라 한 줄 40px, 두 줄 56px, 세 줄 76px이다. 글 줄이 20px씩 늘지만 한 줄 행은 24px 타일이 높이를 정하므로 한 줄→두 줄은 16px, 두 줄→세 줄은 20px 높아진다. 24px 타일과 14px 화살표는 행 가운데에 놓인다.
- Home 배치: `HomeStage`는 기준 높이에 제안 group을 넣어 재고(`HomeComposerView.tsx:107-118`), panel이나 group 크기가 바뀌면 다시 잰다. 제안이 여러 줄이 되면 group이 높아져 stage의 위 여백이 다시 계산된다. 글을 칠 때는 제안이 `visibility: hidden`으로 자리를 지키므로(`styles.css:738`) composer가 움직이지 않는다는 규칙은 그대로다. Home의 행은 680px라 지금 문장은 대부분 한 줄이고, 여러 줄은 주로 panel(최소 280px)과 좁은 Overview에서 생긴다. 세 줄 행이 있으면 Home group이 한 줄 행보다 36px 높아지고 `HomeStage`가 그만큼 위 여백을 다시 계산한다.
- tooltip과 `title`은 그대로 둔다(spec '하지 않는 것').
- 행 사이 구분선(결정 5): `.suggestion`에 `position: relative`를 더하고, `.suggestion + .suggestion::before { content: ""; position: absolute; inset-inline: var(--space-3); top: calc(var(--space-half) * -1 - 1px); height: 1px; background: var(--border-standard); pointer-events: none; }`를 둔다(초안 `.v-divider` 규칙). 첫 행 위와 마지막 행 아래에는 선이 없다. `.home-suggestions`·`.ov-suggestions`의 gap 4px(`--space-1`)는 그대로다. hover·pressed·focus 행 옆의 선을 숨기는 규칙은 없다.
- 줄바꿈 위치(결정 6): `overflow-wrap: anywhere` 말고 다른 규칙은 없다. 하이픈 뒤 줄바꿈은 브라우저 기본 동작이다.
- 초안 `.doan/canvases/suggested-prompt-variants.html`의 variant C 설명("Long sentences keep one line")은 이 화면의 첫 구현이 main에 있으므로 정본이 아니다(AGENTS.md 'Workflow' `/design-sync`). 새 규칙은 DESIGN.md 'Home' 'Suggestions'에 적는다(tasks Z1).

### 2.1b 항목 4: 이름 하이라이트(결정 7·8)

- 형식: `SuggestedPrompt`(`homeComposer.ts:329`)에 `parts: readonly { text: string; value: boolean }[]`를 더한다. `label`은 지금처럼 문장 전체 문자열로 남겨 tooltip, `title`, React key, 접근 이름이 그대로 쓴다. `parts`는 문자열을 다시 쪼개지 않고 `suggestedPrompts`가 문장을 만들 때 함께 만든다: `plain`은 `[{ text: label, value: false }]`, "Document the design system of " + project, `named`는 "Review the " / "Polish the " + `canvasLabel(row)` + " canvas". `text`(composer에 들어가는 글)는 바뀌지 않는다.
- 공유 component: `ComposerParts.tsx`(이미 `GroupIcon`이 있는 곳)에 `SuggestionLabel({ parts })`를 두고 `<span className="suggestion-label">` 안에 `value` 조각만 `<span className="suggestion-value">`로 감싼다. 세 화면은 `{prompt.label}` 자리에 이 component를 쓴다. 감싼 span은 글을 바꾸지 않으므로 버튼의 접근 이름은 지금 문장 그대로이고 `aria-label`을 따로 두지 않는다.
- CSS(결정 7·8): `.suggestion-value { padding: 0 var(--space-1h); border-radius: 6px; background: var(--surface-accent-subtle); color: var(--text-accent-subtle); font-weight: var(--type-weight-medium); -webkit-box-decoration-break: clone; box-decoration-break: clone; }`. display는 기본 `inline`이다. 각 값이 이미 쓰이는 곳: 두 색은 anchor chip(`styles.css:580`)과 preset chip(`styles.css:625`), medium 굵기는 같은 두 곳과 `.bubble-preset`(`styles.css:893`), 6px 모서리와 `--space-1h` padding은 anchor chip. 새 token이나 색 리터럴은 없다.
- 세 줄 규칙과 함께: 하이라이트는 inline이라 문장과 같이 줄을 바꾼다. 좌우 padding 6px가 폭을 차지하므로 하이라이트가 없을 때보다 조금 일찍 줄이 바뀐다. 초안에서 panel 280의 "Polish the onboarding-welcome-variants canvas"는 이 때문에 세 줄이 된다(두 줄까지였을 때는 " canvas"가 말줄임표 뒤로 사라졌다). 말줄임표는 줄 끝 조각 뒤에 붙는다. 배경은 글자 높이만 칠하고(위아래 padding 없음) 줄 높이 20px 안에 있어, 위아래 줄의 조각이 서로 닿지 않는다.
- 구분선과 상태: 하이라이트는 행 안의 글이라 행 사이 구분선(결정 5)과 겹치지 않는다. hover·pressed의 반투명 회색 채움(`--affordance-subtle`, `--affordance-subtle-pressed`) 위에 하이라이트의 불투명한 연보라가 그대로 놓이고, focus 고리는 행 바깥이라 하이라이트와 닿지 않는다. 상태마다 하이라이트를 바꾸는 규칙은 두지 않는다.
- accent 자리: DESIGN.md 'Accent places'와 `ds/checks.test.ts`의 `violetAllowed`는 보라를 쓰는 selector를 고정한다. `.suggestion-value`를 더하고, `styles.css:745`의 "the sentence stays standard ink" 주석을 이름만 accent라고 고친다.

### 2.2 항목 2: 점 무늬의 두 번째 자리(결정 1·2)

- 지금: 매 프레임 `autoCursor(elapsed, width, height, 320, 5, 320)`가 자리 하나를 주고(`CanvasAgent.tsx:98`), `drawDotField(ctx, width, height, dots, spot, color)`가 `partitionDots`로 반지름 안의 점(near)과 밖의 점(far)을 나눠 far는 한 path로, near는 거리별 크기·alpha로 하나씩 그린다(`agentIndicator.ts:114-133`). reduced motion에서는 `DotFieldLoop`가 `draw(null)`을 불러(`agentIndicator.ts:145-158`) 자리 없는 멈춘 무늬를 그린다.
- 둘째 자리: `B = (width − A.x, height − A.y)`. `autoCursor`의 지그재그는 줄 수가 홀수이면 시간을 거꾸로 돌린 길(`A(cycle − t)`)과 점대칭이 같다. 그래서 B는 A의 길을 거꾸로 같은 속도로 간다. 두 자리가 같은 점에 있으려면 A가 보드 중심에 있어야 하고, A는 한 주기에 한 번 가운데 줄(셋째 줄, 왼쪽→오른쪽)에서 중심을 지난다. 그때 B는 같은 줄을 오른쪽→왼쪽으로 지나므로 둘이 만나 엇갈린다. 줄 수가 짝수면 가운데 줄이 없어 만나지 않으므로, `DOT_FIELD.rows`(5)가 홀수임을 테스트로 고정한다. overshoot(320)로 보드 밖에 나간 자리도 대칭이 그대로 성립한다.
- 겹침: near 판정은 "어느 자리든 반지름 안"이고, 점의 크기와 alpha는 가장 가까운 자리까지의 거리로 정한다(`dotScale`). 두 자리의 밝기를 더하지 않으므로 최대 크기 2px와 최대 alpha 0.5가 그대로다.
- 함수 모양(§3): `partitionDots(dots, spots, radius)`가 자리 목록을 받고, near 점마다 가장 가까운 거리를 함께 돌려준다(그리기에서 다시 재지 않도록). `drawDotField`는 `spot: Dot | null` 대신 `spots: readonly Dot[]`를 받는다. reduced motion의 `draw(null)`은 빈 목록이 된다. `dotField.ts` 머리 주석은 malmoi 포팅이라고 적혀 있으므로(1-2행), 자리 여러 개와 점대칭 자리는 Doan이 더한 것이라고 적는다(외부 출처 없음, 사람의 요청).
- 성능 위험: near 점은 하나씩 `beginPath`·`arc`·`fill`을 부른다. 반지름 320, 간격 12면 자리 하나에 near 점이 최대 약 2,200개(π·320²/12²)이고, 둘이면 약 4,400개가 된다. 실제 앱에서 프레임 간격을 재고(tasks R1), 60fps(약 16ms)를 지키지 못할 때만 near 점을 alpha 단계로 묶어 path 수를 줄인다. 미리 묶지 않는다.

### 2.3 항목 3: 빈 group 상자(결정 4)

- `styles.css:501`의 `.shell-group .shell-empty`에서 `padding: var(--space-2) var(--space-3)`을 `padding: var(--space-3)`으로 바꾼다(위아래 8 → 12px, 좌우 12px 그대로). 글 줄이 16px이고 테두리가 위아래 1px씩이므로 상자 높이는 34 → 42px이고, 너비는 기본 사이드바 너비에서 160px 그대로다. margin(`var(--space-half) 10px var(--space-2) 34px`), 테두리, 모서리, 글, 가운데 정렬은 그대로다. 빈 group 하나마다 사이드바 목록이 8px 길어진다.
- Not set up project의 상태 줄은 `.shell-group` 밖의 `.shell-empty`(`ShellSidebar.tsx:353`, `styles.css:487-488`)라서 영향이 없다. `ShellSidebar.test.tsx:219`가 group 밖 `.shell-empty`에 dashed가 없음을 이미 고정한다.
- `monorepo-services`가 계획한 서비스 group도 같은 빈 줄 규칙을 쓰므로(그 design §4.3) 새 padding을 그대로 받는다.
- Overview의 Canvas conversations 빈 상자(`.rp-empty`, `styles.css:1097`)는 "The same dashed box as the sidebar's empty groups"라는 주석(`styles.css:1096`)이 있지만 padding(16)과 margin이 이미 다르고, 같은 것은 테두리와 모서리뿐이다. 바꾸지 않는다.

## 3. 순수 함수(`/tdd` 대상)

1. `partitionDots(dots, spots, radius)` → `{ near: { dot, distance }[]; far: Dot[] }` — 자리 목록 중 가장 가까운 자리까지의 거리로 나눈다. 빈 목록이면 모두 far. 경계(정확히 반지름)는 지금처럼 far다(`dotField.test.ts` 'puts the exact radius boundary outside').
2. `opposingCursor(spot, width, height)` → `Dot` — 점대칭 자리. 테스트: 한가운데에서 A와 같은 점, 셋째 줄에서 A와 반대 방향, 시간 역행 `autoCursor(cycle − t)`와 같음, 다른 시각에는 겹치지 않음, `DOT_FIELD.rows`가 홀수.
3. `drawDotField(ctx, width, height, dots, spots, color)` — 가짜 ctx로: 빈 목록이면 far 한 번만 칠함(지금 `agentIndicator.test.ts:288`의 null 경우), 두 자리가 겹친 곳의 alpha가 0.5를 넘지 않음, near 점의 크기가 가장 가까운 자리 기준.
4. `suggestedPrompts`의 `parts`(항목 4) — 조각을 이으면 `label`과 같음, project 이름과 `canvasLabel`만 `value: true`, 고정 문장은 조각 하나에 `value: false`, `text`는 그대로(`homeComposer.test.ts`).
5. CSS 고정 테스트(순수 함수는 아니지만 기존 선례대로 `styles.css`를 읽는 테스트): `.suggestion-label`의 세 줄 규칙(`-webkit-line-clamp: 3`)과 행 사이 구분선(`.suggestion + .suggestion::before`의 1px `--border-standard`, `inset-inline: var(--space-3)`; gap `var(--space-1)` 그대로)(`Home.test.tsx:195` 'suggestion CSS'에 더함), `.suggestion-value`의 하이라이트 값이 `.anchor-chip`과 같음과 `box-decoration-break: clone`(`Home.test.tsx`에 더함), `.shell-group .shell-empty`의 `padding: var(--space-3)`(`ShellSidebar.test.tsx:215` 'an empty group's line is a dashed box'에 더함).

## 4. 형식, 관례, 구조 결정

- 형식 변경: 없음. schema, fixture, `v` 모두 그대로다.
- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없음.
- ARCHITECTURE 구조 결정: 영향 없음. 점 무늬 loop가 보이지 않을 때 멈추는 규칙(ARCHITECTURE §3 'Agent indicator')은 그대로이고 자리 수와 무관하다.
- 의존성: 새 패키지 없음.

## 5. UI 초안(`/design-draft`) 필요 여부

- 항목 1: 필요하다(사람, 2026-11-06: "프롬프트는 캔버스 만들어서 보여달라고 해. 버튼간 구분감 확인해야돼"). 한 줄 행과 여러 줄 행이 섞여 쌓였을 때 이웃한 버튼이 구분되는지 사람이 초안에서 보고 정한 뒤 구현한다. 이 화면들의 첫 구현은 main에 있으므로 `/design-sync`는 해당하지 않는다(AGENTS.md 'Workflow'). 초안의 Proposed 타일은 사람이 확인한 구현의 시각 참고이고, Today 타일은 지금 main의 참고다. 구현 뒤에는 tasks R1이 실제 앱을 재고, 그 값을 DESIGN.md에 적는다(tasks Z1).
- 항목 2: 필요 없다. 캔버스는 정지 화면으로 검토되므로 움직임은 실제 앱에서 보는 편이 정확하고, 바뀌는 것은 자리 하나와 그 길뿐이다. 사람은 병합 전에 실제 앱에서 움직임을 본다(tasks R1).
- 항목 3: 필요 없다. padding 값 하나다.
- 항목 4: 같은 초안의 Proposed 행에 그렸다. 사람이 앱에서 보고 확정했다(2026-11-06, 결정 7·8).

### 초안 요청

- 캔버스 `.doan/canvases/small-ui-tweaks.html`, canvas id `small-ui-tweaks`, 너비 1440. 항목 1과 4를 그린다.
- frame: `panel-280`(캔버스 panel 최소 280, 행 247), `panel-320`(panel 320, 행 287), `overview`(Overview 960×600의 행 388과 1238×780의 행 666), `home`(Home 행 680), `separation`(panel 280에서 여러 줄 행을 쌓은 휴지·hover·pressed·keyboard focus).
- 각 host frame은 Today(지금 main, 참고)와 Proposed(결정 3·5–9: 세 줄까지, 행 사이 1px 구분선, clone 조각의 이름 하이라이트)를 나란히 둔다. `separation`은 Proposed 행의 휴지·hover·pressed·keyboard focus다. 결정 때 비교한 안(gap 8, 구분선 없음, slice, 진짜 `.anchor-chip`)은 사람의 요청(2026-11-06, "결정된 프레임만 남기는게 낫지 않음?")으로 지웠고, `e1f8a274`에 남아 있다. 문장은 `suggestedPrompts`의 실제 문장(이 repo의 캔버스 이름)과, 말줄임표와 공백 없는 이름을 보이기 위한 지어낸 긴 이름 둘이다.
- 행, 아이콘 타일, 화살표, gap, hover·pressed·focus 값은 `styles.css` 734-748행과 1014행을 그대로 옮긴다. 새로 그리는 것은 Proposed의 세 줄 규칙, 구분선, 이름 하이라이트다(§2.1, §2.1b).
- 상태: 사람 확인(2026-11-06, 결정 5–8). 그 뒤 고른 모양만 남기도록 다듬었다(2026-11-06).

## 6. 다른 feature와 겹치는 곳, 순서

- **`work-update`(chain-261106 링크 1)**: 작업 notice의 글, tooltip, 지우고 치기와 커서를 `CanvasAgent.tsx`의 notice 부분(50-75행)과 `agentIndicator.ts`의 `agentNoticeView`·고르기에서 바꾸고(그 tasks A5·A5b·U1), 승격 때 DESIGN.md 'Agent notice' 행을 고친다. 항목 2는 같은 두 파일의 다른 부분(`CanvasAgent.tsx` 6·8행 import, 96-100행 `DotField`; `agentIndicator.ts` 105-133행)과 `dotField.ts`를 바꾸고, 승격 때 같은 DESIGN.md 절의 'Agent glow and dots' 행과 References 'Dot field'를 고친다. 뜻은 겹치지 않지만 같은 파일과 같은 DESIGN 표를 고치므로, 이 feature는 `work-update`가 main에 병합된 뒤 최신 main에서 시작한다. `work-update`의 'project 대화의 표시'(그 spec 완료 조건 7)는 점 무늬를 project 대화에도 띄우므로, 두 자리도 그 경우에 그대로 보인다.
- **`canvas-handoff`(chain-261106 링크 2)**: 그 문서들은 `CanvasAgent.tsx`, `agentIndicator.ts`, 사이드바, 제안 프롬프트를 언급하지 않는다. 이 feature는 체인 밖이므로 체인의 직렬 순서에 끼어들지 않는다. `work-update` 병합 뒤 `canvas-handoff`와 나란히 진행해도 파일이 겹치지 않는다(둘 다 `styles.css`를 고치면 줄 단위 충돌만 생길 수 있다).
- **`context-window-ring`(chain-261105 링크 3, 지금 통합 중)**: `DockedComposer`의 tray와 두 호스트(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)의 `context` 전달, `styles.css`의 작은 링 규칙을 바꾼다(그 design §3). 항목 1은 `.suggestion-label` CSS만 바꾸지만, 항목 4는 같은 두 호스트의 제안 행(`ProjectOverview.tsx:403`, `CanvasConversationPanel.tsx:436`)을 공유 component로 바꾼다. 그 feature가 바꾸는 줄(composer에 `context` 전달)과는 떨어져 있어 뜻은 겹치지 않는다. 제안 행(`.ov-suggestions`)은 composer 카드 위에, 링은 카드 아래 tray에 있어 배치가 서로 얽히지 않는다. chain-261106이 그 병합 뒤에 시작하므로 이 feature도 그 뒤다.
- **`monorepo-services`**: 서비스 group이 빈 줄 규칙을 그대로 쓰므로 빈 서비스 group의 상자도 42px이 된다(§2.3). 그 feature가 계획한 테스트는 빈 줄이 있는지만 보므로 기대가 바뀌지 않는다.
- 순서 제안: `work-update` 병합 → 이 feature를 `/ship` 한 번으로(세 항목, 커밋은 항목별). 항목 1·3만 먼저 보내고 싶다면 겹치는 곳이 없어 지금도 가능하지만, 한 feature를 둘로 나누는 비용이 더 크다.

## 7. reduced motion

- 항목 2: 추가 처리가 필요 없다. `DotFieldLoop`가 reduced motion에서 `draw(null)`로 자리 없는 멈춘 무늬를 그리고, 설정이 바뀌면 loop를 다시 시작한다(`CanvasAgent.tsx:90-117`, `agentIndicator.ts:145-158`). 지켜야 할 것은 하나다: `null`(또는 빈 목록)이 "자리 없음"을 뜻해야 하고, 한가운데 자리 하나나 둘째 자리만 남으면 안 된다. 테스트로 고정한다(§3 3).
- notice 캡슐의 점(`.doan-agent-dot`)은 바뀌지 않으므로 그 reduced motion 규칙(`styles.css:1338`, `1341-1342`)도 그대로다.
- 항목 1·3: 움직임이 없다. 제안 행의 hover 배경 전환(`--time-state`)은 그대로다.

## 8. POSTMORTEM에서 가져온 주의

- 2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header': DESIGN에 적힌 측정값이 틀린 채로 기록되어 어긋남을 잡지 못했다. 항목 1·3의 새 값은 실제 앱에서 다시 재고 DESIGN.md에 적는다(tasks R1, Z1).
- 2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop': 점 무늬를 띄우는 조건(presence, root 범위)은 이 feature가 바꾸지 않는다. 자리 계산만 바뀌므로 그 규칙에 새 호출자를 더하지 않는다.
- 2026-10-23 'Re-hovering a dismissed tooltip did not reopen it', 'A preceding canvas tooltip was cached as a project path': 항목 1의 실제 앱 확인에서 Home 제안의 tooltip을 읽는다면, 앞 tooltip을 닫고 포인터를 밖으로 뺀 뒤 다음 행에 올린다.
- 잘림·reduced motion·sidebar 빈 줄에 직접 해당하는 기록은 없다(`docs/POSTMORTEM.md`에서 `reduced motion`, `ellips`, `truncat`, `line-clamp`, `dashed`, `empty` 검색).

## 9. 읽은 design preset

`doan design-skill --json`(설치된 `doan`)으로 목록을 보고 세 개를 읽었다.

- `animate`: "On working surfaces … motion serves feedback, state, and continuity", "Every animation needs a `prefers-reduced-motion` path", "Pause off-screen loops", "Target 60 fps". 항목 2는 이미 있는 작업 표시의 움직임 안에서 자리 하나를 더할 뿐이고, reduced motion 경로와 멈춤 규칙을 그대로 쓰며, 프레임 간격을 잰다(§2.2 성능 위험).
- `layout`: "Use the project's spacing scale through its token CSS variables rather than one-off values". 항목 3의 새 padding은 `--space-3`이다.
- `typeset`: "Stress: what happens with long headings, localization expansion, zoom, narrow containers". 항목 1은 좁은 panel과 공백 없는 긴 이름을 확인 대상에 넣는다.

## 10. PoC 의존

없다. 확인되지 않은 것은 항목 2의 그리기 비용(§2.2)뿐이고, 실제 앱 측정(tasks R1)에서 본다.

## 11. 승격 대상(tasks Z1)

- DESIGN.md 'Home' 'Suggestions'(369행): "the sentence ellipsized on one line"을 세 줄 규칙(행 높이 40/56/76)으로, 행 사이의 1px `--border-standard` 구분선(gap 4 안, 양 끝 12 들임)과 이름 하이라이트(anchor chip의 값, clone)를 더한다. 'Accent places'(84행)에 `.suggestion-value`를 더한다. 같은 요소를 다른 모양으로 적은 'Project Overview' 'Suggestions and moved line'(537행)과 'Canvas conversation panel' 'Suggestions'(707행)는 지금 코드(`.suggestion` 행, `ProjectOverview.tsx:401`, `CanvasConversationPanel.tsx:434`)와 이미 다르게 "sm `quiet` buttons"라고 적혀 있다. 이 feature가 그 요소를 바꾸므로 두 행도 지금 모양으로 고친다.
- DESIGN.md 'Canvas area and right panel' 'Agent glow and dots'(653행)와 References 'Dot field'(671행): 자리 둘, 점대칭, 겹친 곳의 최대값, 둘째 자리는 Doan이 더한 것.
- DESIGN.md 'App shell' 'Sidebar groups'(224행): 빈 줄 상자의 "padding 8/12"와 "(160×34px at the default width)"를 R1 측정값(예상: padding 12/12, 160×42px)으로. margins 2/10/8/34는 그대로다.
- PRODUCT.md: 바뀌지 않는다(§5 item 1의 group 규칙은 그대로이고, §5 item 2 'Agent indicator'는 "a dot field"만 말한다).
- ARCHITECTURE.md: 바뀌지 않는다.
