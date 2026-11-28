# 캔버스 썸네일 프레임 — design

## 영향 범위

- **앱(main)**: `app/src/main/thumbnailWindow.ts`(캡처 문서와 사각형), `app/src/main/thumbnails.ts`(작업 흐름), 필요하면 `thumbnailCache.ts`(캐시 키에 프레임 사각형이 들어가야 하는지).
- **앱(renderer)**: 표시 쪽은 이미 `object-fit: cover`라 바뀌지 않을 수 있다(정렬 결정에 따라 `object-position`).
- **형식, CLI, 스킬**: 바뀌지 않는다.

## 지금 구조와 바꿀 곳

- 썸네일 창(`thumbnailWindow.ts`)은 숨은 `BrowserWindow`(preload 없음, `sandbox`, `contextIsolation`)에 `data:` host 문서를 열고, 작업마다 새 sandboxed iframe에 캔버스를 띄운다. 캔버스에 스크립트를 넣지 않는다. host 문서의 스크립트(`frameScript`)가 iframe의 사각형을 돌려주고 `capturePage(rect)`로 찍어 `THUMBNAIL_WIDTH`(480)로 줄인다.
- host 문서는 cross-origin인 캔버스 안을 읽을 수 없으므로, 첫 프레임의 위치를 알 방법이 지금은 없다. 바꿀 곳이 여기다.

## 측정 방법 (리뷰 반영)

- `webFrameMain.executeJavaScriptInIsolatedWorld`는 Electron 45.3.4에 없다(`WebFrameMain`에는 main world `executeJavaScript`만 있다). 메인 창이 이미 OOPIF 캔버스에 main world 스크립트를 실행한다(`index.ts` `injectCanvasScript` → `frame.executeJavaScript`). 썸네일 창에서도 main이 그 job의 바깥 캔버스 frame(`outerFrameId`, load 뒤 `mainFrame.frames`에서 다시 찾는다, postmortem 2026-10-25)에서 main world 읽기 스크립트를 한 번 실행한다. 중첩 iframe에서는 실행하지 않는다.
- 읽기: `document.querySelector("[data-doan-frame]")`(문서 순서에서 바깥 프레임이 항상 앞이므로 첫 최상위 프레임이다, `canvasScript.ts`)의 문서 좌표 사각형.
- 값 검사: 캔버스가 값을 만들 수 있으므로 main이 검사한다. 유한값, 폭·높이 > 0, x는 `[0, doan:width]` 안, 높이 상한. 벗어나면 첫 화면. 측정은 약 1초 제한을 두고 넘으면 첫 화면(지금은 캔버스가 바빠도 host 타이머로 첫 화면이 찍히므로, 측정 때문에 `JOB_LIMIT_MS` 뒤 실패가 되면 안 된다).
- 찍기: 프레임 top으로 main world `scrollTo` 뒤 `프레임 ∩ 지금 viewport`를 `capturePage`. 창 크기와 viewport 높이가 그대로라 vh 레이아웃이 바뀌지 않고, 키 큰 프레임은 위쪽 16:10까지만 찍힌다.
- 캐시: 프레임 위치는 캔버스 HTML이나 served 파일이 바뀔 때만 바뀌고, 둘 다 이미 stale 판정에 들어 있다(`thumbnailCache.ts`). 키는 바꾸지 않는다. `appVersion`도 판정에 있어 배포 뒤 첫 실행에 모든 썸네일이 다시 찍힌다(받아들이는 한계).
- 배율: 표시 칸은 최대 312 CSS px(DPR 2에서 624 device px)이고 출력은 `THUMBNAIL_WIDTH` 480이다. 390 px 프레임은 DPR 2에서 원본 780 px라 충분하다. 배율 함수는 PoC에서 DPR 1이나 약 240 px보다 좁은 프레임에 필요할 때만 더한다(필요하면 host CSS `transform: scale()`, capturePage가 transform을 따른다는 것은 프로토타입 창에서 실측됨, ARCHITECTURE §3 'Rendering in place').
- 타이밍 한계: load + `SETTLE_MS`(500 ms)에 한 번 잰다. 그 뒤 자리를 잡는 웹 폰트나 JS 프레임은 틀린 사각형이나 첫 화면이 될 수 있다(한계로 ARCHITECTURE에 적는다).

## PoC (T1)

격리된 실제 앱에서 확인한다.

- 썸네일 창의 sandboxed cross-origin 캔버스 frame에서 main world 읽기와 `scrollTo`가 되는지, 캔버스 CSP `script-src 'none'`에서도 되는지.
- 위험: 루트가 `overflow: clip`이라 스크롤이 막히는 경우, fixed·sticky 요소가 겹쳐 찍히는 경우, 스크롤 뒤 숨은 창이 새 프레임을 그리기 전에 찍히는 경우(off-screen rAF와 같은 계열, ARCHITECTURE §3 'Height').
- 좁은 프레임 해상도(DPR 1·2), 측정 지연 처리.
- 결과를 이 문서 'PoC 결과'에 적는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `thumbnailRect(measured, viewport, boardWidth)`: 측정값 검사(유한, 양수, 보드 폭 안, 높이 상한)와 고른 사각형(스크롤할 top, `프레임 ∩ viewport`), 아니면 첫 화면. 배율 함수는 PoC에서 필요할 때만.

## postmortem에서 가져온 주의점

- 구현 때 `rg -n -i 'thumbnail' docs/postmortem/`로 썸네일 항목(캐시, 큐, 숨은 창, 실패 처리)을 다시 확인한다.

## 형식, 규약, 결정에 미치는 영향

- ARCHITECTURE §3 'Capture document'("with no injection: the thumbnail is the first screen")를 새 규칙으로, §3 'Capture window'에 main이 캔버스 frame에서 읽기 스크립트를 한 번 실행한다는 문장을, §3 'Injection'(주입은 메인 창 iframe에만)에 썸네일 측정 예외를, 타이밍 한계를 적는다.
- PRODUCT: canvas card와 Overview 행이 함께 쓰는 썸네일 문장(PRODUCT §5 item 3 'Canvas cards' 근처)에 첫 최상위 프레임을 적는다.
- `docs/design/project.md` 'Thumbnails', `docs/design/conversation.md` 'Banner' 줄, `thumbnailWindow.ts`의 "first 16:10 screen" 주석.

## 드래프트

- 그릴 새 화면이 없다(표시 칸은 그대로). `/design-draft`는 건너뛴다. 대신 T4에서 실기 스크린샷으로 확인한다.
