# 패널 헤더 페이드 — 설계

## 시각 규칙과 토큰

사용자가 첨부한 2026-11-27 스크린샷을 직접 봤다. 제목과 아이콘은 선명하고, 배경의 말풍선은 헤더 가까이 올라올수록 옅어진다. 이 전환을 Doan의 기존 패널 위에 적용한다. 각 헤더의 버튼, 여백과 배열은 현재 구현과 실측 문서를 따른다.

- 헤더 높이에는 기존 `--size-chrome`(56px)을 쓴다. 상단부터 40px까지 `--surface-panel`을 불투명도 90%로 칠하고, 아래 16px(`--space-4`)은 90%에서 0%까지 선형으로 전환한다. 제목과 버튼은 불투명하게 그린다. Quick Open의 `.qo-height::after`는 패널 색을 투명으로 전환하는 기존 렌더러 사례다. [DESIGN.md의 토큰 규칙](../../DESIGN.md)을 따른다.
- 그라디언트는 헤더 컨트롤과 본문 사이의 장식 레이어로 그린다. 장식 레이어는 포인터 이벤트와 탭 순서에 관여하지 않는다. 헤더의 실제 입력 영역은 유지한다. 본문이 맨 위에 있거나 짧아서 헤더 아래로 콘텐츠가 지나가지 않을 때는 읽을 콘텐츠에 페이드가 겹치지 않는다. 낮은 대화 영역의 답변 팝오버와 헤더 메뉴 포털은 이 레이어 위에 그린다. 답변 팝오버가 헤더까지 덮는 기존 배치와 포커스 동작은 [PRODUCT §5의 답변 팝오버](../../PRODUCT.md)의 규칙을 따른다.
- `prefers-reduced-transparency: reduce`와 `forced-colors: active`에는 불투명한 헤더를 쓴다. 스크롤 위치가 달라지면 기존 그라디언트 아래를 콘텐츠가 통과한다.

## 적용 지점

| 헤더 | 현재 구조 | 구현에서 유지할 경계 |
|---|---|---|
| 오버뷰 대화 | `ProjectOverview.tsx`의 `.ov-head`와 `ConversationThread.tsx`의 `.thread-scroll` | 헤더 메뉴, 스레드 스크롤 기준, 하단 composer와 답변 팝오버 위치 |
| 오버뷰 목록 | `RightPanel.tsx`의 `.ov-right.doan-scroll`에 제목과 행이 함께 있음 | 제목을 위에 고정하고 행만 뒤로 통과시킨다. 행 정렬 유지, 현재 행, 삭제 뒤 포커스 복구, 실제로 보이는 캔버스 행의 썸네일 우선순위 |
| 캔버스·프로토타입 대화 | 두 창이 `ConversationPanel.tsx`의 `.doan-conv-head`와 같은 스레드를 씀 | 공유 스타일을 한 곳에 둔다. 창마다 닫기 버튼과 패널 크기 조절, 스레드의 접근 가능 영역 |
| 캔버스 인스펙터 | `InspectorPanel.tsx`의 `.doan-insp-head`와 `.doan-insp-body` | 헤더의 요소 메뉴와 도구, 행 포커스, 툴팁과 빈 상태 |

영향 범위는 Electron 렌더러 내부다. 오버뷰 목록과 인스펙터의 스크롤 컨테이너, 대화 스레드의 `.thread-scroll`과 그 자식 `.thread`·`.thread-end`를 유지한다. 대화 스레드의 `scrollIntoView`와 포커스 복구가 대상 상단을 페이드 아래에 드러내도록 기존 경로와 CSS 스크롤 여백을 먼저 검토한다. 제목에 가려진 행으로 인해 목록 썸네일 우선순위가 달라지는지도 확인한다.

### 본문 상태와 포커스

첫 읽기에는 기존 로딩 안내를, 읽기 실패에는 기존 오류와 해당하는 Retry를 표시한다. 스레드가 없는 새 대화, 빈 목록, 선택이나 읽을 스타일이 없는 인스펙터에서는 각 화면의 현재 안내를 쓴다. 인스펙터는 현재 동작대로 같은 선택을 다시 읽는 동안 앞서 읽은 행을 표시한다. 목록 행이 사라지면 다음 행, 이전 행, 목록 제목 순으로 포커스를 옮기는 기존 규칙을 따른다. 선택 대상을 잃으면 인스펙터는 빈 상태로 돌아가며, 표시 중인 대화가 삭제되면 오버뷰는 새 대화를, 캔버스·프로토타입은 기존 규칙으로 다시 고른 대화를 표시한다.

