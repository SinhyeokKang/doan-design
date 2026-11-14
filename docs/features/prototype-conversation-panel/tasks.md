# prototype-conversation-panel — tasks

**실행**: 체인 261113-3이 끝난 뒤 별도의 `/orchestrate`로 돈다(체인 링크가 아니다). `prototype-conversation`(링크 3)이 develop에 병합된 뒤 최신 develop에서 `feat/prototype-conversation-panel`을 만든다. 링크 3은 고치지 않는다. 링크 3의 내부를 가리키는 design.md 문장은 1번에서 develop과 맞춘다.

포맷과 fixture 변경은 없다. 순서: 맞추기와 PoC → 초안 → 순수 함수 → main(I/O) → UI → 실제 앱 → 문서. 프롬프트·guide·CLI 출력이 바뀌지 않으므로 `/agent-eval`은 하지 않는다.

- [x] 1. 링크 3 병합본과 맞추기. design.md '링크 3과의 의존'의 표(오른쪽 무리 상수, `prototypePanelBounds`, `openPanelResize`, `prototypePanelFit`과 `fitted()`·`placed()`, `prototypeCaptureRect`의 넷째 인자와 `controller.ts`의 `prototypePanelWidth`, `.pw[data-panel="open"]` 규칙, `.doan-conv-column`의 `ref`·`onBlur`·`ColumnFocusGuard`, `prototypeShownConversation`의 종류, `conversationButton`, Tab 순서, 토스트 자리, 막힌 composer의 포커스 가능 여부)를 develop의 코드와 승격된 PRODUCT·ARCHITECTURE·DESIGN에 대조하고, 다른 문장을 고친다. 머리 없던 상태의 종류, 막힌 composer의 포커스, 토스트 자리가 design.md '정한 점'의 전제와 다르면 사용자에게 다시 묻는다. 검증: design.md '대조표'에 항목 · develop 파일:줄 · 같음/바뀜이 모든 행에 채워져 있다.
  - 커밋 경계: 문서 맞추기.
- [ ] 2. PoC(`.scratch/prototype-conversation-panel/`, design.md 'PoC 의존'): develop 앱을 격리해 띄우고(제품 코드는 바꾸지 않는다) Playwright `_electron` evaluate로 열린 배치 CSS를 주입한다. computer-use의 네이티브 입력으로 본다: 패널을 열고 닫을 때와 손잡이로 폭을 바꿀 때 드래그 영역이 헤더 폭을 따르는지(패널 머리의 Hide와 제목은 클릭되고 창이 끌리지 않음, 왼쪽 헤더 빈 곳은 끌림, 닫은 뒤 헤더 오른쪽이 다시 끌림), 위쪽 28 px 안에서 손잡이를 끌고 두 번 누를 때 손잡이가 받고(두 번 누르면 기본 폭) 창이 확대되지 않는지. 관찰(통과·실패·날짜)은 이 feature 문서에 적는다. 검증: `node .scratch/prototype-conversation-panel/poc-drag.mjs`가 완료 줄을 찍고 exit 0이며, 네이티브 입력 결과가 기록되어 있다.
  - 커밋 경계: 실패하면 해결책을 고르고 design.md를 고친 문서 커밋 후 멈춘다(통과하면 관찰만 1번과 함께 적는다).
- [x] 3. 초안 `.doan/canvases/prototype-conversation-panel.html`(frames `open-1024`, `open-640`, `open-from-360`, `name-rows`, `panel-titles`, `focus-close`, `compare`). 사용자 확인 완료(8cd00821e).
- [ ] 4. `/design-draft`로 초안을 결정에 맞춘다. 링크 3의 초안은 고치지 않는다.
  - 배너 "EXPERIMENT DRAFT · prototype-conversation-panel · NOT IN CODE · no feature documents"와 "No /design-sync applies until a feature adopts this draft"를 이 feature가 채택한 초안으로 바꾼다(spec 결정 14). 프레임의 "Experiment, not in code" 캡션 칩 8개도 바꾼다.
  - `open-1024` 캡션의 오른쪽 무리 끝 "x592"를 L − 16 = x680(토글 x576 시작)으로 고친다.
  - 패널 머리를 출시된 56으로 고치고(spec 결정 16) Hide y20–52, 제목 가운데 y36으로 캡션을 고친다. 머리를 줄여 헤더 줄에 맞춘다는 캡션 문장을 지운다.
  - `panel-titles`에 머리 없던 상태의 "Conversation" 제목 타일, `focus-close`에 composer가 포커스를 받지 못할 때 머리 제목의 포커스 링 타일을 더한다. 열린 동안의 Tab 순서(헤더 → 패널 → 프레임, spec 결정 15)로 `focus-close` 캡션을 고친다.
  - 검증: `doan check --repo . --json`, `doan ls --repo . --json`, 그리고 사용자가 앱에서 고친 초안을 확인한다.
  - 커밋 경계: 초안.
