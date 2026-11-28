# 캔버스 썸네일 프레임 — design

## 영향 범위

- **앱(main)**: `app/src/main/thumbnailWindow.ts`(캡처 문서와 사각형), `app/src/main/thumbnails.ts`(작업 흐름), 필요하면 `thumbnailCache.ts`(캐시 키에 프레임 사각형이 들어가야 하는지).
- **앱(renderer)**: 표시 쪽은 이미 `object-fit: cover`라 바뀌지 않을 수 있다(정렬 결정에 따라 `object-position`).
- **형식, CLI, 스킬**: 바뀌지 않는다.

## 지금 구조와 바꿀 곳

- 썸네일 창(`thumbnailWindow.ts`)은 숨은 `BrowserWindow`(preload 없음, `sandbox`, `contextIsolation`)에 `data:` host 문서를 열고, 작업마다 새 sandboxed iframe에 캔버스를 띄운다. 캔버스에 스크립트를 넣지 않는다. host 문서의 스크립트(`frameScript`)가 iframe의 사각형을 돌려주고 `capturePage(rect)`로 찍어 `THUMBNAIL_WIDTH`(480)로 줄인다.
- host 문서는 cross-origin인 캔버스 안을 읽을 수 없으므로, 첫 프레임의 위치를 알 방법이 지금은 없다. 바꿀 곳이 여기다.

## PoC (T1, 구조 결정)

후보를 격리된 실제 앱에서 확인한다.

- **A. 캔버스 frame에서 isolated world로 읽기**: main이 썸네일 창의 캔버스 frame(`webFrameMain`)에 `executeJavaScriptInIsolatedWorld`로 첫 최상위 `[data-doan-frame]`의 사각형을 읽는다. 캔버스 스크립트가 DOM을 바꿔 다른 사각형을 돌려줄 수는 있지만, 영향은 그 캔버스 자기 썸네일뿐이다. ARCHITECTURE §3의 "no injection" 규칙을 '읽기 전용 측정 한 번'으로 고쳐야 한다.
- **B. 보드 캔버스의 layout 재사용**: 메인 창이 이미 받은 `layout`의 프레임 사각형을 썸네일 작업에 넘긴다. 메인 창에서 열어 본 적 없는 캔버스에는 값이 없어 대부분의 경우를 덮지 못한다.
- **C. 첫 화면을 크게 찍어 이미지에서 자르기**: 프레임 위치를 모르면 자를 곳도 모른다. 제외.
- 확인할 것: A가 sandboxed cross-origin OOPIF에서 동작하는지(Electron 45), 지연과 실패 처리, 좁은 프레임의 해상도(캡처 배율을 올려 `capturePage`하거나 iframe을 키워 찍기), 캐시 무효화가 프레임 사각형 변화를 잡는지.
- 결과를 이 문서 'PoC 결과'에 적는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `thumbnailRect(frames, viewport)`: 측정한 프레임 목록에서 첫 최상위 프레임의 사각형, 없으면 첫 화면 사각형. 프레임이 키 크면 찍는 높이를 표시 비율에 맞춰 위쪽부터 자를지(찍는 양을 줄임) PoC에서 정한다. 표시 정렬은 위쪽.
- 캡처 배율: 프레임 폭과 `THUMBNAIL_WIDTH`에서 흐려지지 않는 배율.

## postmortem에서 가져온 주의점

- 구현 때 `rg -n -i 'thumbnail' docs/postmortem/`로 썸네일 항목(캐시, 큐, 숨은 창, 실패 처리)을 다시 확인한다.

## 형식, 규약, 결정에 미치는 영향

- ARCHITECTURE §3 'Capture document'의 "with no injection: the thumbnail is the first screen at `doan:width`"를 새 규칙(첫 프레임, 측정 방법)으로 고친다. 썸네일 창의 격리 문장(§3 'Capture window')은 그대로다.
- PRODUCT: 썸네일이 첫 프레임을 보인다는 문장을 더한다(§5 item 1 Overview 또는 'Canvas cards').

## 드래프트

- 그릴 새 화면이 없다(표시 칸은 그대로). `/design-draft`는 건너뛴다. 대신 T4에서 실기 스크린샷으로 확인한다.
