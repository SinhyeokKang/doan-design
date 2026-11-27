# 패널 헤더 페이드 — 설계

## 시각 규칙과 토큰

사용자가 첨부한 2026-11-27 스크린샷을 직접 봤다. 제목과 아이콘은 선명하고, 배경의 말풍선은 헤더 가까이 올라올수록 옅어진다. 이 전환을 Doan의 기존 패널 위에 적용한다. 각 헤더의 버튼, 여백과 배열은 현재 구현과 실측 문서를 따른다.

- 헤더 높이에는 기존 `--size-chrome`(56px)을 쓴다. 배경은 `--surface-panel`에서 `transparent`로 전환한다. 전환 길이는 `--space-6`(24px)을 초안의 시작값으로 삼고, 그라디언트의 시작·끝과 농도는 드래프트에서 확인한다. Quick Open의 `.qo-height::after`는 같은 색 전환을 쓰는 기존 렌더러 사례다. 기존 값으로 표현하기 어려운 공통 규격은 드래프트 확인 후 [DESIGN.md의 토큰 규칙](../../DESIGN.md)에 따라 결정한다.
- 그라디언트는 헤더 컨트롤과 본문 사이의 장식 레이어로 그린다. 장식 레이어는 포인터 이벤트와 탭 순서에 관여하지 않는다. 헤더의 실제 입력 영역은 유지한다. 본문이 맨 위에 있거나 짧아서 헤더 아래로 콘텐츠가 지나가지 않을 때는 읽을 콘텐츠에 페이드가 겹치지 않는다.
- `prefers-reduced-transparency: reduce`와 `forced-colors: active`에는 불투명한 헤더를 쓴다. 보드용 표시 영역이 헤더 뒤에 있어도 이 두 상태에서는 비치지 않는다. 새 전환 애니메이션이나 매 스크롤 프레임 React 상태 갱신을 도입할 필요가 없다.

## 적용 지점

| 헤더 | 현재 구조 | 구현에서 유지할 경계 |
|---|---|---|
| 오버뷰 대화 | `ProjectOverview.tsx`의 `.ov-head`와 `ConversationThread.tsx`의 `.thread-scroll` | 헤더 메뉴, 스레드 스크롤 기준, 하단 composer와 답변 팝오버 위치 |
| 오버뷰 목록 | `RightPanel.tsx`의 `.ov-right.doan-scroll`에 제목과 행이 함께 있음 | 제목을 위에 고정하고 행만 뒤로 통과시킨다. 행 정렬 유지, 현재 행, 삭제와 포커스 복구 |
| 캔버스·프로토타입 대화 | 두 창이 `ConversationPanel.tsx`의 `.doan-conv-head`와 같은 스레드를 씀 | 공유 스타일을 한 곳에 둔다. 창마다 닫기 버튼과 패널 크기 조절, 스레드의 접근 가능 영역 |
| 캔버스 인스펙터 | `InspectorPanel.tsx`의 `.doan-insp-head`와 `.doan-insp-body` | 헤더의 요소 메뉴와 도구, 행 포커스, 툴팁과 빈 상태 |
| 캔버스 보드 | `CanvasHeader.tsx`는 `App.tsx`의 `.area` 앞에 있다. `CanvasController.ts`가 `.area`의 실제 사각형과 크기를 써서 보드와 오버레이를 배치함 | 보드의 표시 영역만 헤더 뒤로 잇는 방향을 PoC로 확인한다. 헤더 입력, 보드의 논리 뷰포트, `overflow: clip`, iframe 격리와 오버레이 좌표를 보존한다. |

영향은 Electron 렌더러의 TSX·CSS에 있다. 오버뷰 목록과 인스펙터의 스크롤 컨테이너 및 대화 스레드를 그대로 활용한다. 스크롤바, 포커스 이동, 메뉴 포털이 페이드 아래에 갇히지 않는지 확인한다. 보드는 스크롤 패널과 별도 경로로 다루며, 프레임을 다시 그리거나 iframe을 복제하지 않는다.

## 순수 함수 검증 대상

- 스크롤 항목을 포커스로 드러내는 데 보정이 필요하면, 현재 스크롤 위치·보이는 본문 상단·항목 사각형에서 최소 이동량을 계산하는 부분만 DOM에서 분리한다. 첫 행, 헤더에 일부 가려진 행, 이미 보이는 행을 `/tdd`로 검증한다. CSS의 스크롤 여백과 기존 포커스 경로로 같은 결과를 얻으면 그 경로를 사용한다.
- 보드에서는 장식용 그리기 범위와 Fit·선택·캡처에 쓰는 논리 뷰포트를 구분한다. 클립을 위해 좌표 계산을 추가할 때 그 계산만 순수 함수로 둔다. 논리 뷰포트의 상단과 크기를 기존과 동일하게 전달하고 `fitFrame`, `selectionView`, `captureRect`의 결과가 헤더 높이에 영향을 받지 않도록 테스트한다. CSS만 바뀌면 기존 순수 함수에 새 인자를 만들 필요가 없고, 계산된 뷰포트와 결과를 Electron 비교로 확인한다.

## PoC와 보존할 규칙

