# buzz-canvas — design

## 0. 초안

`/design-draft`가 새 파일 `.doan/canvases/buzz-canvas.html`을 그린다(부모 공통 결정 11). 기존 `app-shell.html`·`select-inspect.html`·`revision-continuity.html`은 이력으로 두고 고치지 않는다. 프레임은 전체 창(1238×780, 사이드바 220px, 오른쪽 패널은 지금의 280px Inspector/Comments 자리를 회색 블록으로) 단위로 그린다.

| 프레임 | 내용 |
|---|---|
| `default` | 캔버스를 연 직후(Fit). 캔버스 헤더(캔버스 / 프레임 서랍, 배율), 회색 보드, 캔버스 대화 패널 껍데기(제목과 닫기, 빈 본문), 도구모음(피커 눌림) |
| `frame-selected` | 프레임 선택 외곽선과 치수 캡슐 |
| `element-hover` | 요소 hover(점선)와 요소 선택(실선)이 함께 |
| `drawer-open` | 서랍 팝오버. 지금 보는 프레임 표시, hover·키보드 포커스 행, 제목 없는 프레임(id), 긴 제목 말줄임, 목록 스크롤 |
| `drawer-truncated` | 1,000개를 넘는 캔버스의 목록 끝 안내 |
| `zoom-menu` | 배율 메뉴(Fit ⌘1, 100% ⌘0, 50%, 200%) |
| `no-frames` | 프레임이 없는 캔버스: 서랍과 배율 컨트롤러의 비활성 모습 |
| `states` | 로딩, 로드 실패(Reload), 폭 없음, 목록에 없는 페이지, 프로젝트 문제 메시지 |
| `notices` | 선택 잃음 알림, 오류 알림, 토스트가 동시에 뜬 모습 |
| `on-dark` · `on-violet` | 어두운 캔버스, violet이 많은 캔버스 위의 선택·hover·이동 하이라이트(부모 design '조사 메모: 캔버스 영역') |
| `panel-collapsed` | 패널을 접은 캔버스 페이지(캔버스가 창 오른쪽 끝까지, 캔버스 헤더 우상단에 "Show conversation") |
| `panel-resize` | 끌어서 넓힌 패널, 경계 손잡이의 hover·포커스 모습 |
| `agent-working` | 이 캔버스의 현재 대화가 일함: 가장자리 accent 안쪽 그림자, 위쪽 가운데 안내(점, 문구, Stop) |
| `agent-waiting` | 응답 대기 문구, Stop을 누른 뒤의 "Stopping…" |
| `narrow` | 960×600. 작업 안내가 서랍·배율 컨트롤러 사이에서 줄어드는 모습을 포함한다. 서랍의 긴 이름이 먼저 줄어드는지, 컨트롤·알림·토스트가 겹치지 않는지 |

참고: Buzz에는 캔버스 화면이 없다. 컨트롤 모양은 Buzz의 공용 프리미티브(버튼, 메뉴, 팝오버, 툴팁)와 doan 공용 컴포넌트(`ds/controls.css`, `ds/surfaces.css`)에서 가져오고, 새 프리미티브를 만들지 않는다. 그 밖의 디자인 도구를 참고하면 출처를 이 절에 적는다(AGENTS.md 'Leave evidence for references').

### 초안에서 정한 값 (2026-11-01)

