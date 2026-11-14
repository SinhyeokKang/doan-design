# prototype-conversation-panel — tasks

**시작 조건**: `prototype-conversation`(체인 261113-3 링크 3)이 develop에 병합된 뒤, 최신 develop에서 시작한다. 링크 3의 내부를 가리키는 design.md 문장은 1번에서 develop과 맞춘다.

포맷과 fixture 변경은 없다. 순서: 맞추기와 PoC → 초안 → 순수 함수 → main(I/O) → UI → 실제 앱 → 문서. 프롬프트·guide·CLI 출력이 바뀌지 않으므로 `/agent-eval`은 하지 않는다.

- [ ] 1. 링크 3 병합본과 맞추기. design.md '링크 3과의 의존'의 목록(상수, `prototypePanelBounds`, `openPanelResize`, `fitPrototypeWindow` 분기, `prototypeCaptureRect`의 `sideColumn`, `prototypeShownConversation`의 상태 이름, 머리 없는 본체, 헤더 대화 버튼, 토스트 자리, 막힌 composer의 포커스 가능 여부)을 develop의 코드와 승격된 PRODUCT·ARCHITECTURE·DESIGN에 대조하고, 다른 문장을 고친다. 머리 없던 상태의 이름, 막힌 composer의 포커스 가능 여부, 토스트 자리가 design.md '정한 점'의 전제와 다르면 사용자에게 다시 묻는다. 검증: 명령 미정 — 사용자 확인 필요(문서만 바뀐다. 대조 결과를 이 feature 문서에 적는다).
- [ ] 2. PoC(`.scratch/prototype-conversation-panel/`, design.md 'PoC 의존'): 격리한 앱에서 패널을 연 뒤 패널 머리의 Hide conversation과 제목을 네이티브로 클릭하고 끌어 본다(창이 움직이지 않고 Hide가 동작). 왼쪽 헤더의 빈 곳은 끌린다. 닫은 뒤 헤더 오른쪽(패널이 있던 자리)이 다시 끌린다. 실패하면 해결책을 고르고 design.md를 고친 뒤 멈춘다. 관찰(통과·실패·날짜)은 이 feature 문서에 적는다. 검증: `node .scratch/prototype-conversation-panel/probe.mjs`(스크린샷과 네이티브 입력 포함).
- [x] 3. 초안 `.doan/canvases/prototype-conversation-panel.html`(frames `open-1024`, `open-640`, `open-from-360`, `name-rows`, `panel-titles`, `focus-close`, `compare`). 사용자 확인 완료(8cd00821e).
- [ ] 4. `/design-draft`로 초안을 채택 상태로 고친다: 배너의 "EXPERIMENT DRAFT · NOT IN CODE · no feature documents"와 "No /design-sync applies until a feature adopts this draft"를 이 feature로 바꾸고(이 초안이 병합 전까지 `/design-sync` 기준이다), `panel-titles` 프레임에 머리 없던 상태(목록 읽는 중, 목록 읽기 실패, 캔버스 사라짐·ID 겹침)의 "Conversation" 제목 타일을 더한다. 링크 3의 초안은 고치지 않는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
  - 커밋 경계: 초안.
- [ ] 5. `/tdd`: 다음을 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
  - `main/prototype/fit.test.ts`
    - `prototypeSideLayout`: design.md 순수 함수 1의 표(1024/320, 1024/512, 736/320, 696/280, 695/280, 640/280, 닫힘 444·443). 열림 R 104·닫힘 R 140 상수가 `styles.css`의 두 `--pw-right`와 같다.
    - `fitPrototypeWindow` 패널 분기(폭 = 표시 + 24 + P, L 기준 줄): 390 × 844·P 320 → 폭 734, 둘째 줄이라 높이 952. 표시 폭 392 이상은 첫째 줄로 + 64. 최소 640. 작업 영역보다 넓으면 P가 먼저 280으로, 그다음 프레임 패널.
    - `prototypeCaptureRect`에 패널 폭을 넘기면 사각형이 L − 16 안에 있고, 위쪽이 열린 상태의 이름 줄을 따른다(640/280은 y100). `null`은 지금과 같다.
  - `renderer/prototype/conversation.test.ts`: `prototypePanelTitle` — 요약 제목, 목록 전 첫 메시지 줄(칩은 이름으로), 새 대화 상태 "New conversation", 목록 읽는 중·목록 읽기 실패·캔버스 사라짐·ID 겹침 "Conversation".
  - `main/exportViewer.test.ts`: 옆 배치(`.pw[data-panel="side"]`)의 iframe 조상 체인에 네 모서리 같은 clip이 없고, `.pw-panel`·`.pw-content`·`.pw-stage`의 나눈 clip이 그대로다.