## 순수 함수 검증 대상

- 스크롤 항목을 포커스로 드러내는 데 보정이 필요하면, 현재 스크롤 위치·보이는 본문 상단·항목 사각형에서 최소 이동량을 계산하는 부분만 DOM에서 분리한다. 첫 행, 헤더에 일부 가려진 행, 이미 보이는 행을 `/tdd`로 검증한다. CSS의 스크롤 여백과 기존 포커스 경로로 같은 결과를 얻으면 그 경로를 사용한다.

## 선행 사례와 회귀 근거

- [11-25 스크롤 앵커링](../../postmortem/2026-11.md#2026-11-25--chromium-scroll-anchoring-moved-the-followed-thread-and-read-as-the-persons-scroll)의 “the thread stopped following” 사례. `.thread-scroll`의 `overflow-anchor: none`과 같은 스크롤러를 유지하고, 콘텐츠가 늘어나는 동안 페이드와 따라가기 동작을 함께 확인한다.
- [11-02 오버뷰 메뉴 레이어](../../postmortem/2026-11.md#2026-11-02--every-overview-menu-opened-under-the-overview-itself)의 “open in the DOM … but not painted” 사례. 헤더의 새 레이어 위로 실제 열린 메뉴가 그려지는지 스크린샷과 조작으로 확인한다. 같은 날의 [헤더 높이 차이](../../postmortem/2026-11.md#2026-11-02--the-canvas-conversation-panels-head-was-8px-shorter-than-the-canvas-header)도 새 대화와 기존 대화에서 헤더 높이를 각각 재는 이유다.

공유 JSON Schema, 버전 `v`, IPC, CLI 출력, `doan check` 규칙과 ARCHITECTURE §1의 캔버스 규약은 현행을 따른다. ARCHITECTURE §7의 스레드 따라가기와 포커스 규칙을 구현의 경계로 삼는다.

## 드래프트 요청

- 경로 `.doan/canvases/panel-header-fade.html`, 캔버스 id `panel-header-fade`, `doan:width` 1440 CSS px. 기존 화면의 드래프트를 바탕으로 새 파일 하나에 비교 상태를 그린다. 캔버스 UI와 노트는 영어로 쓰고, 사용자 참고 이미지의 출처와 구현 전 상태를 표시한다.
- 아래 네 프레임이 다섯 헤더를 보여 준다. 모든 프레임에 `data-doan-prototype`을 부여하고 본문을 직접 스크롤해 페이드를 확인할 수 있게 한다. 상단·중간·짧은 본문 비교는 오버뷰에서 보여 준다. 예시 대화·목록·캔버스에는 더미 데이터를 쓴다.

| 프레임 id | 들어갈 상태와 참고 |
|---|---|
| `overview-thread` | 맨 위, 스크롤 중, 짧거나 새 대화. `.doan/canvases/doan-project.html`과 [오버뷰 실측](../../design/project.md) |
| `overview-list` | 중간 스크롤에서 행이 헤더 아래로 지나가고, 헤더 아래로 이동한 포커스 행의 링이 보이는 상태. `.doan/canvases/overview-conversation-list.html` |
| `canvas-side-panels` | 960×600에서 사이드바를 숨기고 인스펙터와 대화 헤더를 함께 그린다. 인스펙터는 행이 많은 상태와 값 없음, 대화는 기존 대화와 새 대화. 같은 창 크기에서 사이드바와 대화 패널이 열린 채 인스펙터가 공간 부족으로 숨겨지는 상태는 별도 타일에 둔다. `canvas-inspector-panel.html`, `doan-canvas-conversation.html`, [캔버스 실측](../../design/canvas.md) |
| `prototype-conversation` | 프로토타입 재생 영역과 열린 대화 패널. 높이가 낮아 답변 팝오버가 대화 헤더를 덮는 상태를 함께 표시한다. `prototype-conversation-panel.html`, [프로토타입 실측](../../design/prototype.md), [답변 팝오버 실측](../../design/conversation.md) |

`/design-sync`에서 각 프레임의 헤더 높이와 페이드 경계, 본문이 비치는 영역을 대응시킨다. `overview-thread`는 1238×780, 나머지 프레임은 960×600으로 재생한다. 프로토타입 대화에서는 별도 상태로 작은 창의 답변 팝오버를 확인할 수 있다.