- 사용자 결정: 보드 바탕은 연한 회색 `--surface-inset`이다(수정 3, 2026-11-01 user; 수정 1의 흰색을 대체). 헤더는 흰색 그대로다. 캔버스 패널 위에 흰 불투명 헤더를 따로 두고, 프레임 서랍은 Overview 헤더의 대화 드롭다운과 같은 모양이다. 그래서 `board-options` 프레임을 지웠다.
- 캔버스 헤더: Overview 헤더 상자(`.ov-head`, 56px, 안쪽 8/16, 흰 불투명, 아래 구분선 없음). 위계는 Overview의 프로젝트 / 대화처럼 캔버스 / 프레임이다(수정 10, 2026-11-01 user): 캔버스(사이드바와 같은 `PanelsTopLeft` 아이콘과 이름, subtle 글자·regular, `title`은 경로, 최대 40%) · `/` · 프레임 서랍(`ov-title` 트리거: "번호. 이름", ▾, standard·medium). 프레임 이름이 먼저 줄어든다. 프로젝트와 `n/N`은 넣지 않는다. 오른쪽에 − · 배율 값(메뉴) · +, 패널이 접혔을 때만 그 뒤에 구분선 · 열기 버튼.
- 서랍 목록과 배율 메뉴는 Overview 대화 메뉴처럼 트리거 바로 아래에 연다. 서랍 목록 320px, 배율 메뉴 184px.
- 보드 위에 뜨는 것: 작업 안내와 알림은 보드 위쪽 가운데(헤더 아래 20px, 안내가 먼저; 2026-11-01 user), 도구모음은 아래 가운데. 왼쪽 아래 변경 표시(Opened·Changed·Reloaded)는 없앤다(수정 7, 2026-11-01 user: Activity를 보이던 Canvas info도 빠지고, 에이전트가 고치는 중인지는 작업 표시가 보여 준다). 작업 안내가 나타날 때 뷰를 옮기지 않는다.
- Fit inset: 헤더 아래 56px(헤더 높이만큼, 수정 5), 좌우 32px, 도구모음 위 64px(12 + 40 + 12). 헤더는 보드 위를 덮지 않고 보드 밖에 있다.
- 에이전트 작업 그림자는 헤더를 뺀 보드 영역 안쪽에만 두른다.
- 작업 안내 문구는 짧게 한다: "Codex is working", 응답 대기 "Codex needs your answer"(Overview의 "Needs your answer"와 같은 말). 응답 대기 중에는 점이 멈춘다.
- 비활성 서랍: 로딩·실패·폭 없음·목록에 없는 페이지·프로젝트 문제에서는 "Frames", 프레임이 0개인 읽힌 캔버스에서만 "No frames".
- 알림은 `doan-notice doan-panel`(흰 채움)에 패널 그림자를 더해 회색 보드 위에서 보이게 한다. 상태 메시지의 Reload는 panel 변형이다. 토스트는 창 오른쪽 아래 16px로 돌아간다.
- 패널 손잡이 막대는 accent 그라디언트다(2026-11-01 user).

## 1. 영향 범위

- **app renderer만** 바뀐다. main, preload, CLI, 스킬, 형식은 바뀌지 않는다.
  - `App.tsx`의 `CanvasPane`: 서랍, 배율 컨트롤러, 도구모음, 알림, 상태 메시지의 마크업. `.zctl` 띠, Reload 버튼, 변경 표시(`.updated`)를 지운다. Activity 기록(`activity.ts`)과 `bottomLabel`은 쓰는 곳이 없어지면 함께 정리한다.
  - `CanvasController.ts`: 서랍이 쓰는 `selectFrame(index)`는 이미 있다(이동 + `pick-frame` + 초안 가드 `transition`). 지금 호출하는 곳이 없으므로 서랍이 처음 쓰는 곳이 된다. 배율 메뉴의 50%·200%를 위해 `zoomTo(scale)`(뷰 가운데 기준)을 더한다. Fit·이동·locate가 쓰는 여백을 새 inset으로 바꾼다.
  - `viewport.ts`: `fitWidth`·`fitFrame`·`locateView`가 사방 같은 `margin` 대신 위·오른쪽·아래·왼쪽 inset을 받는다.
  - `styles.css`: `.area`, `.mark`, `.dims`, 프레임 이동 하이라이트, `.canvas-status`, `.canvas-notices`/`.canvas-notice`, `.updated`, `.zctl`/`.zoom` 규칙을 새 컨트롤 규칙으로 바꾼다. 새 클래스는 `doan-` 접두어를 쓴다(공통 결정 9).
- **View 메뉴**(`app/src/main/index.ts`)와 `ViewCommand`는 그대로다. 배율 메뉴의 Fit·100%는 같은 명령(`fit`, `actualSize`)을 부른다.
- **선택 경로**: 서랍의 선택은 `pick-frame` → 캔버스 스크립트의 `select` → 기존 `selection:set`이다. `doan active`, 선택 수명, 앵커 규칙(ARCHITECTURE §3 'Selection and inspector')은 바뀌지 않는다.

## 2. 컨트롤 규칙

### 프레임 서랍

