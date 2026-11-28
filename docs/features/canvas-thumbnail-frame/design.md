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

## PoC 결과

2026-11-28, Electron 45.3.4, Retina 디스플레이(DPR 2)와 `--force-device-scale-factor=1`(DPR 1). probe와 원자료는 `.scratch/canvas-thumbnail-frame/`(`probe.mjs`, `fixtures.mjs`, `summary-dpr2.txt`, `summary-dpr1.txt`, `probe-hang.log`, `out/<dpr2|dpr1|hang>/`의 `results.json`과 캡처 PNG)에 있다.

**방법**: 격리된 실제 앱(임시 userData·HOME·SHELL, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`·`DOAN_RUNTIME` 격리, `app/runtime/` 지원)을 띄우고, 실제 썸네일 서비스가 찍은 캔버스 URL(실제 로컬 서버와 토큰)을 얻었다. 앱 코드를 바꾸지 않으려고 main에 같은 설정의 복제 캡처 창(`show: false`, preload 없음, `sandbox`, `contextIsolation`, 같은 `hostPage`와 `frameScript`)을 만들어 측정했다. 앱 전역의 `web-contents-created` 탐색 차단은 복제 창에도 그대로 걸렸다. 실제 썸네일 창에서 직접 잰 것은 아니므로, T3 테스트와 T4 실기 확인에서 다시 본다. probe가 끝날 때마다 실제 사용자 상태가 바뀌지 않았음을 확인했다(`real-state verification passed`).

### 확인한 것

1. **main world 읽기**: `frame-created`에서 묶은 바깥 캔버스 frame을 load 뒤 `mainFrame.frames`에서 `frameTreeNodeId`로 다시 찾아 `frame.executeJavaScript`로 읽었다. sandboxed cross-origin(OOPIF) 캔버스에서 되고, 캔버스 CSP `script-src 'none'`에서도 된다(페이지 스크립트는 막혔고 읽기는 값을 돌려줬다). `mainFrame.frames`에는 바깥 frame 하나만 있었고, 중첩 iframe은 바깥 frame의 `frames`에만 있어 읽지 않았다. 중첩 iframe 안의 `[data-doan-frame]`가 문서 순서상 앞이어도 바깥 문서의 프레임만 골랐다. 읽기 지연은 0–2 ms다.
2. **스크롤 뒤 다시 그리기**: 스크롤 직후 바로 `capturePage`하면 스크롤 전 화면이 찍힌다. DPR 2에서 64번 중 20번, DPR 1에서 16번 중 2번이었다. 스크롤한 같은 frame에서 `requestAnimationFrame`을 두 번 기다리면 64번·16번 모두 새 화면이 찍혔다. 100 ms 타이머와 `capturePage` 두 번도 모두 맞았다. 숨은 창에서도 rAF가 돈다(12–41 ms). 한 번도 캡처하지 않은 새 창에서도 돌았다.
3. **스크롤 방법**:
   - `window.scrollTo`는 body가 스크롤 컨테이너인 캔버스(`html{overflow:hidden} body{overflow:auto}`)를 움직이지 못해 첫 화면이 된다. `el.scrollIntoView({ block: "start", behavior: "instant" })`는 그 캔버스도 프레임으로 찍었다.
   - 루트 `overflow: clip`은 Chromium이 viewport에서 `hidden`처럼 다루어 두 방법 모두 스크롤됐다. `body{overflow:hidden}`도 스크롤됐다. 그래서 "루트 clip이 스크롤을 막는다"는 위험은 실제로 일어나지 않았다.
   - 루트에 `scroll-behavior: smooth`가 있으면 `behavior`를 주지 않은 `scrollTo(0, top)`가 움직이지 않아 첫 화면이 된다. `behavior: "instant"`를 주면 된다.
   - 문서 끝의 프레임은 최대 스크롤이 프레임 top에 못 미쳐 viewport 중간(y 300)에 놓였고, `프레임 ∩ viewport`(880 × 300)가 찍혔다. 키 큰 프레임은 위쪽 600 px(16:10)만 찍혔다.
   - fixed 헤더와 sticky 막대는 프레임 캡처 위쪽에 겹쳐 찍힌다(`out/dpr2/fixed-scrollIntoView.out.png`). 캔버스 스타일을 바꾸지 않는 한 막을 수 없어 한계로 둔다.
4. **해상도**: 390 px 폰 프레임은 DPR 2에서 원본 780 × 1200 device px, DPR 1에서 390 × 600이고, 둘 다 480 폭으로 줄이거나 늘려 저장된다. 표시 칸의 device px 폭은 312 × DPR이고 원본 폭은 프레임 폭 × DPR이라, DPR과 관계없이 프레임이 312 CSS px 이상이면 원본이 칸보다 넓다. 390 px 프레임은 조건을 만족한다. 200 px 프레임은 원본이 400(DPR 2)·200(DPR 1) device px라 칸에서 늘어나 보인다. 출력은 지금과 같이 항상 480 px라, DPR 2의 312 px 칸(624 device px)에서는 지금의 첫 화면 썸네일도 늘어나 보인다.
5. **측정 제한 시간**: load 뒤 5 s 동안 바쁜 캔버스와, `document.querySelector`를 무한 루프로 바꾼 캔버스는 읽기가 1 s 제한에 걸려 첫 화면이 찍혔다. 작업 전체가 1.65–1.7 s라 `JOB_LIMIT_MS`(20 s)와 거리가 멀다. 제한에 걸린 `executeJavaScript`는 끝나지 않은 채 남고 결과는 버린다. 정상 작업 지연: load 600–860 ms(지금과 같다), 읽기 0–2 ms, 스크롤 0–1 ms, rAF 대기 12–41 ms이고, 작업 전체 중앙값은 620–675 ms다(첫 화면만 찍는 작업은 약 630 ms).
6. **값 검사**: 캔버스가 `getBoundingClientRect`를 바꿔 `x: NaN, y: -5, width: 1e7, height: 1e7`을 돌려주면 검사에서 걸러져 첫 화면이 됐다. 첫 프레임이 0 × 0이면 그 뒤에 보통 프레임이 있어도 첫 화면이다(spec 그대로). SETTLE 뒤 스크립트가 만드는 프레임은 찾지 못해 첫 화면이다(타이밍 한계 그대로).
7. **캐시**: 서버가 제공하는 범위(serving scope)는 `.doan/canvases`뿐이다(`doan ls`의 `scope`). 그 안의 CSS(`assets/move.css`)를 바꿔 프레임을 옮기자 실제 서비스가 다시 찍었다(두 DPR 모두 1 → 2회). 프레임 위치는 캔버스 HTML, 범위 안의 파일, 그리고 지금도 추적하지 않는 것(외부 CDN 파일, 시각·난수에 따른 스크립트, 늦게 들어오는 내용)으로만 바뀐다. 마지막 것은 지금의 첫 화면 썸네일도 같은 한계라 캐시 키는 바꾸지 않는다.

### 고른 방법과 design에서 바뀐 점

- **스크롤**: `scrollTo(프레임 top)` 대신 `scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" })`를 쓰고, 스크롤한 뒤의 viewport 사각형을 다시 읽는다. body가 스크롤 컨테이너인 캔버스도 다루고, 문서 좌표에서 스크롤 값을 빼는 계산이 없어진다. 다시 읽은 값도 캔버스가 만든 값이라 main이 한 번 더 검사한다(유한값, 폭·높이 > 0, `[0, doan:width]` 안, viewport와 겹침).
- **다시 그리기 대기**: 스크롤한 같은 스크립트 안에서 rAF 두 번을 기다린 뒤 사각형을 돌려준다. 캔버스가 rAF를 바꿔 끝나지 않게 해도 같은 1 s 제한에 걸리고, 그 캔버스 썸네일만 영향을 받는다.
- **스크립트 수**: 두 번 실행한다. ① 읽기(검사를 통과해야 스크롤한다, 0 × 0이면 스크롤하지 않는다), ② 스크롤 + rAF 두 번 + viewport 사각형. 두 번을 합쳐 약 1 s 제한이다.
- **첫 화면으로 돌아갈 때**: ②가 제한에 걸리거나 검사에서 걸리면 이미 스크롤됐을 수 있다. 첫 화면을 찍기 전에 `scrollTo({ top: 0, left: 0, behavior: "instant" })`로 되돌리거나(되돌린 뒤 다시 그리기 대기가 필요하다), 그 작업을 첫 화면 대신 실패로 볼지 T3에서 정한다. probe에서는 되돌리지 않았다.
- **배율 함수**: 넣지 않는다. 390 px 프레임은 두 DPR에서 원본이 칸보다 넓다. 312 CSS px보다 좁은 프레임이 칸에서 늘어나 보이는 것은 한계로 적는다.
- **추가 제안(캡처 높이 상한)**: 캡처 사각형 높이는 viewport(600)까지라, 폭이 좁은 프레임은 480 폭으로 바꾸면 PNG가 매우 길어진다(200 px 프레임은 480 × 960, 10 px 프레임은 480 × 28800). 썸네일 칸 중 가장 세로로 긴 것은 Overview 행의 1:1(48 × 48)이고 모두 `object-position: top`이라, 높이를 프레임 폭 이하로 잘라도 보이는 부분이 같다. `thumbnailRect`에서 높이를 `min(viewport와 겹친 높이, 폭)`으로 자르는 것을 제안한다. 1:1보다 세로로 긴 썸네일 칸이 없는지는 T3에서 확인한다.

### 이 기능과 무관하게 이미 있는 문제

- 자기 renderer에서 영원히 멈추는 캔버스(load 뒤 `for(;;){}`, main 읽기 없음)가 한 번 찍히면, 같은 세션의 뒤 작업은 모두 `LOAD_LIMIT_MS`(8 s)까지 기다린 뒤 흰 화면을 찍었다(`probe-hang.log`, 26작업 연속, 창을 새로 만들어도 같다). 같은 사이트(127.0.0.1)의 캔버스가 멈춘 renderer 프로세스를 다시 쓰는 것으로 보인다(관찰이고 원인은 확인하지 않았다). 지금의 첫 화면 캡처에서도 같은 일이 생기고, main 읽기를 무한 루프로 만든 캔버스도 같은 계열이라 이번 측정이 새로 만든 위험은 아니다. 제한에 걸린 뒤 그 frame의 renderer를 죽이면 다음 작업이 정상으로 돌아온 경우가 한 번 있었지만(DPR 1 run), 반복 검증은 못 했다. 이 기능 범위 밖이라 BACKLOG 후보로 넘긴다.
- 바쁜 캔버스(5 s)는 같은 프로세스를 다시 쓰는 다음 작업의 load를 약 4 s 늦췄다. 이것도 지금과 같다.
