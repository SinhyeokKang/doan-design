# 프로토타입 작성 계약 — design

## 결정

- **높이 수단**: Doan이 재생 중인 프레임에만 `--doan-viewport-height: 100vh`를 넣는다. 에이전트는 `var(--doan-viewport-height, <H>px)`로 쓴다(사용자 결정: CSS 변수).
  - 보드, 캔버스 export 뷰어, 썸네일 캡처는 손대지 않는다. 대체값이 WxH의 H를 주므로 보드에서는 프레임이 화면 크기로 보이고 안에서 스크롤된다.
  - 이렇게 하면 보드에 스크립트를 더할 필요가 없다. 썸네일 창은 canvas script를 주입하지 않으므로(`injectCanvasScript`는 main 창에만 걸린다, `app/src/main/index.ts`) 보드 쪽에서 변수를 정하는 설계는 썸네일에서 깨진다.
  - 재생 iframe 안의 `100vh`는 viewport 높이다. Fit에서는 WxH의 H, Responsive와 export 파일에서는 창 높이다(ARCHITECTURE §3 'Prototype window' 'Rendering in place').
- **재생 신호**: 공개하지 않는다(사용자 결정). 캔버스와 재생이 같게 보이도록 "설명 상태는 별도 프레임"을 가이드 패턴으로 둔다.
- **프레임 자체 규칙**(`min-height:100vh`, `height` 미지정)은 바꾸지 않는다. `height:100vh`로 고정하면, 내용이 더 긴 기존 프로토타입은 프레임 배경이 중간에서 끊긴다.

## 영향받는 구성 요소

- **앱 main**: `app/src/main/prototypeScript.ts`의 `isolate`가 adopted sheet의 `[data-doan-proto-frame]` 규칙에 `--doan-viewport-height: 100vh !important`를 더한다. inline `!important`로 같은 변수를 덮는 캔버스는 막지 않는다(지금 다른 속성과 같은 한계다).
- **CLI export**: `cli/internal/export/viewer/isolate.js`에도 같은 줄을 더한다. 두 스크립트가 같은 규칙을 가진다는 drift 테스트가 이미 있으면 거기에 이 줄도 포함한다(`app/runtime/electronDom.ts`, `prototypeScript.test.ts`, `cli/internal/export/assemble_prototype_test.go`를 `/tdd`에서 확인).
- **CLI check** (`cli/internal/check/check.go`, `cli/internal/canvas/css.go`)
  - `undefined_token`에서 `--doan-viewport-height`를 뺀다(Doan이 정하는 이름).
  - 새 경고 코드 `viewport_height_no_fallback`: 캔버스 자신의 스타일에서 `var(--doan-viewport-height)`에 대체값이 없을 때(`Reference.HasFallback == false`). 공유 스타일시트에서도 같은 규칙인지는 `/tdd`에서 기존 `viewport_height_unit`(캔버스 자신만)의 범위를 따른다.
- **가이드** (`cli/internal/cli/skill.md`): 규칙 11, 14를 고치고 상호작용·상태·범위 문구를 더한다. 범위 확인은 프로토타입 작업의 절차라서 규칙 14 안에 짧게 두거나 Agent rules에 한 줄로 둔다. 출력 예산 안에서 가장 짧은 쪽을 고른다.
- **형식**: `schema/` 변경 없음. `doan check` 응답의 finding `code`에 값 하나가 더해진다. 코드 목록을 schema가 열거하는지 `/tdd`에서 확인하고, 열거한다면 그 schema와 fixture를 같이 고친다.

## 가이드 문구 초안 (영문, 구현 때 예산에 맞춰 줄인다)

- 11 끝에 더할 문장: "In a frame marked with `data-doan-prototype`, use `var(--doan-viewport-height, <H>px)` instead (rule 14)."
- 14를 다음으로 바꾼다.
  - "`data-doan-prototype="<W>x<H>"` is the target screen's viewport (1440x900 desktop, 390x844 phone), not the content's height."
  - "Playing, the frame spans the viewport's width and is at least its height; Fit keeps W×H as the viewport and only scales down, Responsive and an exported file fill the window."
  - "For a layout that fits the window (fixed header, inner scroll), size it with `height: var(--doan-viewport-height, <H>px)`: Doan sets it while playing; the board and thumbnails use the fallback."
  - "Keep modals and toasts inside the frame with `position: absolute` (the frame `position: relative`). Scope scripts to their frame element; give elements a script creates no `data-doan-id`. Each play loads the document fresh."
  - "Start a playable frame in its default state; draw an open tooltip or dialog you want reviewed as its own frame."
  - 기존 문장(Other-page links, form submits and new windows do nothing; hash links and `pushState` work)은 둔다.
- 범위 확인(Agent rules 또는 14): "Before building a prototype, settle which interactions should work; if the request does not say, ask once."

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. check: `undefined_token` 제외 목록과 `viewport_height_no_fallback` 판정. 입력은 스타일 텍스트에서 나온 `Reference` 목록이다.
2. 재생 스타일시트 문자열: `prototypeScript.ts`와 `isolate.js`의 프레임 규칙에 변수가 있고, 두 곳이 같다.
3. 가이드 계약 테스트: 규칙 14에 변수 이름, 대체값 형태, WxH 의미, Fit/Responsive 문장이 있다.

## 규칙(conventions)·결정 영향

- ARCHITECTURE §1 convention 11(vh), 14(prototype mark)의 설명이 바뀐다. 새 캔버스 속성은 없다. 변수는 Doan이 정하는 값이고, 에이전트가 쓰지 않으면 아무것도 바뀌지 않는다. 그래서 PRODUCT §3 Out of scope 2(캔버스 형식 강제)에 걸리지 않는다.
- `doan check`에 경고 규칙 하나가 더해진다.
- 서빙 범위·샌드박스(`allow-scripts`, `allow-same-origin` 없음)는 그대로다. 재생 스크립트의 adopted sheet에 한 줄이 더해질 뿐이다.
- PRODUCT §5 item 2 'Prototype window'와 item 3 'Prototype file'에 "재생 중 프레임은 `--doan-viewport-height`를 받는다"를 적는다.
- 가이드와 `doan check` 규칙이 바뀌므로 `/agent-eval` 대상이다(AGENTS.md 'Workflow').

## 포스트모템에서 가져온 함정

- 2026-10-22 "A linked 100vh canvas kept the inherited iframe height after the 150px reset": 보드에서 viewport 단위는 iframe 높이와 서로 쫓는다. 그래서 보드에서는 변수를 정하지 않고 대체값(px)만 쓰게 한다.
- 2026-10-29 "Codex cut the middle out of the doan guide…": 가이드 문구를 더할 때 `skillOutputBudget` 테스트 안에 들어가야 하고, 중간이 잘려도 끝 표시로는 알 수 없다. 새 문장마다 가이드 계약 테스트로 고정한다.
- 2026-11-15 "The exported prototype followed links the canvas had cancelled…": 재생 창과 export 파일의 재생 스크립트가 따로 있어 한쪽만 고치기 쉽다. 두 곳을 같은 테스트로 묶는다.

## 디자인 프리셋

- UI 변경이 없어 읽지 않았다.

## PoC 의존

- 없다. 재생 iframe의 `100vh`가 viewport 높이라는 점은 ARCHITECTURE §3 'Rendering in place'에 측정된 사실로 있다(Electron 45). export 파일의 브라우저 동작(Chromium·WebKit `file://`)은 기존 export 확인 범위를 따른다.