- 버튼: 지금 보는 프레임(`CanvasState.currentFrame`)의 번호와 이름("3. Payment", `frameLabel`의 number·name — 제목, 없으면 id)과 ▾. 전체 개수(`n/N`)는 보이지 않는다(2026-11-01 user). 접근 이름은 "Frame <번호>: <이름>". 지금 보는 프레임이 없으면(프레임 0개) 버튼은 비활성이고 "No frames"를 보인다. 로딩·실패·폭 없음·목록에 없는 페이지에서도 비활성이다.
- 목록: Radix 팝오버에 roving tabindex 목록. 행은 `layout.frames` 순서(문서 순서)이고 번호와 이름을 보인다. 지금 보는 프레임 행에 표시가 있고, 목록을 열면 그 행이 보이도록 스크롤하고 그 행에 포커스를 둔다. 긴 이름은 말줄임하고 전체 이름을 `title`로 둔다. `layout.truncated`면 목록 끝에 "Showing the first 1,000 frames. Use Quick Open (⌘K) to search." 같은 안내를 둔다(문구는 초안에서 확정, 아래 '문구').
- 행을 고르면(클릭, Enter, Space) 목록을 닫고 `controller.selectFrame(index)`를 부른다. 초안 가드가 거절하면 이동도 선택도 일어나지 않는다(기존 `transition` 규칙).
- 지금 보는 프레임이 바뀌어도 열린 목록의 포커스는 움직이지 않는다. 표시만 따라간다.

### 배율 컨트롤러

- − · 배율 값(메뉴 트리거) · + 순서다. 값은 지금처럼 정수 %이고, 프레임이 없으면 "—"와 함께 모두 비활성이다.
- 메뉴: Fit(⌘1), 100%(⌘0), 50%, 200%. 단축키 표기는 View 메뉴와 같다. 50%·200%는 `zoomTo(0.5)`·`zoomTo(2)`이고 뷰 가운데를 고정한다(−·+와 같은 기준).
- Reload 버튼은 없다. ⌘R, View > Reload Canvas, 로드 실패 화면의 Reload가 남는다.

### 도구모음

- 하단 가운데, 아이콘 버튼 한 줄. 이번에는 선택 피커 하나다: `aria-pressed="true"`, 툴팁 "Select". 누르면 아무것도 바뀌지 않는다(이미 기본 도구). 도구가 하나뿐이어도 다음 자식이 버튼을 더할 수 있도록 줄 컨테이너를 쓰되, 빈 자리나 숨긴 버튼은 두지 않는다.

### Esc와 포커스

- 서랍·배율 메뉴가 열린 채 Esc를 누르면 메뉴만 닫는다. App의 Esc 선택 해제(ARCHITECTURE §3 'Clear and keyboard')가 같은 키에 반응하지 않아야 한다. 메뉴의 Esc 처리에서 전파를 멈추거나, App의 Esc 처리가 열린 Radix 메뉴 안의 키를 건너뛴다(구현에서 고르되 테스트로 고정한다).
- 메뉴를 닫으면 포커스는 연 버튼으로 돌아온다. 서랍에서 프레임을 고른 뒤에도 서랍 버튼으로 돌아온다.
- Tab 순서는 상단 바 → 사이드바 → 캔버스 영역(서랍 → 배율 컨트롤러 → 도구모음) → 오른쪽 패널이다(ARCHITECTURE §3 'Actions and focus'의 "canvas" 안을 정한다).

### 여백(inset)

- Fit, 서랍·Quick Open 이동, 코멘트 locate는 위 inset(서랍·배율 컨트롤러 아래 끝 + 간격)과 아래 inset(도구모음 위 끝 + 간격) 안에 프레임을 둔다. 좌우는 지금처럼 32px다. 값은 초안에서 정하고 `viewport.test.ts`가 고정한다.
- 높이가 안전 영역보다 큰 프레임은 지금처럼 위에서부터 읽는다(위 inset에 맞춤).

### 오른쪽 패널 접기·펼치기와 폭