- [ ] 5. `/tdd`: 다음을 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패하고, 아래 '가드'로 적은 테스트는 green이다.
  - `main/prototype/fit.test.ts`
    - `prototypeSideLayout`: design.md 순수 함수 1의 표(1024/320, 1024/512, 736/320, 696/280, 695/280, 640/280, 작업 영역 600의 600/280 → L 312, 닫힘 444·443).
    - `prototypePanelFit`(표시 + 24 + P): 390 × 844·P 320 → 734 × 952(64 + 44). 표시 폭 392 이상은 + 64. 240 × 400·P 320 → 640, P 280. 최소 640. 작업 영역보다 넓으면 P가 먼저 280으로, 그다음 콘텐츠 패널.
    - `prototypeCaptureRect`에 패널 폭을 넘기면 사각형이 L − 16 안에 있고, 위쪽이 열린 상태의 이름 줄을 따른다(640/280은 y100). 0은 지금과 같다.
    - 가드: `fitPrototypeWindow`, `prototypePanelBounds`, `openPanelResize`의 기존 테스트.
  - `main/prototype/controller.test.ts`(또는 `prototypeWindow.test.ts`): 패널이 열린 Play와 캡처에 대화 열 폭이 아니라 패널 폭 P가 넘어간다.
  - `renderer/prototype/conversation.test.ts`: `prototypeHeadTitle` — `list_loading`·`list_error`·`blocked`와 빈 제목은 "Conversation", 나머지는 넘긴 제목("New conversation" 포함). `conversationButton`이 열림 인자 없이 Show 라벨과 배지만 돌려준다(Hide 분기 없음).
  - `ConversationPanel.test.tsx`: `columnRef`와 `onBlur`가 `.doan-conv-column`에 붙는다. 가드: 기존 테스트.
  - `main/exportViewer.test.ts`: 링크 3의 "R 0 0 R 콘텐츠 패널" 선택자 테스트를, 열린 배치에서도 `.pw-panel`·`.pw-content`·`.pw-stage`가 출시된 나눈 clip이고 `.pw[data-panel="open"]`가 자르지 않는다는 테스트로 바꾼다.
