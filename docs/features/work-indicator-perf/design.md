# 작업 표시 렌더링 부하 줄이기 설계

## 영향 범위

앱(renderer)만 바뀐다. CLI, 스킬, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지), JSON Schema, 캔버스 관례, `doan check` 규칙은 바뀌지 않는다.

- `app/src/renderer/styles.css`: `.mark.jump-highlight.working`과 그 `::before`, `@keyframes doan-work-glow`·`doan-work-travel`, 그 reduced motion·reduced transparency·forced colours 규칙.
- `app/src/renderer/CanvasController.ts`의 `drawWork()`: 그라디언트 레이어를 담을 자식 요소를 만든다.
- 점 필드: 루프와 그리기는 `app/src/renderer/agentIndicator.ts`(`DotFieldLoop`, `drawDotField`, `DOT_FIELD`, 테스트 `agentIndicator.test.ts`), 계산은 `app/src/renderer/dotField.ts`, 마운트는 `CanvasAgent.tsx`다.
- 대화 패널 스트리밍 반영: `app/src/renderer/conversationStore.ts`와 스레드 렌더(`ConversationThread.tsx`).
- 측정 probe는 `.scratch/work-indicator-perf/`에 두고 `app/runtime/` 격리·정리 지원을 쓴다.

## 결정 경계

PRODUCT §5 'Agent indicator'의 동작과 DESIGN.md의 측정값이 기준이다. 기준 행은 'Canvas area and right panel' › 'Measured contracts'의 'Agent glow and dots', 'Work updates on the canvas' › 'Measured contracts'의 'Working-frame marker'·'Marker slide'다. 이 기능은 그리는 방식만 바꾼다. ARCHITECTURE의 구조 결정(sandbox iframe, 보드 바깥 확대·이동, 새 src마다 새 iframe, CSP `default-src 'self'`)은 건드리지 않는다. 마커는 계속 보드 바깥 overlay에 있고 화면 px로 배치된다.

## PoC (먼저, 기준선)

PoC는 진행 여부를 가르지 않는다. 바꾸기 전 기준선, 요소별 우선순위, 그라디언트 위험을 남긴다. 모든 수단은 시각적 drift가 없어야 들어간다(spec '접근').

1. 링크 1 병합 뒤 develop을 빌드한다(`npm --prefix app run build`). 격리 앱에서 캔버스를 열고 `doan work start`/`update`로 작업 턴을 만든다. 마커, 보드 글로우, 점 필드, 알림을 켜고, 대화 패널 스트리밍은 main 핸들러 대체로 흉내 낸다(`.scratch/flicker/probe3.mts` 방식).
2. 측정은 Electron `contentTracing`(모든 프로세스)과 `app.getAppMetrics()`(렌더러 CPU)로 한다. 프레임당 메인 스레드의 스크립트·스타일·레이아웃·paint 시간, 누락·지연 프레임, GPU 프로세스 프레임 기록, 합성 레이어 수와 GPU 메모리를 뽑는다. 기존 기준값(DESIGN 'Agent glow and dots'의 rAF p95 17.6ms)도 함께 비교한다.
3. 조건은 부하 없음과 고부하 두 가지다. 고부하는 probe가 코어 수의 2배만큼 `yes > /dev/null`을 띄워 만든다(사용자 확인). probe는 자기가 띄운 PID만 기록하고, `finally`와 signal 처리로 그 PID만 종료한다. `pkill`은 쓰지 않는다. 고부하에서 probe의 대기 시간은 POSTMORTEM 2026-10-30 'Timing tests failed under machine load'를 따른다.
4. 요소를 하나씩 끈 변형으로 비용을 나눈다: 마커 애니메이션, 점 필드(partition, 먼 점 fill, 가까운 점 fill을 `performance.mark`로 따로), 보드 글로우, 블러, GIF, 대화 패널 스트리밍. 조건·변형마다 10초씩 3회 이상 반복하고 중앙값과 범위를 남긴다. 결과 표에 머신, load average, DPR, 창 크기, 커밋을 적는다.
5. 고부하 10초 녹화에서 고정 영역(입력창 테두리, 큐 행, 마커 테두리)의 빠진 프레임을 스크립트로 센다. 재현되지 않아도 진행한다(사용자 결정).
6. 화면 비교 baseline을 `.scratch/work-indicator-perf/baseline/`에 저장한다. 애니메이션은 `document.getAnimations()`로 같은 `currentTime`에 멈추고(글로우 0·0.6·1.2·1.8초, 그라디언트 0·1.2·2.4·3.6초), 점 필드는 같은 `elapsed`를 넣어 찍는다. 상태 목록은 spec 완료 조건 4와 같다.
7. 그라디언트 위험을 시제품으로 잰다: 최대 확대에서 레이어 크기와 GPU 메모리, 220ms 슬라이드와 확대·이동 중 paint, 마스크 안 transform이 마스크를 다시 래스터하는지.