- 틀: 캔버스 페이지의 `.right-stack`은 캔버스 대화 패널 껍데기(새 컴포넌트)를 담는다. 패널은 Overview 캔버스 대화 목록 패널의 프리미티브를 재사용한다(2026-11-01 user): `aside.right.ov-right`와 제목 줄 `h2.phead.rp-head`(56px, label-sm 500, 안쪽 8/16) 그대로, 제목만 "Conversation"이다. 제목 줄 끝에 닫기 아이콘 버튼("Hide conversation", `PanelRightClose`)만 더한다. 본문은 빈 상태 "No conversation on this canvas yet." / "Conversations about this canvas will show here."뿐이다. 캔버스 페이지는 `RightPanel`, Comments 패널, 코멘트 핀, Review bar, Hand Off를 그리지 않는다(2026-11-01 user). 그 컴포넌트와 main 경로는 남긴다(지우는 일은 `buzz-inspector`·`buzz-canvas-conversation`). Overview의 오른쪽 패널(`CanvasConversations`)은 280px 고정 그대로다.
- 열기: 패널이 접혀 있을 때만 캔버스 헤더 오른쪽 끝(배율 묶음 뒤, 1px 구분선 다음)에 "Show conversation"(`PanelRightOpen`) 아이콘 버튼이 생긴다. 두 버튼 모두 `aria-expanded`와 `aria-controls`로 패널을 가리킨다. 닫으면 포커스는 열기 버튼으로, 열면 닫기 버튼으로 간다. 접히면 캔버스 패널 오른쪽 모서리도 24px 둥글게 된다.
- 폭: 기본 280px, 최소 280px, 최대는 560px와 '캔버스 영역이 360px 이상 남는 폭' 중 작은 값이다(1238 창에서 560, 960 창에서 356). 창이 줄어 저장된 폭이 최대를 넘으면 최대로 보이되 저장값은 바꾸지 않는다. 숫자는 초안에서 확정한다.
- 라이브러리(2026-11-01 user 허락): 끌기와 접기는 shadcn `resizable` 컴포넌트(`npx shadcn@4.22.1 add resizable`, 내부는 `react-resizable-panels`)로 한다. 버전은 설치할 때 게시된 지 2주가 지난 것으로 정확히 고정한다(`app/.npmrc` `save-exact=true`; 2026-11-01 `npm view` 기준 4.16.0은 10-31 게시라 아직 안 되고, 4.14.5는 10-12 게시). 설치 전에 그 버전에서 px 단위 최소·최대 폭, 접기(`collapsible`)·`collapse()`·`expand()` API, 손잡이의 키보드·`aria-value*` 처리를 확인하고, 라이브러리 자체 저장(localStorage `autoSaveId`)은 쓰지 않는다(기억은 ui-state 한 곳). 확인한 내용과 버전은 ARCHITECTURE §7 스택에 승격한다.
- 손잡이 스타일(2026-11-01 user): malmoi의 `components/ui/resizable.tsx`와 그 DESIGN.md 'Resizer' 표(`~/code/malmoi` `6dcdd575`에서 읽음)를 따른다. 손잡이 자체는 투명한 8px 띠이고, 보이는 것은 가운데 4px `::after` 막대 하나다. 막대는 위아래 끝이 사라지는 세로 그라디언트(투명 → 강조색 → 투명)이고, 라이브러리가 DOM에 쓰는 손잡이 상태가 hover·drag일 때만 보인다(React state 아님). 강조색은 accent `--affordance-accent`다(2026-11-01 user; malmoi는 자기 `--ring`). 공통 결정 2의 accent 예외에 더한다. 손잡이에 `cursor`를 걸지 않는다(끄는 동안 라이브러리가 문서 전체에 resize 커서를 건다). 히트 영역은 라이브러리의 기본 여백에 맡기고 덮지 않는다. `touch-action: none`. malmoi는 `react-resizable-panels` 2.1.9의 `data-resize-handle-state`를 썼으므로, 고르는 버전에서 같은 속성 이름인지 설치 전에 확인한다. malmoi에서 온 함정: 라이브러리 `expand()`는 % 기억이라 펼칠 때는 마지막 px로 `setLayout`; 전이는 버튼 토글에만(끌기에 걸면 손잡이가 포인터를 늦게 따라감); 패널에 `min-width: 0`; 라이브러리는 접근 이름을 만들지 않는다.
- 경계 손잡이: 캔버스와 패널 사이 1px 구분선 위의 투명한 8px 영역. `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`, `aria-label="Resize panel"`. 포커스 가능하고 ←/→는 16px씩, Home/End는 최소/최대. 두 번 클릭하면 280px로 돌아간다. 끄는 동안 캔버스 iframe이 포인터를 가져가지 않도록 끌기 중에만 보드 위에 투명 덮개를 둔다.
- 기억: `UiState.rightPanel = { open, width }`(기기 전체, 캔버스별 아님). 공유 형식(JSON Schema)이 아닌 기기 안 ui-state라서 `v`와 fixture 변경은 없다. 잘못된 값은 기본값으로 읽는다.
- 뷰: 폭이 바뀌면 캔버스 영역 크기가 바뀐다. 창 크기 변경과 같이 뷰의 왼쪽 위 기준을 유지하고 다시 맞추지 않는다(ARCHITECTURE §3 'Zoom and pan').