- [ ] 6. `/implement`: 순수 함수, `conversationButton`의 Show 전용화, `ConversationPanel`의 선택 prop을 구현하고, `fit.ts` `prototypeHeaderRows`의 주석을 새 규칙(닫힘 W, 열림 L)으로 고친다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 7. main: `controller.ts`·`prototypeWindow.ts`의 캡처 인자 이름(`sideColumn` → 패널 폭)과 주석, 테스트 기대값을 맞춘다. `fitted()`와 최소폭 640/360은 그대로다. preload와 IPC는 바뀌지 않는다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: main.
- [ ] 8. UI: 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - `PrototypeWindow.tsx`·`PrototypeConversation.tsx`: 대화 열을 `ConversationPanel` 셸로 바꾸고 `columnRef={conv.column}`, `onBlur={conv.onFocusOut}`를 넘긴다. 패널 열을 DOM에서 콘텐츠 패널 앞에 둔다. 열린 동안 R 104와 `prototypeSideLayout`의 이름 줄(끄는 중에는 미리보기 폭). 머리의 `h2.phead.rp-head` 안 `span` 제목(`prototypeHeadTitle`), `scrollWidth > clientWidth`와 `ResizeObserver`로 잘렸을 때만 `title`(창 크기, 손잡이 끌기·방향키, 제목이 바뀔 때 다시 판정). 헤더 대화 버튼은 Show 전용으로 두고 열린 동안 같은 요소를 숨긴다. 열면 composer로, 창이 첫 view를 받기 전이라 composer가 없으면 머리 제목으로, composer가 생기면 포커스가 아직 머리 제목일 때 한 번 composer로. 열린 동안 composer가 막혀도 포커스를 옮기지 않는다(막힌 composer는 `readOnly`로 포커스를 지닌다). 닫으면 다시 보이게 된 헤더 버튼으로.
  - `styles.css`: `.pw[data-panel="open"]`의 규칙을 바꾼다(두 열과 열 간격 8, 헤더 1열, 대화 열 `grid-row: 1 / -1`과 위 여백 8, 패널의 네 모서리 24·그림자·시작 테두리 없음, 열린 동안의 `--pw-right`). 머리 높이는 출시된 56 그대로 둔다. 링크 3의 R 0 0 R, `.pw-stage` 아래 오른쪽 0, 0 R R 0, 머리 없는 위쪽 16 규칙을 지운다.
  - 테스트
    - `prototype/WindowShell.test.tsx`: 닫힘 R 140·열림 R 104 상수가 두 `--pw-right`와 같다(5번에서 옮겨 온 CSS 미러 검사). 열린 배치에서 헤더 버튼이 같은 요소로 DOM에 남고 숨겨져 Tab 정지가 아님. Hide conversation이 머리에 있고 `aria-expanded`·`aria-controls`. 열린 동안 DOM·Tab 순서가 헤더 → 손잡이 → Hide → thread → composer → 프레임 콘텐츠이고, 닫히면 헤더 → 프레임 콘텐츠. 손잡이 미리보기로 L이 408을 지날 때 같은 캡슐이 줄을 옮김. 열린 동안 창 폭이 줄어 L이 408을 지나거나 P가 최대로 잘림. 패널 머리에 `-webkit-app-region`을 스크립트로 쓰지 않음.
    - `prototype/PrototypeWindow.test.tsx`: 키보드로 열기(Space, Enter → composer)와 닫기(Hide → 헤더 버튼), Esc가 패널을 닫지 않음, 패널을 연 채 Back 한 번과 `doan open --prototype`의 view에서 패널과 제목이 유지됨.
    - `prototype/PrototypeConversation.test.tsx`: 머리 제목(요약 제목, 첫 메시지 줄, "New conversation", 머리 없던 상태와 빈 제목의 "Conversation"), 잘림에 따른 `title`, 첫 view 전에 열면 머리 제목에 갔다가 view가 와서 composer가 생기면 한 번 composer로, 목록 읽는 중에 열면 composer로, 열린 동안 캔버스가 사라지거나 ID가 겹치면 제목이 "Conversation"이 되고 포커스가 composer에 남음(`body`로 떨어지지 않음).
  - 커밋 경계: UI.
