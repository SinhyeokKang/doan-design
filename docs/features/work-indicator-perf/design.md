# 작업 표시 렌더링 부하 줄이기 설계

## 영향 범위

앱(renderer)만 바뀐다. CLI, 스킬, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 소켓 메시지), JSON Schema, 캔버스 관례, `doan check` 규칙은 바뀌지 않는다.

- `app/src/renderer/styles.css`: `.mark.jump-highlight.working`과 그 `::before`, `@keyframes doan-work-glow`·`doan-work-travel`, `.doan-agent-glow`, `.doan-agent`.
- `app/src/renderer/CanvasController.ts`: 작업 마커 요소를 만드는 `drawWork()`. 합성 레이어용 자식 요소가 필요할 때만 바꾼다.
- `app/src/renderer/CanvasAgent.tsx`의 점 필드 루프와 `app/src/renderer/dotField.ts`.
- 측정 probe는 `.scratch/work-indicator-perf/`에 두고 `app/runtime/` 격리·정리 지원을 쓴다.

## 결정 경계

PRODUCT §5 'Agent indicator'의 동작과 DESIGN.md의 측정값이 기준이다. 이 기능은 그리는 방식만 바꾼다. ARCHITECTURE의 구조 결정(sandbox iframe, 보드 바깥 확대·이동, 새 src마다 새 iframe)은 건드리지 않는다. 마커는 계속 보드 바깥 overlay에 있고 화면 px로 배치된다.

## PoC (먼저)

가정: 작업 표시의 매 프레임 메인 스레드 그리기가 고부하에서 프레임 누락을 일으킨다. 아직 측정하지 않았다.

1. 격리 앱에서 캔버스를 열고 `doan work start`/`update`로 작업 턴을 만든다. 마커, 보드 글로우, 점 필드, 알림을 켠다. 대화 패널 스트리밍은 main 핸들러 대체로 흉내 낸다(이전 조사 `.scratch/flicker/probe3.mts` 방식).
2. Playwright `_electron`과 CDP Tracing으로 10초씩 기록한다. 조건은 부하 없음과, 코어 수만큼 `yes > /dev/null`을 띄운 CPU 부하 두 가지다(사용자 확인). 프레임당 메인 스레드의 스크립트·스타일·레이아웃·paint 시간, 누락·지연 프레임, 렌더러 CPU를 뽑는다.
3. 요소를 하나씩 끈 변형(마커 애니메이션, 점 필드, 보드 글로우, 블러, GIF, 대화 패널 스트리밍)으로 같은 측정을 반복해 요소별 비용을 구한다.
4. 고부하에서 녹화해 실제 앱 녹화와 같은 레이어 누락이 재현되는지 본다. 재현되지 않으면 그 사실과 조건을 기록한다.

결과를 사용자에게 보여주고 바꿀 요소와 순서를 확인받는다. 비용이 작은 요소는 바꾸지 않는다.

## 바꾸는 방식 (후보, PoC 결과로 확정)

- **마커 글로우**: 그림자 밝기 45%↔25%를 고정된 그림자 레이어의 `opacity`로 낸다. 같은 곡선(`--ease-state`, 2.4초)을 쓴다.
- **마커 그라디언트**: 테두리 모양으로 자른 영역 안에서 2배 크기 그라디언트 레이어를 `transform`으로 옮긴다. 대각선 방향과 4.8초 주기는 그대로다.
- **점 필드**: 화면을 바꾸지 않는 방법을 먼저 쓴다. 그리기를 `OffscreenCanvas`와 Worker로 옮겨 메인 스레드에서 뺀다. 점의 크기·알파 계산(`dotField.ts`)은 그대로 쓴다. 이 방법으로 부족할 때만 두 레이어와 이동하는 마스크처럼 화면이 달라지는 방법을 사용자에게 묻는다.
- **보드 글로우**: 이미 `opacity` 애니메이션이다. PoC가 큰 inset 그림자의 비용을 측정했을 때만 미리 그린 레이어로 바꾼다.
- **블러**: 비목표. PoC 결과로 사용자가 정한다.
- **대화 패널 스트리밍**: PoC에서 비용만 잰다. 크면 2번 확인 때 delta 반영을 프레임당 한 번으로 묶는 작업을 추가하고, 작으면 손대지 않는다.
- 합성 레이어는 작업 중인 요소에만 둔다. `will-change`를 넓게 붙이지 않고, 작업이 끝나면 레이어를 없앤다. GPU 메모리를 늘리는 레이어 남용을 피하기 위해서다.

## 순수 함수 (/tdd 대상)

- 점 필드 프레임 계산: 시간·크기·설정에서 spot 위치와 점별 크기·알파 목록을 내는 함수. 지금 `autoCursor`, `opposingCursor`, `partitionDots`, `dotScale`이 있다. Worker로 옮길 때 메인과 Worker가 같은 함수를 쓰도록, 한 프레임의 그리기 명령을 만드는 순수 함수(`dotFrame(elapsed, size, config)`)로 묶는다. 기존 `dotField.test.ts`의 값을 그대로 지킨다.
- 마커 애니메이션 값: 글로우 opacity 범위(25/45 알파 비)와 그라디언트 이동 거리를 마커 크기에서 계산하는 함수. CSS만으로 끝나면 만들지 않는다.

## 회귀 예방 근거

- POSTMORTEM 2026-11-07 streaming caret: 스트리밍 중 캐럿 위치 문제다. 대화 패널을 건드리면 같은 측정을 다시 한다.
- POSTMORTEM 2026-10-22 linked 100vh와 2026-10-26 off-screen reload: 마커 배치를 바꾸면 이전 viewport 측정이 새 레이아웃을 덮지 않는지, iframe 상단이 화면 밖일 때 재로드를 확인한다.
- DESIGN.md 'Working-frame marker'와 'Marker slide': 프레임이 바뀔 때만 220ms 슬라이드하고, 확대·이동에는 지연 없이 붙는다. 레이어 분리 뒤에도 같은 측정을 한다.
- 링크 1 B2: 재로드 중 마커가 숨지 않는다. 레이어를 바꿔도 이 회귀 테스트가 통과해야 한다.

## 시작 시점

체인 링크 1(`frame-first-selection`)이 병합된 뒤 develop에서 시작한다. 그 링크가 `CanvasController.ts`의 `drawWork()`를 고치기 때문이다. 링크 2(`canvas-activity-notices`)와 겹치는 파일은 시작할 때 다시 확인한다.