### 에이전트 작업 표시

- 참고: ego lite(citrolabs)의 에이전트 탭 표시. 탭 가장자리의 안쪽 빛, 움직이는 점, 상단 가운데 안내와 Stop이다. 출처는 사용자 설명(2026-11-01)이다. 공개 리포 `citrolabs/ego-lite`에는 스킬·SDK만 있고 브라우저 UI 코드가 없어서 색·크기·모션 값은 확인하지 못했다(2026-11-01 `gh api` 트리 확인). 값은 doan 토큰으로 새로 정한다.
- 위치: 보드 위쪽 가운데, 헤더 아래 20px(2026-11-01 user). 높이 40px라 Fit 위 여백 56px보다 4px 내려와 Fit 상태의 맨 위 프레임 제목 줄에 살짝 걸린다.
- 조건: 이 캔버스의 현재 대화가 일함(working) 또는 응답 대기(permission)일 때. 현재 대화는 Overview의 캔버스 행과 같은 매칭(`canvasConversationRows.ts`: 양쪽에 ID가 있으면 ID, 없으면 경로)으로 찾는다. 상태는 main의 대화 목록(`conversation:list`, `listChanged`)에서 읽으므로 다시 로드·재시작 뒤에도 같다.
- 보드 표시(수정 12·13, 2026-11-01 user, 사용자의 ego 스크린샷 참고). 모두 `pointer-events: none`이라 선택·팬·줌을 막지 않는다.
  - 가장자리 그라디언트: 테두리 선 없이, 보드 가장자리에서 가장 진하고 약 15px 안에서 사라지는 accent 띠(초안: 안쪽 그림자 두 겹, 8px·accent 70%와 24px·accent 35%; 처음 값의 절반, 2026-11-01 user). 8초 주기로 숨쉰다(불투명도 0.55↔1, 2026-11-01 user). ego는 파랑이지만 doan은 accent violet을 쓴다.
  - 점 필드: malmoi KV의 `DotField`(`components/signin/dot-field.tsx`, 판정 `lib/signin/dot-field.ts`, malmoi `6dcdd575`)를 옮긴다. 캔버스 2D, 12px 격자(malmoi 16), 반지름 2→2.5(malmoi 3.5) (2026-11-01 user), 알파 0.08→0.3, 가상 커서 반경 180px, ㄹ자 자동 순회(320px/s, 5줄, 반경만큼 영역 밖에서 줄바꿈), 포인터는 받지 않는다. 색은 투명한 흰색(`--text-on-prominent`를 캔버스 요소의 계산된 `color`로 읽음). 동작 줄이기에서는 한 번만 그린다. 순수 함수(`dotGrid`·`dotScale`·`autoCursor`)는 doan 코드로 다시 쓴다(§3).
  - ego의 표시는 네이티브 `AgentTaskOverlayView`(`ego/browser/ui/views/frame/agent_task_overlay_view.cc`, 앱 바이너리 문자열로 확인)라 값을 읽지 못했다. 웹 토큰에서 확인한 값은 작업 막대 바탕 `--bg-agent-task-bar: #0009` 하나다.
- 안내 캡슐: 움직이는 점 → 문구 → Stop(sm 버튼).
  - 바탕은 툴팁(`.doan-tooltip`)의 `--affordance-prominent`를 60%(ego `--bg-agent-task-bar`와 같음)로, 글자는 `--text-on-prominent`, `--blur-md` 블러, 알약 모서리, `--shadow-sm`. 투명도 줄이기에서는 불투명 검정이다. 캔버스 전용이고 공용 프리미티브로 올리지 않는다(수정 8).
  - Stop은 `--text-on-prominent` 16% 채움의 흰 글자 버튼, hover 26%, 누름 34%. 공용 버튼의 hover·누름 규칙(명시도 0,4,0, 밝은 회색)이 흰 글자를 지우므로 안내 안 버튼 규칙이 그보다 무거워야 한다(수정 9).
  - 점은 accent 한 색(8px, 가운데 흰 속 없음)이고, 2.4초 주기로 0.75배와 1.25배 사이를 오간다. 같은 주기로 accent 70% 고리가 점에서 8px까지 연하게 퍼지며 사라진다(2026-11-01 user). 응답 대기와 동작 줄이기에서는 둘 다 멈춘다.
