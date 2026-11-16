# 컨텍스트 링 서랍 — design

## 영향받는 구성 요소

- **renderer**
  - `app/src/renderer/ContextRing.tsx`: 지금은 `span`(`ProgressRing role="img"`) + 툴팁이다. `button`으로 바꾸고 Radix `Popover` 트리거를 단다. 조합은 헤더와 같은 `Tooltip > Popover.Trigger asChild > button`이다(`AgentUsageButton.tsx` 70행 근처). 툴팁은 open 상태를 직접 들고 계산한다. `open`에 `false`와 `undefined`를 번갈아 주면 controlled/uncontrolled 경고가 난다.
  - 사용량 행: `AgentUsageButton.tsx`의 private `Row`를 export하거나 공용 파일로 옮긴다. 헤더의 markup은 그대로라서 `AgentUsageButton.test.tsx`의 markup 단언(104, 108행 근처)이 유지된다.
  - `app/src/renderer/agentUsageView.ts`의 `rowView`, `readText`, `usageBusy`와 `contextWindow.ts`의 `contextText`를 그대로 쓴다.
  - **데이터 경로**: 링은 `window.doan`을 직접 부르지 않는다. 헤더는 `window.doan.onAgentUsage`를 직접 쓰지만, 프로토타입 창은 `window.doanPrototype`을 노출하고 패널은 `run.bodyCalls`(`SharedWithMain`)로 main을 부른다.
    - `readAgentUsage`와 `onAgentUsage`를 `SharedWithMain`(`app/src/preload/prototype.ts` 31–37행 근처)과 `ConversationCalls`(`CanvasConversationPanel.tsx` 57행 근처)에 더한다.
    - 구독은 host(오버뷰, 캔버스 패널, 프로토타입 패널) 한 곳에서 한다. entries와 read 함수는 `DockedComposer`를 거쳐 링에 props로 내린다.
  - **legacy 여부**: host가 `ConversationSummary.owner === "legacy-external"`(`app/src/main/conversation/summary.ts`)과 터미널 세션 여부로 `usageHidden` 같은 prop을 계산해 넘긴다. `DockedComposer`의 `fixed`는 resume 대기도 포함하므로 쓰지 않는다.
  - `DockedComposer.tsx`(링은 518행 근처): 위 props를 링에 넘긴다. 쓰는 곳은 오버뷰(`ProjectOverview.tsx`), 캔버스 패널(`CanvasConversationPanel.tsx`), 프로토타입 창(`prototype/PrototypeConversation.tsx` 쪽)이다.
  - `styles.css`(`.context-ring` 1609–1614행 근처): `.context-ring > svg`와 `.context-ring[data-band]`는 링이 버튼 안으로 들어가면 깨진다. 클래스를 버튼에 두고 셀렉터를 `.context-ring .progress-ring > svg` 식으로 옮긴다(구현 때 확정). 보이는 크기와 margin은 그대로다. 버튼의 기본 padding, border, background는 없앤다.
- **main**
  - `app/src/main/senderAllowed.ts`: `"agent-usage:read"`(지금 `mainOnly`, 53–54행 근처)를 프로토타입 창의 composer 쪽 허용(`prototypeComposer` 또는 새 배열)에도 넣는다. `mainOnly`는 그대로 둔다.
  - `app/src/main/index.ts`: 사용량 서비스의 `publish`(1074행 근처)는 지금 `win.webContents.send`만 부른다. `prototype.send(...)`도 부르게 한다. auth의 `prototype.send(PROTOTYPE_CHANNELS.authChanged, …)`(1062행 근처)가 선례다.
  - 같은 파일의 `visible`(1073행 근처, 지금 `windowShown && !appHidden`)을 "메인 창이나 프로토타입 창이 보임"으로 넓힌다(사용자 결정). `usageSchedule.ts`의 `shouldRead`는 그대로 이 값을 본다.
  - `app/src/preload/prototype.ts`: 사용량 read와 구독을 노출하고, 리터럴 채널을 `preload/prototype.test.ts`에 고정한다.
  - `app/src/main/agentAuth/usageIpc.ts` 4행 근처 주석("the main window's request (senderAllowed mainOnly)")을 고친다.
- **CLI·skill·형식**: 바뀌지 않는다.

## 결정

- **트리거와 히트 영역**
  - 링은 `button`이 되고, `ProgressRing`은 그 안의 장식(`aria-hidden`)이 된다. 접근 이름과 설명은 버튼으로 옮긴다.
  - 히트 영역은 보이지 않는 `::before`로 사방 4px(`--space-1`) 넓힌다. 링을 정중앙에 둔 24×24 정사각형이다(xs 트리거 높이). 사용자 리뷰에서 비대칭 영역의 중심이 링과 어긋난 것을 지적받아 대칭으로 정했다.
    - 왼쪽: tray gap(2px)과 링 margin(2px)을 합친 4px만큼 넓혀, Permission 트리거의 오른쪽 끝과 맞닿는다(겹치지 않는다).
    - 오른쪽: tray 끝 padding(`--space-3`) 안에 머문다.
    - 세로: tray 아래 padding이 0이므로 아래쪽은 tray 밖으로 나간다.
  - hover와 pressed 채움도 같은 `::before`에 그린다. `cursor: default`는 그대로다(macOS 관례).
  - tray의 `container-type: inline-size`는 자르지 않는다. popover는 Portal이라 잘리지 않는다.
