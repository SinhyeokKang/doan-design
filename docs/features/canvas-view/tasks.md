# canvas-view — tasks

순서: PoC → 순수 함수 → 셸(I/O) → UI → e2e → 승격. `── commit ──`은 커밋 경계다.

## 0. PoC 1 · PoC 3 (게이트)

- `.scratch/`에서 Electron 45 최소 앱으로 design.md 'PoC 의존'의 항목을 확인한다: 주입 방식(Q1), 높이 측정 규칙, 휠·핀치 전달(Q3), 클릭 선택·하이라이트, 줌·팬·리로드 중 표식 위치.
- 결과를 PRODUCT §6에 날짜 · 버전과 함께 기록한다. 높이 측정 규칙처럼 실험으로 정한 값은 이 design.md에도 반영한다.
- 검증: PRODUCT §6에 PoC 1 · PoC 3 결과 줄이 있다. 실패하면 여기서 멈추고 사용자에게 렌더링 구조 재결정을 요청한다.

── commit (`docs(product): record PoC 1 and 3 results`) ──

## 1. 뷰포트 계산

- `app/src/renderer/viewport.ts`: `zoomAt` · `panBy` · `fitWidth` · `fitRect` · `boardToScreen` · `screenToBoard` · `wheelAction`과 상수.
- 경계 사례: 배율 상·하한에서의 `zoomAt`, 뷰포트보다 큰 프레임과 작은 프레임, 폭 0 뷰포트, `deltaMode` 1·2, `zoomAt` 뒤 기준점이 같은 보드 좌표를 가리키는지.
- 검증: `npm --prefix app test` 통과, `npm --prefix app run typecheck` 통과.

## 2. 메시지 검증

- `app/src/renderer/canvasMessage.ts`: `parseCanvasMessage`.
- 경계 사례: `NaN` · `Infinity` · 음수 높이, 빈 `id`, 문자열이 아닌 `title`, 너무 긴 프레임 배열, 알 수 없는 `type`, `null` · 배열 · 원시값.
- 검증: `npm --prefix app test` 통과.

## 3. main 쪽 순수 판단

- `app/src/main/view.ts` `canvasRows`에 `width` 추가(양의 안전 정수만). `app/src/main/canvasFrame.ts`: `isCanvasFrame` · `allowFrameNavigation`.
- 경계 사례: 다른 포트 · 다른 토큰 · `localhost` 호스트 · 토큰 경로 접두어만 같은 URL(`/t/<token>x/`), 손자 프레임.
- 검증: `npm --prefix app test` 통과.

── commit (`feat(app): canvas view pure helpers`) ──

## 4. 서빙 경로 감시와 변경 구분

- `watch.ts`: `doan ls` `scope` 중 `design`이 아닌 항목을 감시에 더한다(디렉터리는 재귀, 파일은 부모 디렉터리 비재귀 + 이름 필터). 다시 읽을 때 scope가 바뀌면 감시 대상을 맞춘다. 콜백은 디바운스 구간 안에 서빙 파일 변경이 있었는지, `doan ls`를 다시 돌려야 하는지(`design/` · `.doan/`)를 알린다.
- `shell.ts`: 서빙 파일 변경 시 폴더의 `servedRev`를 올려 `FolderEntry`에 싣는다. `tokenCss` · `serve`만 바뀌었으면 `doan ls`는 다시 돌리지 않는다.
- 경계 사례: 원자적 저장(임시 파일 쓰고 rename)한 `tokenCss`, 아직 없는 `serve` 경로가 나중에 생김, scope에서 빠진 경로의 감시 해제, `.doan/` 변경만(리로드 없음), `design/`와 `serve` 동시 변경(한 번만 올림).
- 검증: `npm --prefix app test` 통과(`watch.test.ts` · `shell.test.ts`에 위 사례 추가).

## 5. main 셸