- 문구: 일함 "<Provider> is working", 응답 대기 "<Provider> needs your answer". Provider는 지금 쓰는 공급자 표시 이름이다.
- Stop: 확인 없이 `interruptConversation({ conversationId })`. 누른 뒤 응답이 올 때까지 "Stopping…"으로 비활성. 실패하면 안내를 그대로 두고 공용 토스트로 알린다. 턴이 끝나면(목록 상태 변경) 표시가 사라진다.
- 접근성: 안내는 `role="status"`(polite). 점은 `aria-hidden`. 동작 줄이기에서는 점이 멈춘다.
- 지금 캔버스 페이지에 뜨는 임시 상태줄에도 Stop이 있다. `buzz-canvas-conversation`이 상태줄을 대화 패널로 바꿀 때까지 둘이 함께 있다.

### 겹침 순서

- 아래에서 위로: 보드 → 오버레이(외곽선·치수·이동 하이라이트) → 코멘트 핀 → 컨트롤(서랍·배율·도구모음)·작업 안내·알림 → 팝오버·메뉴 → 토스트. 포커스된 핀은 지금처럼 컨트롤 아래다(DESIGN 'Comments' Pins).
- 워크스페이스의 토스트 여백(64px, POSTMORTEM 2026-10-27)은 `.zctl`이 오른쪽 아래에 있어서 생겼다. 오른쪽 아래가 비면 다시 정하되, 도구모음과 겹치지 않는지 960 폭에서 잰다.

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 파일(안) | 경우 |
|---|---|---|
| `frameDrawerView(state)` | `app/src/renderer/frameDrawer.ts` | 프레임 0개, 1개, 여럿; 지금 보는 프레임 없음/있음; 제목 없는 프레임(id), id도 빈 프레임(`(no id)`); `truncated`; 로딩·실패·폭 없음·목록에 없는 페이지에서 비활성과 이유; 버튼 라벨과 접근 이름 |
| `zoomControlView(state)` | `app/src/renderer/zoomControl.ts` | 프레임 없음("—", 비활성); 한계(0.05, 4)에서 −·+ 활성 여부(지금 동작 유지); 메뉴 항목과 단축키 표기 |
| `fitWidth` · `fitFrame` · `locateView`의 inset 판 | `app/src/renderer/viewport.ts` | 위·아래 inset이 다를 때 Fit의 y; 안전 영역에 들어가는 프레임은 안전 영역 가운데; 안전 영역보다 큰 프레임은 위 inset에 맞춤; 크기 0 프레임; 안전 영역이 0 이하인 아주 낮은 창 |
| `zoomTo(view, scale, center, limits)` | `viewport.ts` | 50%·200%; 한계 밖 값은 한계로; 가운데 점 고정 |
| `panelWidth(saved, windowWidth)` · `nudgePanel(width, key, bounds)` · `readRightPanel(raw)` | `app/src/renderer/rightPanelSize.ts`, `app/src/restore/uiState.ts` | 기본값; 최소·최대에서 자르기; 960 창의 최대; 창이 줄 때 보이는 폭과 저장값 분리; ←/→/Home/End; 두 번 클릭 초기화; ui-state의 빠진·잘못된 값 |
| `dotGrid` · `dotScale` · `autoCursor` | `app/src/renderer/dotField.ts` | malmoi `lib/signin/dot-field.ts`의 경우를 doan 테스트로: 경계 포함, gap 0 이하, 반경 0, 반경 밖 기본값, ㄹ자 순회의 줄바꿈 연속성, 넘침 |
| `agentPresence(list, canvas)` | `app/src/renderer/agentPresence.ts` | 현재 대화 없음; 일함; 응답 대기; 끝남·실패·중단(표시 없음); 다른 캔버스의 대화; 프로젝트 대화; ID 없는 캔버스의 경로 매칭; 옮겨진 캔버스(ID 매칭); 목록 읽기 실패(표시 없음); 공급자 이름과 문구 |