- **역할과 포커스**: 서랍은 dialog(popover)다. 고를 항목이 없으므로 Model/Effort 같은 menu 의미(화살표 이동, 고르면 닫힘)를 쓰지 않는다. 열면 내용 컨테이너(`tabIndex=-1`)로 포커스를 옮긴다. `aria-labelledby`는 "Context window" 머리말이다. `onOpenAutoFocus`를 막지 않으므로 포스트모템 2026-11-09의 포커스 가드는 필요 없다.
- **배치**: `side="top"`, `align="end"`. 280 패널에서 너비가 넘치는지는 초안 `placements`에서 정한다(collision padding으로 창 안에 둔다).
- **툴팁**: 서랍이 열려 있을 때와, 서랍을 닫아 포커스가 링으로 돌아온 직후의 focus로는 열지 않는다. 다음 hover나 다음 키보드 포커스에서는 연다.
- **읽기**: 서랍을 열 때 `usageRequest({ trigger: "open" })`, Refresh는 `{ trigger: "refresh" }`. 헤더와 같은 서비스와 메모리 값을 쓰고, 새 IPC 형식은 없다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `contextDrawerView({ context, provider, usageHidden, entries, now })` → `{ context: { label, tokens }, usage: RowView | null, busy }`. 행이 없는 경우(Antigravity, legacy와 터미널 세션, entry 없음)와 행 문구는 `rowView`를 따른다.
2. 링 버튼의 접근 속성(이름, 설명, `aria-haspopup`, `aria-expanded`)과 툴팁 열림 여부(서랍 열림, 닫힘 직후 focus).
3. 서랍 닫힘과 포커스 반환: Escape와 바깥 누르기 → 링, 링이 사라짐 → 안에 있었으면 composer 입력 아니면 그대로, 행이 사라짐 → 서랍 컨테이너.
4. main의 `visible` 계산: 메인 창 표시, 앱 숨김, 프로토타입 창 표시의 조합.

## 형식 변경

- 없다. 사용량 IPC의 요청과 응답 형식은 그대로이고, 허용하는 창만 넓어진다. `UsageEntry`에는 연결 ID, 프로필, 계정 같은 신원이 없다(`usageTypes.ts` 주석). 그래서 프로토타입 창의 격리 규칙("계정 신원이 넘어가지 않는다")과 충돌하지 않는다.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 conventions와 `doan check`에는 영향이 없다.
- ARCHITECTURE: §7의 Agent usage IPC 줄(796행 근처), §3 Prototype window의 'Sender role' 목록과 'Narrow reads'(170행 근처)를 고친다. 프로토타입 창이 사용량을 읽고 `changed`를 받는다는 것과 그 근거(신원 없음)를 적는다.
- PRODUCT
  - §5 'Context window ring'의 "The ring is not a control …"을 버튼과 서랍 규칙으로 다시 쓴다.
  - 'Agent usage'의 읽기 시점에 서랍 열기를 더하고, 숨김 규칙을 "보이는 창이 하나라도 있으면"으로 바꾼다.
  - 'Prototype window' 대화 패널 서술에 서랍을 적는다.
  - 모두 사용자가 요청하거나 승인한 변경이다.

## 포스트모템에서 가져온 함정

- 2026-11-09 "A quietly opened update popover closed when Agent usage moved focus between two places outside it": 포커스를 옮기지 않는 popover의 닫힘 가드다. 서랍은 열 때 포커스를 옮기므로 해당하지 않지만, 헤더 popover와 한 창에서 오갈 때의 닫힘을 테스트한다.
- 2026-11-06 "The Agent usage popover stayed open on a press in the app header": 헤더의 drag region 위 누르기는 DOM 이벤트로 오지 않을 수 있다. 프로토타입 창 헤더 근처에서 바깥 누르기를 네이티브 클릭으로 확인한다.
- 2026-11-01 "A frame drawer list closed by a disabled trigger reopened by itself": 트리거가 사라지면 서랍이 스스로 닫혀야 한다. `open && enabled`만으로 표현하지 않는다.
- 2026-10-23 "Re-hovering a dismissed tooltip did not reopen it": 닫힘 직후 툴팁을 막는 규칙이 다음 hover까지 막지 않게 한다.

## 디자인 프리셋

- 읽은 프리셋: `harden`(읽는 중, 실패, 한도 도달, 행 없음, 링이 사라짐 상태를 빠짐없이 그린다).

## 초안 요청

- 캔버스: `.doan/canvases/context-ring-drawer.html`, id `context-ring-drawer`, 너비 1440. 기존 `context-window-ring.html`과 `provider-usage.html`은 고치지 않는다.
- 프레임
  - `trigger`: 링 버튼의 기본, hover, pressed(서랍 열림), focus-visible 상태. neutral과 danger 링 둘 다 그린다. 넓힌 히트 영역을 점선으로 표시하고(보드 전용), 위 수치 제약을 적는다. 좁은 tray(아이콘만 남은 상태)도 넣는다. tray 레이아웃이 지금과 같음을 나란히 보여준다.
  - `drawer`: 서랍 내용. Claude Code(5h·Weekly), Codex, Copilot, 읽는 중, 실패, 한도 도달, reset 지남, Refresh busy, Context만(Antigravity·legacy·연결 없음) 상태.
  - `placements`: 오버뷰, 캔버스 패널(347), 프로토타입 창 패널(280)에서 서랍이 열린 위치.
- 측정 대상(`/design-sync`): 링 버튼(보이는 박스, 히트 영역, 상태 표시), 서랍 컨테이너와 Context 섹션. 사용량 행은 헤더의 출시된 행을 옮긴 것이다.

## PoC 의존

- 없다. Radix Popover, 사용량 서비스, `rowView`, 프로토타입 창의 `SharedWithMain` 경로와 `prototype.send`는 이미 쓰이고 있다.