- [ ] 9. `/design-sync`로 초안과 실제 앱을 맞춘다(spec 결정 14로 이 초안이 기준): 1024 창의 닫힘·열림·최대 512, 640 창 닫힘·열림, 360에서 열어 640, 696/280과 695/280의 이름 줄, 패널 위치·크기·모서리·그림자·시작 테두리 없음, 머리 56과 Hide y20–52·제목 가운데 y36·제목 글 시작 16, 긴 제목의 말줄임표, "New conversation"과 "Conversation", Hide의 키보드 링과 툴팁, 머리 제목의 포커스 링, 헤더 R 104(토글 x576, Export 끝 x680)와 이름 범위, 콘텐츠 패널의 위치와 모서리. DESIGN.md 'Frame prototype'에 잰 값을 적고 링크 3의 대화 열 값을 바꾼다. 검증: `node .scratch/design-sync/prototype-conversation-panel/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이뿐이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 10. `/runtime-test`: 격리 앱에서 확인한다. 실제 턴이 필요한 확인은 공유 provider 프로필을 제자리에서 쓰고, 인증 파일을 뺀 상태를 백업했다가 되돌린다(링크 3과 같다). 검증: `node .scratch/runtime-test/prototype-conversation-panel/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷과 네이티브 입력 포함).
  - 360 창에서 Show conversation → 창 640, 패널 280, Responsive `innerWidth` 336, 포커스가 composer. 1024 창은 크기 그대로. 키보드만으로 열고(Space/Enter → composer) Hide로 닫으면 포커스가 헤더의 Show conversation(`document.activeElement`), 창 크기 그대로.
  - 열린 동안 Tab이 헤더 → 손잡이 → Hide → thread → composer → 프레임 콘텐츠로 가고, focus trap이 있는 프레임에서도 패널에 닿는다.
  - 패널 머리의 Hide와 제목을 네이티브로 클릭해도 창이 끌리지 않고, 왼쪽 헤더는 끌린다. 닫은 뒤와 손잡이로 폭을 바꾼 뒤 드래그 영역이 새 헤더 폭을 따른다. 위쪽 28 px에서 손잡이를 두 번 누르면 기본 폭이 되고 창은 확대되지 않는다.
  - 손잡이를 키보드와 포인터로 끌고, 창 크기를 바꿔 이름이 줄을 옮길 때 이름 캡슐의 포커스와 열린 프레임 메뉴가 남는다. 창을 줄이면 P가 최대로 잘린다.
  - 패널을 연 채 드로어로 390 × 844를 고르면(P 320) 창 콘텐츠가 734 × 952가 되고, Back 한 번과 `doan open --prototype`도 같은 규칙으로 맞춘다. 실패·lost로 찍힌 정지 이미지에 패널이 없다.
  - 긴 제목이 잘리고 native `title`이 전체 제목이다. 첫 메시지를 보낸 뒤 목록이 이름을 주면 제목이 바뀐다. 목록 읽기 실패와, 열린 동안 캔버스가 사라지거나 ID가 겹치면 제목이 "Conversation"이고, 막힌 동안 포커스가 composer에 남아 `body`로 떨어지지 않는다.
  - 열린 패널에서 Export 결과 토스트가 창 오른쪽 아래(오른쪽과 아래에서 16)에 보인다.
  - 작업 영역 600은 실제 화면으로 만들지 않는다. 5번의 단위 테스트(600/280 → L 312)가 알려진 한계를 고정한다. 패널 여닫기에는 애니메이션이 없으므로 reduced motion 확인은 해당하지 않는다.
- [ ] 11. `/code-review` → `/refactor` → `/verify`. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - 커밋 경계: `/refactor` 수정.
- [ ] 12. 결론을 승격하고 `docs/features/prototype-conversation-panel/`를 삭제한다. 문서마다 커밋한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`(문서만 바뀌면 대상 확인), `grep -c "over the content panel" docs/PRODUCT.md`가 0, ARCHITECTURE §3 'Fit'에 "depend only on the window's width"가 없음, `test ! -d docs/features/prototype-conversation-panel`.
  - PRODUCT §5 item 2 'Prototype window'('Header', 'Conversation panel'과 그 'Width'·'Content', design.md '결정 영향'): 링크 3이 적은 패널 배치·헤더 대화 버튼·머리 없는 패널·W 기준 이름 줄·Tab 순서 문장을 독립 패널, 머리의 제목(머리 없던 상태의 "Conversation" 포함)과 Hide conversation, 머리 높이(출시된 56), 열린 동안 헤더 버튼 없음, L 기준 이름 줄, 왼쪽 헤더만 드래그, 열 때 포커스의 대체 대상(첫 view 전의 머리 제목), 열린 동안의 Tab 순서(헤더 → 패널 → 프레임), 패널을 연 채 맞춤(표시 + 24 + P, L 기준 줄)으로 바꾼다. 'Export'의 토스트 문장 "at the window's bottom right, over the content panel and never over the header"에서 "over the content panel"을 뺀다.
  - ARCHITECTURE §3 'Prototype window'의 'Fit'(이름 줄이 창 폭, 패널 폭, 두 R 값에 달림, 두 미러 상수)과 'Timeout and kill'의 캡처(L 기준 이름 줄, 패널과 간격을 뺀 영역).
  - DESIGN.md 'Frame prototype'(9번에서 고친 값: 'Header right group', 'Frame name', 'Conversation button', 'Conversation column', 'Panel width', 'Headless panel')과 'Export toasts' 행의 "over the content panel only".
  - BACKLOG.md에 작업 영역 632 미만에서 열린 헤더의 두 무리가 겹치는 한계를 적는다.
  - 커밋 경계: 문서 승격.