## 4. 형식·규칙·결정 영향

- **형식 변경**: 없다. JSON Schema, `v`, CLI 응답, 앱 소켓 메시지는 그대로다. 캔버스 스크립트 메시지도 새로 생기지 않는다(`pick-frame`은 이미 있다).
- **규칙(ARCHITECTURE §1 Conventions, `doan check`)**: 없다.
- **구조 결정**: ARCHITECTURE §3 'Canvas view'의 고정값 "fit and frame-jump margin 32px"가 inset으로 바뀐다. 승격 때 고친다. 서빙 범위, sandbox iframe, 줌·팬을 iframe 밖 transform으로 하는 결정은 그대로다.
- **제품 결정**: PRODUCT §5 항목 3의 "Frame jumps are available through Quick Open"에 서랍(이동하고 선택함)이 더해진다. "The sidebar has no frame rows"는 그대로다. 항목 2의 줌 컨트롤 서술, 항목 4의 "an ordinary click selects"는 그대로다.
- **PoC**: 필요 없다. `selectFrame`과 `pick-frame`은 구현돼 있고 단위 테스트가 있다(`CanvasController.test.ts`). 실제 앱에서 이 경로를 서랍으로 처음 부르므로 `/runtime-test`에서 `doan active`까지 확인한다.

## 5. 문구 (영어, Doan clarify 프리셋으로 다듬음)

초안 단계에서 `go run ./cli/cmd/doan design-skill clarify --json`을 읽고 확정한다. 후보:

- 서랍 버튼 접근 이름: "Frame 3: Payment" / 비활성: "No frames"
- 잘린 목록 안내: "Showing the first 1,000 frames. Search all with Quick Open (⌘K)."
- 배율 메뉴: "Fit", "100%", "50%", "200%"; 트리거 접근 이름 "Zoom 64%, zoom options"
- 피커 툴팁: "Select"

## 6. POSTMORTEM에서 온 함정

- **2026-10-27 — Shell restyle lost navigation landmarks …(재발: unlocked integration)**: 셸 inset을 바꾸자 `.zctl`이 토스트와 2px 겹쳤다. 컨트롤을 옮길 때 의존하는 표면(토스트, 핀, 알림)의 실제 사각형을 960·1238 폭에서 함께 잰다. `rg -n 'toast|zctl' app/src/renderer/styles.css`.
- **2026-10-26 — A reloaded canvas stayed 150 px tall when its iframe was off-screen**: 서랍 이동이나 Fit 뒤 다시 로드할 때 iframe 위쪽이 화면 밖일 수 있다. 이동은 `measure`를 당겨서 다음 layout을 쓰는 기존 `jump` 경로를 그대로 쓴다. rAF에만 기대는 새 후속 메시지를 만들지 않는다.
- **2026-10-26 — A reload that never laid out left a new comment unblocked**: 서랍의 비활성 조건은 `status === "loading"`만 보지 말고 `CanvasState.reloading`과 `failed`도 본다. 다시 로드 중에는 이전 layout의 프레임 목록이 남아 있으므로 서랍을 열 수 있게 둘지, 막을지 초안에서 정하고 `frameDrawerView`가 고정한다.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 서랍이 렌더한 프레임 목록과 고른 순간의 `layout`이 다를 수 있다. `selectFrame`은 index와 id를 함께 확인하므로(`pick-frame`) 서랍은 행의 index만 넘기지 말고 id가 같은지 확인되는 경로를 쓴다(이미 `transition`의 두 번째 인자가 확인한다).
- **2026-10-25 — Production CSS extraction concealed missing development styles**: 새 CSS는 개발과 프로덕션 빌드 모두에서 대표 요소의 computed style로 확인한다. iframe의 `prefers-color-scheme`과 computed `color-scheme`을 따로 본다.
- **2026-10-30 — Removing a shared dialog class silently disabled two focus guards**: `.zctl`, `.zoom`, `.canvas-notice`, `.updated`를 지우거나 이름을 바꿀 때 셀렉터 문자열 검색으로 다른 사용처(포커스 가드, 테스트, e2e 지원, 측정 스크립트)를 찾는다. `grep -rn "zctl\|\.zoom\b\|canvas-notice\|\.updated\b" app/src app/runtime`.