- [ ] 6. `/implement`: 순수 함수를 구현한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 7. main: `windowState.ts`·`controller.ts`가 Play 맞춤과 캡처에 패널 폭을 넘기고(링크 3의 대화 열 폭 대신), `prototypeWindow.ts`의 캡처 호출을 맞춘다. 최소폭 640/360과 640으로 넓히기는 그대로다. preload와 IPC는 바뀌지 않는다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: main.
- [ ] 8. UI: 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - `PrototypeWindow.tsx`·`WindowShell`·`PrototypeConversation.tsx`: `data-panel="side"` 배치, 헤더를 왼쪽 열에, 열린 동안 R 104와 `prototypeSideLayout`의 이름 줄(끄는 중에는 미리보기 폭), 패널을 `ConversationPanel` 셸(손잡이, 머리의 `h2.phead.rp-head`와 Hide conversation, 본체)로 감싸기, 제목이 잘렸을 때만 native `title`, 헤더 대화 버튼을 Show 전용으로 두고 열린 동안 같은 요소를 숨김(링크 3의 Hide 분기 삭제), 열면 composer로(받을 수 없으면 머리 제목 `h2.rp-head`로), 닫으면 다시 보이게 된 헤더 버튼으로 포커스. Export 토스트는 패널이 열려 있어도 창 오른쪽 아래에 둔다(링크 3이 다르게 병합했으면 맞춘다).
  - `styles.css`: 옆 배치 격자, 패널 열, 패널의 모서리·그림자·시작 테두리 없음, 머리 40(`.doan-conv-head`와 `.rp-head`), 열린 동안의 `--pw-right`, 이름 캡슐의 오른쪽 끝. 링크 3의 R 0 0 R / 0 R R 0, 1 px 경계, 머리 없는 위쪽 여백 규칙 삭제.
  - 테스트(`prototype/WindowShell.test.tsx`, `prototype/PrototypeWindow.test.tsx`, `PrototypeConversation.test.tsx`): 열린 동안 헤더 버튼이 같은 요소로 DOM에 남고 숨겨져 Tab 정지가 아님, Hide conversation이 머리에 있고 `aria-expanded`·`aria-controls`, 열면 composer로(받을 수 없는 상태에서는 머리 제목으로), 닫으면 헤더 버튼으로 포커스, Esc가 패널을 닫지 않음, Tab 순서(헤더 → 프레임 콘텐츠 → Hide), 손잡이 미리보기로 L이 408을 지날 때 같은 캡슐이 줄을 옮김, 제목 잘림에 따른 `title`, 패널 머리에 `-webkit-app-region`을 스크립트로 쓰지 않음.
  - 커밋 경계: UI.
- [ ] 9. `/design-sync`로 초안과 실제 앱을 맞춘다(이 feature는 redesign child처럼 다루므로 이 초안이 기준이다): 1024 창의 닫힘·열림·최대 512, 640 창 닫힘·열림, 360에서 열어 640, 696/280과 695/280의 이름 줄, 패널 위치·크기·모서리·그림자·시작 테두리 없음, 머리 40과 Hide y12–44·제목 가운데 y28·제목 글 시작 16, 긴 제목의 말줄임표, "New conversation", "Conversation", Hide의 키보드 링과 툴팁, 헤더 R 104와 이름 범위, 프레임 패널의 위치와 모서리. DESIGN.md 'Frame prototype'에 잰 값과 머리 40의 문서화된 차이를 적고, 링크 3의 대화 열 값을 바꾼다. 검증: `node .scratch/design-sync/prototype-conversation-panel/measure.mjs`.
- [ ] 10. `/runtime-test`: 격리 앱에서 확인한다. 검증: `node .scratch/prototype-conversation-panel/probe.mjs`(스크린샷과 네이티브 입력 포함).
  - 360 창에서 Show conversation → 창 640, 패널 280, Responsive `innerWidth` 336, 포커스가 composer. 1024 창은 크기 그대로. 닫으면 포커스가 헤더의 Show conversation(`document.activeElement`), 창 크기 그대로.
  - 패널 머리의 Hide와 제목을 네이티브로 클릭해도 창이 끌리지 않고, 왼쪽 헤더는 끌린다. 닫은 뒤 헤더 오른쪽이 다시 끌린다.
  - 손잡이를 키보드와 포인터로 끌어 이름이 줄을 옮길 때 이름 캡슐의 포커스와 열린 프레임 메뉴가 남는다.
  - 패널을 연 채(P 320) 드로어로 390 × 844 프레임을 고르면 창 콘텐츠가 734 × 952가 되고, 실패·lost로 찍힌 정지 이미지에 패널이 없다.
  - 긴 제목이 잘리고 native `title`이 전체 제목이다. 첫 메시지를 보낸 뒤 목록이 이름을 주면 제목이 바뀐다.
  - 열린 패널에서 Export 결과 토스트가 창 오른쪽 아래(오른쪽과 아래에서 16)에 보인다.
  - 목록 읽기 실패나 캔버스 사라짐 상태에서 열면 제목이 "Conversation"이고, composer가 포커스를 받지 못하면 포커스가 머리 제목에 있다.
- [ ] 11. `/code-review` → `/refactor` → `/verify`. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
- [ ] 12. 결론을 승격하고 `docs/features/prototype-conversation-panel/`를 삭제한다. 문서마다 커밋한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`(문서만 바뀌면 대상 확인).
  - PRODUCT §5 item 2 'Prototype window': 링크 3이 적은 패널 배치·헤더 대화 버튼·머리 없는 패널 문장을 독립 패널, 머리의 제목(머리 없던 상태의 "Conversation" 포함)과 Hide conversation, 열린 동안 헤더 버튼 없음, L 기준 이름 줄, 왼쪽 헤더만 드래그, 열 때 포커스의 대체 대상(머리 제목), 패널을 연 채 맞춤(표시 + 24 + P, L 기준 줄)으로 바꾼다. 'Export'의 토스트 문장 "at the window's bottom right, over the content panel and never over the header"에서 "over the content panel"을 빼고 창 오른쪽 아래로 고친다.
  - BACKLOG.md에 작업 영역 632 미만에서 열린 헤더의 두 무리가 겹치는 한계를 적는다.
  - ARCHITECTURE §3 'Prototype window'의 'Fit'(이름 줄이 창 폭, 패널 폭, 두 R 값에 달림, 두 미러 상수)과 'Timeout and kill'의 캡처(패널과 간격을 뺀 영역).
  - DESIGN.md 'Frame prototype'(9번에서 이미 고침).
  - 커밋 경계: 문서 승격.