- `index.ts`: 세션 권한 요청 · 확인 deny-all, IPC `senderFrame` 확인, 캔버스 프레임 탐색 제한(`will-frame-navigate`), 주입(Q1 방식, PoC 1 결과에 따름).
- 주입 스크립트 원본 위치와 빌드 방법은 PoC 1 결과로 정한다.
- `electron.vite.config.ts`: CSP에 `frame-src http://127.0.0.1:*`.
- 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공. 동작 확인은 task 7.

── commit (`feat(app): load canvases in a sandboxed iframe`) ──

## 6. 렌더러 UI

- 사이드바 + 캔버스 뷰 + 툴바(Q5), 캔버스 선택, iframe 생성, 메시지 수신(`event.source` 확인 + `parseCanvasMessage`), 줌·팬·맞춤·단축키, 프레임 목록과 점프, `servedRev` 변경 시 리로드, `width` 누락 안내, 열린 캔버스가 사라졌을 때 안내.
- 텍스트는 `textContent`로만 넣는다(프레임 제목은 에이전트가 쓴 값).
- 검증: `npm --prefix app run typecheck` 통과. 동작 확인은 task 7.

## 7. e2e 확장

- `app/e2e/runtime.ts`에 추가: 캔버스 열기 → iframe 폭이 `doan:width`와 같다 → 높이가 콘텐츠 높이와 같다 → 맞춤 배율 확인 → 프레임 클릭 시 transform 변경과 프레임이 뷰포트 안에 있음 → 캔버스 파일 수정 시 리로드되고 배율 유지 → `tokenCss` 수정(원자적 저장) 시 리로드 → 코멘트 파일만 바뀌면 리로드 없음 → `doan:width` 없는 캔버스는 안내 표시 → iframe 안 링크 클릭이 토큰 경로 밖으로 나가지 않음 → iframe 안 권한 요청(예: `navigator.mediaDevices.getUserMedia`) 거부 → 스크린샷 `3-canvas.png`.
- 보안 단계 각각에 대해, 해당 코드를 잠시 지우면 그 단계가 실패하는지 한 번 확인하고 결과를 커밋 메시지나 리뷰에 남긴다(POSTMORTEM).
- 검증: `npm --prefix app run e2e`가 `runtime-test: PASS`, exit 0. `/runtime-test` 스킬로 실행하고 스크린샷을 열어 본다.

── commit (`feat(app): canvas view UI with zoom, pan and frame jumps`) ──

## 8. 문서 정리

- `docs/DIRECTORY.md`: 새 파일(`viewport.ts`, `canvasMessage.ts`, `canvasFrame.ts`, 주입 스크립트) 반영.
- `.agents/skills/runtime-test/SKILL.md`: 'Steps'의 e2e 단계 목록에 캔버스 뷰를 추가.
- 검증: 두 문서에 새 파일과 단계가 있다.

── commit (`docs: directory and runtime-test for canvas view`) ──

## 9. 승격과 정리

- PRODUCT.md(영문): §5 #5 완료 반영, §7 결정 로그에 Q1–Q5 결정과 근거(Q1 주입 방식, Q2 DOM 프레임 목록, Q3 휠 전달, Q4 서빙 경로 감시, Q5 사이드바 배치), PoC 1로 정한 높이 측정 규칙. §5 Dogfooding에 따라 다음 단계가 `/design-sync`임을 확인.
- ARCHITECTURE.md(영문): §3에 주입 방법 · 메시지 · 높이 규칙 · 줌 범위 · 탐색 제한 · 권한 deny-all, §7 IPC `senderFrame`과 CSP, §13 감시 대상에 `design/` 밖 서빙 경로 추가(기존 'not watched' 문장 교체), 감시 콜백의 변경 구분과 리로드 규칙.
- `docs/features/canvas-view/` 삭제.
- 검증: `docs/features/canvas-view/`가 없고, 위 결정이 PRODUCT §7과 ARCHITECTURE에 날짜와 함께 있다.

── commit (`docs(product)`, `docs(architecture)`, `docs(feature)` 문서별로 나눠서) ──
