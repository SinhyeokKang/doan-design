# 프로토타입 작성 계약 — design

## 결정

- **높이 수단**: Doan이 재생 문서의 `:root`에만 `--doan-viewport-height`를 정한다. 에이전트는 `var(--doan-viewport-height, <H>px)`로 쓴다(사용자 결정: CSS 변수, `:root`).
  - 보드, 캔버스 export 뷰어, 썸네일 캡처는 손대지 않는다. 대체값이 WxH의 H를 주므로 보드에서는 프레임이 화면 크기로 보이고 안에서 스크롤된다.
  - 보드에 스크립트를 더할 필요가 없다. 썸네일 창은 canvas script를 주입하지 않으므로(`injectCanvasScript`는 main 창에만 걸린다, `app/src/main/index.ts`) 보드 쪽에서 변수를 정하는 설계는 썸네일에서 깨진다.
  - `:root`에 두는 이유: 재생 문서는 재생 iframe과 export 파일 안에만 있으므로 보드에 영향이 없다. 재생이 시작된 뒤 body에 붙은 요소(ARCHITECTURE §3 'Rendering in place')도 같은 값을 받는다.
- **값**: `100vh`를 기본으로 두고, `@supports (height: 100dvh)`에서 `100dvh`로 덮는다(사용자 결정). 휴대폰 Safari에서 연 export 파일은 보이는 높이를 따른다. 커스텀 속성은 두 번 선언하면 뒤의 것이 지원 여부와 상관없이 이기므로 `@supports`로 나눈다. 재생 창(Electron)에서는 두 값이 같다. Fit에서는 iframe이 mark 크기이므로 둘 다 H로 풀린다(ARCHITECTURE §3 'Rendering in place': "`100vh` stay at the mark", `transform: scale`은 영향 없음).
- **재생 신호**: 공개하지 않는다(사용자 결정). 캔버스와 재생이 같게 보이도록 "설명 상태는 별도 프레임"을 가이드 패턴으로 둔다.
- **프레임 자체 규칙**(`min-height:100vh`, `height` 미지정)은 바꾸지 않는다. `height:100vh`로 고정하면, 내용이 더 긴 기존 프로토타입은 프레임 배경이 중간에서 끊긴다. 프레임 규칙에 `height`가 없으므로 에이전트가 프레임 자체에 `height: var(...)`를 써도 그대로 적용된다.

## 영향받는 구성 요소

- **앱 main**: `app/src/main/prototypeScript.ts`의 `isolate`가 adopted sheet에 다음을 더한다.
  ```
  :root { --doan-viewport-height: 100vh !important; }
  @supports (height: 100dvh) { :root { --doan-viewport-height: 100dvh !important; } }
  ```
  캔버스의 inline `!important`는 덮지 못한다(지금 다른 속성과 같은 한계다). 가이드는 직접 정의하지 말라고 적는다.
- **CLI export**: `cli/internal/export/viewer/isolate.js`에 같은 규칙을 더한다. `app/src/main/exportViewer.test.ts`의 "isolate.js is the prototype window's isolation" 테스트(`isolationSheet(isolateJs)`와 `isolationSheet(appPrototypeScript)` 비교)가 두 시트를 같게 묶으므로, 새 규칙이 그 시트 문자열 안에 들어가기만 하면 된다.
- **CLI check** (`cli/internal/check/check.go`)
  - `undefined_token`: `s.Refs` 루프(지금 `check.go` 293–296행 근처)에서 `--doan-viewport-height`를 뺀다. `undefined_token`은 공유 스타일시트에도 적용되므로(`check.go` 265행 근처) 제외도 양쪽에 걸린다.
  - `viewport_height_no_fallback`: 같은 `scan` 클로저의 `if !shared` 블록에서, `Reference.HasFallback == false`인 `--doan-viewport-height` 참조마다 경고한다(`viewport_height_unit`과 같은 범위). `HasFallback`은 `cli/internal/canvas/css.go`가 이미 계산하지만 지금은 읽는 곳이 없다.
  - `viewport_height_unit` 메시지 끝에 "In a `data-doan-prototype` frame, use `var(--doan-viewport-height, <H>px)`."를 더한다. check는 스타일과 프레임을 잇지 못하므로 조건문으로 쓴다.
  - `viewportHeights` 스캐너는 숫자 뒤 단위만 잡는다(`css.go` 283–289행 근처). 그래서 `var(--doan-viewport-height, 900px)`는 경고하지 않고, 대체값이 `100vh`면 `viewport_height_unit`이 난다. 의도와 맞다. `hardcoded_color`는 색만 보므로 대체값 px는 경고되지 않는다.
- **가이드** (`cli/internal/cli/skill.md`): 규칙 11, 14를 고치고 상호작용·상태 문구를 더한다. 범위 확인은 Agent rules에 한 줄로 둔다.
- **형식**: 바뀌지 않는다. `schema/cli-envelope.v1.schema.json`은 finding `code`를 열거하지 않고 패턴(`^[a-z]+(_[a-z]+)*$`)만 둔다. 코드 문자열을 읽는 TS 코드도 `app/src`에 없다.

