# 컨텍스트 링 서랍 — design

## 영향받는 구성 요소

- **renderer**
  - `app/src/renderer/ContextRing.tsx`: 지금은 `span`(`ProgressRing role="img"`) + 툴팁이다. 버튼(`button`)으로 바꾸고 서랍 트리거를 단다. 주석의 "Nothing opens on a press and it takes no focus"는 바뀐다.
  - 새 서랍 컴포넌트: Radix `Popover`(헤더 `AgentUsageButton.tsx`와 같은 primitive). 사용량 행은 `AgentUsageButton.tsx`의 행 마크업(`usage-row`)을 공용 컴포넌트로 빼서 함께 쓴다. 헤더의 DOM과 스타일은 그대로 둔다.
  - `app/src/renderer/agentUsageView.ts`: `rowView`, `readText`, `usageBusy`를 그대로 쓴다.
  - `app/src/renderer/contextWindow.ts`: `contextText`를 그대로 쓴다.
  - `DockedComposer.tsx`: 링에 대화의 프로바이더, 레거시 외부 여부, 사용량 entries를 넘긴다. 쓰는 곳은 오버뷰(`ProjectOverview.tsx`), 캔버스 패널(`CanvasConversationPanel.tsx`), 프로토타입 창(`prototype/PrototypeWindow.tsx` 쪽)이다.
  - `styles.css`: `.context-ring` 규칙(지금 1609–1614행 근처). 보이는 크기와 margin은 그대로 두고, 히트 영역은 `::before`의 음수 inset으로 넓힌다. 버튼의 기본 padding과 border는 없앤다.
- **main**: `app/src/main/agentAuth/usageIpc.ts`의 `USAGE_CHANNELS.read`가 지금은 메인 창만 허용한다(`senderAllowed` mainOnly). 프로토타입 창에도 read와 `changed` 이벤트를 허용한다(사용자 결정). `senderAllowed.ts`의 허용 목록과 프로토타입 창 preload를 고친다.
- **CLI·skill·형식**: 바뀌지 않는다.

## 결정

- **트리거와 레이아웃**
  - 링은 `button`이 된다. `ProgressRing`은 버튼 안의 장식(`aria-hidden`)이 되고, 접근 이름과 설명은 버튼으로 옮긴다.
  - 히트 영역은 보이지 않는 pseudo-element로 넓힌다. 크기는 tray의 다른 아이콘 트리거와 비슷하게 맞추되, 이웃 트리거 영역과 겹치지 않게 초안에서 정한다. 레이아웃 박스(16px)는 바뀌지 않는다.
  - hover와 pressed 표시도 레이아웃을 바꾸지 않는 방식(배경을 pseudo-element에 그리기 등)으로 초안에서 정한다.
- **툴팁**: hover 툴팁은 둔다. 서랍이 열려 있을 때는 띄우지 않는다(두 표면이 같은 값을 겹쳐 보여주지 않게).
- **사용량 행의 프로바이더**: 보여주는 대화에 저장된 프로바이더다. 레거시 외부 대화는 사용량 행을 보여주지 않는다. Antigravity는 헤더와 같이 행이 없다.
- **읽기**: 서랍을 열 때 `usageRequest({ trigger: "open" })`, Refresh는 `{ trigger: "refresh" }`. 헤더와 같은 서비스와 같은 메모리 값을 쓰고, 새 IPC 형식은 없다.
- **닫힘과 포커스**: 헤더 popover와 같은 규칙을 쓴다. 포스트모템 2026-11-09의 "포커스가 안에 있다가 나갈 때만 닫힘" 가드도 같은 방식으로 적용한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `contextDrawerView({ context, provider, legacy, entries, now })` → `{ context: { label, tokens }, usage: RowView | null, busy }`. 행이 없는 경우(Antigravity, legacy, entry 없음)와 행 문구는 `rowView`를 그대로 따른다.
2. 링 버튼의 접근 속성: 이름, 설명, `aria-expanded`, 툴팁 표시 여부(서랍 열림이면 숨김).
3. 서랍 닫힘 조건: 대화 변경, 링 사라짐, Escape, 바깥 누르기 → 포커스 반환 대상.

## 형식 변경

- 없다. 사용량 IPC의 요청과 응답 형식은 그대로이고, 허용하는 창만 넓어진다.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 conventions와 `doan check`에는 영향이 없다.
- ARCHITECTURE의 사용량 IPC 설명(`usageIpc.ts`: "the main window's request (senderAllowed mainOnly)")이 바뀐다. 프로토타입 창도 읽는다. 승격 때 고친다.
- PRODUCT §5 'Context window ring'의 "The ring is not a control: no press action and not in the Tab order"를 버튼과 서랍 규칙으로 다시 쓴다. 'Agent usage'의 읽기 시점에 "컨텍스트 링 서랍을 열 때"를 더한다. 사용자가 요청한 변경이다.

## 포스트모템에서 가져온 함정

- 2026-11-09 "A quietly opened update popover closed when Agent usage moved focus between two places outside it": `onOpenAutoFocus`를 막는 popover는 `focusin`의 `relatedTarget`이 안에 있었을 때만 닫는다. 서랍도 같은 가드를 쓴다.
- 2026-11-06 "The Agent usage popover stayed open on a press in the app header": 헤더의 drag region 위 누르기는 DOM 이벤트로 오지 않을 수 있다. 서랍은 composer 안에 있지만, 프로토타입 창 헤더 근처에서 열리는 경우를 네이티브 클릭으로 확인한다.
- 2026-11-01 "A frame drawer list closed by a disabled trigger reopened by itself": 트리거가 사라지거나 비활성이 되면 서랍이 스스로 닫혀야 한다. `open && enabled`만으로 표현하지 않는다.

## 디자인 프리셋

- 읽은 프리셋: `harden`(읽는 중, 실패, 한도 도달, 행 없음, 링이 사라짐 상태를 빠짐없이 그린다).

## 초안 요청

- 캔버스: `.doan/canvases/context-ring-drawer.html`, id `context-ring-drawer`, 너비 1440. 기존 `context-window-ring.html`과 `provider-usage.html`은 고치지 않는다.
- 프레임
  - `trigger`: 링 버튼의 기본, hover, pressed(서랍 열림), focus-visible 상태. 넓힌 히트 영역을 점선으로 표시하고(보드 전용), tray 레이아웃이 지금과 같음을 나란히 보여준다. neutral과 danger 링 둘 다 그린다.
  - `drawer`: 서랍 내용. Claude Code(5h·Weekly), Codex, Copilot, 읽는 중, 실패, 한도 도달, Context만(Antigravity·legacy) 상태.
  - `placements`: 오버뷰, 캔버스 패널(347), 프로토타입 창 패널(280)에서 서랍이 열린 위치.
- 측정 대상(`/design-sync`): 링 버튼(보이는 박스, 히트 영역, 상태 표시), 서랍 컨테이너와 Context 섹션. 사용량 행은 헤더의 출시된 행을 옮긴 것이다.

## PoC 의존

- 없다. Radix Popover, 사용량 서비스, `rowView`는 헤더에서 이미 쓰고 있다. 프로토타입 창에서 사용량 IPC를 허용하는 일은 허용 목록 변경이다.