결과를 사용자에게 보여주고 순서를 공유한다. 진행을 위한 사용자 결정은 없다.

## 바꾸는 방식

- **점 필드**: 메인 스레드에서 묶기를 먼저 한다(사용자 결정). 가까운 점을 8-bit 알파 단계별로 묶어 단계마다 한 path로 `fill`한다. fill 호출이 수천 번에서 수십 번으로 준다. 점의 크기·알파 계산(`dotScale`, `partitionDots`)은 그대로다. 묶은 뒤 Worker로도 옮긴다(가능한 모든 수단). 묶기는 Worker 안에서도 fill 비용을 줄인다.
  - Worker로 옮길 때: `drawDotField`와 `DOT_FIELD`를 `dotField.ts`로 옮기고, Worker는 `dotField.ts`만 import한다. `agentIndicator.ts`는 다른 모듈을 값으로 import하므로 Worker 번들에 넣지 않는다. `OffscreenCanvasRenderingContext2D`를 기존 `DotContext` 자리에 넘긴다. 메인 그리기 경로는 남기지 않는다.
  - 빌드 산출물(`file://`, CSP `default-src 'self'`)에서 `new Worker(new URL(...), { type: "module" })` 청크가 뜨고 CSP 위반이 없는지 확인한다. dev(http)에서 통과한 것은 근거가 아니다(POSTMORTEM 2026-10-30 'renderer import blank window'). `rendererImports.test.ts`가 Worker 진입점의 import도 검사하게 넓힌다.
  - vitest에는 Worker와 `transferControlToOffscreen`이 없으므로 루프 생성을 주입해 테스트한다.
  - 메인이 쓰던 값을 메시지로 보낸다: 크기와 DPR(`transferControlToOffscreen` 뒤 메인은 `width`를 바꿀 수 없다), 색(테마 전환 포함), 창·문서 숨김, reduced motion 변경, 언마운트 시 종료.
- **작업 마커 글로우**: 1px `--surface-panel` 링을 `outline: 1px solid var(--surface-panel)`로 옮긴다. 글로우는 마커 안 레이어에 고정 45% 그림자를 두고 `opacity` 1↔0.556(25/45)을 같은 곡선(`--ease-state`, 2.4초)으로 바꾼다. 링을 outline으로 옮기는 이유: 글로우 레이어를 분리하면 같은 쌓임 맥락에서 글로우가 링을 덮는다. 반지름 1px에서 outline과 spread 그림자의 모서리가 같은지는 픽셀 비교로 확인한다.
- **작업 마커 그라디언트**: `::before`는 자식을 가질 수 없으므로 `drawWork()`가 마스크한 링 컨테이너와 그 안의 2W×2H 그라디언트 레이어를 만든다. 135° 그라디언트에서 position 0→100%는 `translate(-50%, -50%)`와 같은 한 주기라 같은 픽셀을 낼 수 있다. 큰 확대에서 타일이 늦게 그려지거나 선이 흐려지면 drift이므로, 그때는 레이어 크기를 화면에 보이는 영역으로 자르는 방법을 쓰고, 그래도 drift가 남으면 그라디언트는 그대로 둔다.
- **대화 패널 스트리밍**: delta 반영을 프레임당 한 번으로 묶는다(사용자 결정: 대화 패널 수정은 이 기능에 포함). 마지막 delta와 턴 종료는 지연 없이 반영한다. 보이는 글자는 같고 최대 한 프레임 늦게 나타난다.
- **보드 글로우**: 이미 `opacity` 애니메이션이다. 큰 inset 그림자가 opacity 변화마다 다시 래스터되지 않도록 자기 합성 레이어에 둔다. 픽셀이 같아야 한다.
- **다시 그리기 격리**: 작업 overlay, 알림 열, 대화 패널, 스레드에 `contain: layout paint`(필요하면 `content-visibility: auto`를 화면 밖 스레드 항목에)를 둬서 한쪽의 갱신이 다른 쪽을 다시 그리게 하지 않는다. 잘림, 그림자, 포커스 링, 팝오버 위치가 바뀌면 drift이므로 그 요소에서는 뺀다.
- **블러**: 블러 자체는 바꾸지 않는다(drift). 위 격리로 블러가 다시 계산되는 범위만 줄인다.