## 가이드 문구 초안 (영문)

예산: `skillOutputBudget`은 21,600 B(`cli/internal/cli/skill_test.go`)이고, 지금 `skill.md`는 약 20,391 B다. JSON 이스케이프, 번들 안내, 끝 표시, envelope을 더하면 남는 여유는 약 800 B다. 아래 초안을 그대로 넣으면 넘칠 수 있으므로, 먼저 남은 여유를 재고 넘치면 이 순서로 줄인다.
1. Fit/Responsive 설명을 한 구로 합친다.
2. 규칙 11에 더하는 문장을 "(in a marked frame, see rule 14)" 참조 하나로 줄인다.
3. 범위 확인을 Agent rules에 한 줄로 둔다(이미 그렇게 쓴다).

- 규칙 11 끝: "In a marked frame, see rule 14."
- 규칙 14 (기존 첫 문장의 마크 문법과 `doan check` 오류 문장은 둔다)
  - "W×H is the target screen's viewport (1440x900 desktop, 390x844 phone), not the content height. Playing, the frame spans the viewport and is at least its height, never scaled up: Fit keeps W×H and only scales down, Responsive and an exported file fill the window."
  - "To fit the window (fixed header, inner scroll), set the frame's or app root's `height: var(--doan-viewport-height, <H>px)`; Doan sets it only while playing, so the board and thumbnails use <H>. Do not define it."
  - "Suggested: keep modals and toasts inside the frame with `position: absolute` (frame `position: relative`); scope scripts to their frame; give elements a script creates no `data-doan-id`; each play reloads the document. Start in the default state; draw an open tooltip or dialog to review as its own frame."
  - 기존 문장(Other-page links, form submits and new windows do nothing; hash links and `pushState` work)은 둔다.
- Agent rules 한 줄: "Prototypes: build the interactions the request names, ask only when scope changes the result, and say which are not wired."

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. check: `undefined_token` 제외(전체 범위), `viewport_height_no_fallback` 판정(캔버스 자신의 스타일만), `viewport_height_unit` 새 메시지. 입력은 스타일 텍스트에서 나온 `Reference` 목록이다.
2. 재생 스타일시트 문자열: 두 스크립트의 시트에 `:root` 변수 규칙과 `@supports` 규칙이 있다. 같음은 기존 drift 테스트가 본다.
3. 가이드 계약 테스트: 규칙 11·14와 Agent rules의 새 문장.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 convention 11(vh), 14(prototype mark)의 설명이 바뀐다. 새 캔버스 속성은 없다. 변수는 Doan이 정하는 값이고, 에이전트가 쓰지 않으면 아무것도 바뀌지 않는다.
- PRODUCT §3 Out of scope 2는 "Two optional attributes add a contract only where the agent puts them"라고 적는다. 변수도 마크가 있는 프레임이 재생될 때만 생기는 계약이므로, 승격 때 그 문장에 한 구절을 더한다(예: "a marked frame also gets `--doan-viewport-height` while playing").
- `doan check`에 경고 규칙 하나가 더해지고, 기존 메시지 하나가 바뀐다.
- 서빙 범위·샌드박스(`allow-scripts`, `allow-same-origin` 없음)는 그대로다. 재생 스크립트의 adopted sheet에 규칙이 더해질 뿐이다.
- PRODUCT §5 item 2 'Prototype window'와 item 3 'Prototype file'에 "재생 문서는 `--doan-viewport-height`를 viewport 높이로 받는다"를 적는다.
- 가이드와 `doan check` 규칙이 바뀌므로 `/agent-eval` 대상이다(AGENTS.md 'Workflow').
- "재생마다 초기화"의 근거: 재생마다 새 iframe을 만든다(ARCHITECTURE §3 'Rendering in place': "gives each run a new iframe").

## 포스트모템에서 가져온 함정

- 2026-10-22 "A linked 100vh canvas kept the inherited iframe height after the 150px reset": 보드에서 viewport 단위는 iframe 높이와 서로 쫓는다. 그래서 보드에서는 변수를 정하지 않고 대체값(px)만 쓰게 한다.
- 2026-10-29 "Codex cut the middle out of the doan guide…": 가이드 문구를 더할 때 `skillOutputBudget` 테스트 안에 들어가야 하고, 중간이 잘려도 끝 표시로는 알 수 없다. 새 문장마다 가이드 계약 테스트로 고정한다.
- 2026-11-15 "The exported prototype followed links the canvas had cancelled…": 재생 창과 export 파일의 재생 스크립트가 따로 있어 한쪽만 고치기 쉽다. 기존 drift 테스트가 두 시트를 묶는다.

## 디자인 프리셋

- UI 변경이 없어 읽지 않았다.

## PoC 의존

- 없다. 재생 iframe의 `100vh`가 viewport 높이라는 점은 ARCHITECTURE §3 'Rendering in place'에 측정된 사실로 있다(Electron 45). 휴대폰 Safari의 dvh 동작은 `/runtime-test`에서 WebKit으로 확인하고, 실제 휴대폰에서 확인하지 못하면 BACKLOG에 남긴다.