현재 캔버스 iframe은 헤더의 아래쪽 경계에서 잘린다. **기존 `.area`의 논리 좌표와 입력 범위를 유지하면서 같은 iframe의 픽셀을 헤더 아래에 배치할 수 있는지**가 PoC다. 격리 Electron에서 기존·실험 상태를 같은 캔버스로 비교한다. 헤더 바로 아래와 충분히 떨어진 지점의 좌표 및 클릭 대상, Fit, 패널 접기 전후 크기, 선택 표시, 작업 안내, 캡처 결과를 본다. 큰 캔버스와 DPR 2에서 네 모서리 클립 회귀가 없는지도 확인한다. 뷰포트나 입력 범위를 바꿔야만 효과가 성립하면 근거를 가지고 사용자에게 다시 판단을 받는다.

### 선행 사례와 회귀 근거

- [11-25 스크롤 앵커링](../../postmortem/2026-11.md#2026-11-25--chromium-scroll-anchoring-moved-the-followed-thread-and-read-as-the-persons-scroll)의 “the thread stopped following” 사례. `.thread-scroll`의 `overflow-anchor: none`과 같은 스크롤러를 유지하고, 콘텐츠가 늘어나는 동안 페이드와 따라가기 동작을 함께 확인한다.
- [11-11 큰 캔버스 클립](../../postmortem/2026-11.md#2026-11-11--large-canvases-were-cut-off-for-good-under-a-rounded-four-corner-clip)의 “within 16384 device px of its compositing-rect origin” 사례. iframe 조상에 반경이 모두 같은 네 둥근 모서리로 클립되는 구조를 두지 않는다. ARCHITECTURE §3의 구조 검사와 큰 보드 Electron 확인을 함께 한다.
- [11-02 Tab과 보드 도구](../../postmortem/2026-11.md#2026-11-02--tab-walked-into-the-draft-drew-its-focus-rings-and-scrolled-the-floating-tools-away)의 “the overlays positioned inside it scrolled with it” 사례. 보드 iframe은 Tab 순서 밖에 두고, 강제로 스크롤할 수 있는 `overflow: hidden`을 `.area`의 클립 대용으로 쓰지 않는다.
- [11-02 오버뷰 메뉴 레이어](../../postmortem/2026-11.md#2026-11-02--every-overview-menu-opened-under-the-overview-itself)의 “open in the DOM … but not painted” 사례. 헤더의 새 레이어 위로 실제 열린 메뉴가 그려지는지 스크린샷과 조작으로 확인한다. 같은 날의 [헤더 높이 차이](../../postmortem/2026-11.md#2026-11-02--the-canvas-conversation-panels-head-was-8px-shorter-than-the-canvas-header)도 새 대화와 기존 대화에서 헤더 높이를 각각 재는 이유다.

공유 JSON Schema, 버전 `v`, IPC, CLI 출력, `doan check` 규칙과 ARCHITECTURE §1의 캔버스 규약은 현행을 따른다. ARCHITECTURE §3의 iframe 격리, 좌표, 입력 및 클립 규칙과 §7의 스레드 따라가기·포커스 규칙을 구현의 경계로 삼는다.

## 드래프트 요청

- 경로 `.doan/canvases/panel-header-fade.html`, 캔버스 id `panel-header-fade`. 기존 화면의 드래프트를 바탕으로 새 파일 하나에 비교 상태를 그린다. 캔버스 UI와 노트는 영어로 쓰고, 사용자 참고 이미지의 출처와 구현 전 상태를 표시한다.
- 아래 다섯 프레임이 여섯 헤더를 보여 준다. 상단·중간·짧은 본문 비교는 오버뷰에서 크게 보여 주고, 나머지 스크롤 헤더는 헤더 뒤로 본문이 지난 상태를 그린다. 예시 대화·목록·캔버스에는 더미 데이터를 쓴다.

| 프레임 id | 들어갈 상태와 참고 |
|---|---|
| `overview-thread` | 맨 위, 스크롤 중, 짧거나 새 대화. `.doan/canvases/doan-project.html`과 [오버뷰 실측](../../design/project.md) |
| `overview-list` | 중간 스크롤에서 행이 헤더 아래로 지나가고, 헤더 아래로 이동한 포커스 행의 링이 보이는 상태. `.doan/canvases/overview-conversation-list.html` |
| `canvas-side-panels` | 좁은 창에서 인스펙터와 대화 헤더를 비교한다. 인스펙터는 행이 많은 상태와 값 없음, 대화는 기존 대화와 새 대화. `canvas-inspector-panel.html`, `doan-canvas-conversation.html`, [캔버스 실측](../../design/canvas.md) |
| `prototype-conversation` | 프로토타입 재생 영역과 열린 대화 패널. `prototype-conversation-panel.html`과 [프로토타입 실측](../../design/prototype.md) |
| `canvas-board` | Fit 상태와 보드를 위로 이동해 프레임이 헤더 뒤로 들어간 상태. 투명도 줄이기의 불투명한 대안도 표시한다. `doan-canvas.html`과 [캔버스 실측](../../design/canvas.md) |

`/design-sync`에서 각 프레임의 헤더 높이와 페이드 경계, 본문이 비치는 영역을 대응시킨다. 일반·좁은 창 비교에는 기존 실측의 1238×780, 960×600 크기를 사용하고, 작은 프로토타입 창은 해당 실측의 열린 패널 크기를 따른다.