### 상태 규칙 옮기기

새 레이어마다 기존 규칙을 옮긴다.

- `.still`과 reduced motion: 애니메이션을 끄고 opacity 1(=45%), transform 0으로 둔다. 지금 `animation: none`일 때의 45% 그림자, 0% 위치와 같다.
- reduced transparency: 글로우 레이어를 숨기고 1px 링만 남긴다.
- forced colours: 링 컨테이너와 그라디언트 레이어를 숨긴다(지금은 `::before`만 숨긴다).
- 캡처 스냅샷(`[data-capture-snapshot]`) 규칙이 새 레이어도 가린다.
- 같은 클래스를 쓰는 일반 점프 하이라이트(1.2초 페이드, 점 모양)는 바꾸지 않는다. 새 구조는 `.working`에만 적용한다.

합성 레이어는 작업 중인 요소에만 둔다. `will-change`를 넓게 붙이지 않고, 작업이 끝나면 레이어를 없앤다. 레이어를 늘리면 GPU·래스터 쪽 기아를 키울 수 있으므로, 바꾼 뒤 레이어 수와 GPU 메모리를 PoC 기준선과 비교한다.

## 순수 함수 (/tdd 대상)

- 점 필드 알파 단계 묶기: 가까운 점 목록과 반경·크기·알파 설정에서 알파 단계별 점 묶음을 내는 함수. 기존 `dotScale`·`partitionDots` 값과 같은 크기·알파를 낸다. `dotField.ts`에 둔다.
- 스트리밍 프레임 묶기: delta 도착 순서와 프레임 경계에서 프레임마다 반영할 누적 텍스트를 내는 함수. 마지막 delta와 턴 종료는 즉시 반영한다.
- 마커 글로우 opacity 범위(25/45)는 CSS 상수로 끝나면 함수로 만들지 않는다.

## 회귀 예방 근거

- POSTMORTEM 2026-11-07 streaming caret: 스트리밍 반영을 바꾸므로 캐럿 위치를 다시 측정한다.
- POSTMORTEM 2026-10-22 linked 100vh, 2026-10-26 off-screen reload: 마커 구조를 바꾸므로 이전 viewport 측정이 새 레이아웃을 덮지 않는지, iframe 상단이 화면 밖일 때 재로드를 확인한다.
- POSTMORTEM 2026-10-30 renderer import blank window: Worker를 쓰면 빌드 산출물에서 확인한다.
- DESIGN 'Marker slide': 작업 프레임이 바뀔 때만 220ms 슬라이드하고 확대·이동에는 지연 없이 붙는다.
- 링크 1의 재로드 수정: 재로드 중 마커가 숨지 않는다. 링크 1 병합 뒤 그 회귀 테스트 이름을 tasks 3에 적는다.

## 시작 시점

chain-261111 링크 1(`frame-first-selection`)이 병합된 뒤 develop에서 시작한다. 그 링크가 `CanvasController.ts`의 `drawWork()`를 고치기 때문이다. 링크 2(`canvas-activity-notices`)와 겹치는 파일(대화 패널, `CanvasAgent.tsx`)은 시작할 때 다시 확인한다.
