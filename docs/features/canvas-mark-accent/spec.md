# canvas-mark-accent — spec

캔버스 오버레이의 선택·호버 표시, 크기 버블, 점프 하이라이트를 버디 accent로 바꿔 요소 바깥에 그린다. 크기 버블에 선택한 것을 대화 컴포저에 칩으로 넣는 버튼을 더한다. 결정은 모두 2026-11-14 리드 세션에서 사용자가 정했다. `/ship` 하나로 간다.

## 사용자

- **사람**: 캔버스를 보고 고르고 대화하는 사람이다. 표시가 요소 자체의 가장자리를 가리지 않고, 고른 것을 바로 메시지에 넣는다.
- **에이전트**: 바뀌는 것이 없다. 칩은 지금 Pick from canvas가 넣는 것과 같은 앵커로 보낸다(ARCHITECTURE §7). 가이드, CLI 출력, `doan check` 규칙, 스킬 stub은 그대로다.

## 문제

- 선택(1px 검정 실선)과 호버(같은 선의 점선)를 요소 영역 **안쪽** 1px에 그린다. 그래서 요소 자체의 1px 테두리나 가장자리 픽셀을 덮는다. 바깥에는 흰 1px 링(`box-shadow`)이 둘러 있다(`app/src/renderer/styles.css:82-83`, `CanvasController.ts` `place`).
- 점프 하이라이트의 3px 그라디언트 선도 요소 안쪽에 그려서 요소 가장자리 3px를 덮는다(`styles.css:456-457`).
- 표시와 크기 버블이 검정이라 앱의 accent(버디 색)와 따로 논다.
- 선택한 것을 메시지에 넣으려면 Picker로 같은 것을 다시 눌러야 한다. 그러면 선택이 지워진다(PRODUCT §5 item 6).

## 완료 조건

1. 선택 표시는 요소 영역 바깥 1.5px에 `--text-accent` 실선으로 그린다. 호버는 같은 자리의 같은 색 점선이다. 흰 링은 없다. Select와 Picker 모드에서 같다. 1x 화면에서는 Chromium이 1px로 그린다.
2. 크기 버블은 `--affordance-accent` 배경에 `--text-on-accent` 글자다. 높이·글자 역할·위치 규칙은 지금과 같고, 표시선 바깥 가장자리에서 5px 떨어진다(지금은 1px 선 안쪽 기준이라 4px다).
3. 선택이 있으면 크기 버블에 "Add to message" 버튼(lucide `Crosshair`)이 늘 보인다. 순서는 Play, 크기 글자, Add to message이고, Play는 지금처럼 재생할 수 있는 프레임일 때만 있다. Add to message는 늘 버블 끝에 있다.
4. Add to message를 누르면 다음이 일어난다.
   - 선택한 프레임이나 요소가 칩으로 캔버스 대화 컴포저의 커서 자리에 들어간다. 칩은 Pick from canvas가 같은 대상에서 만드는 것과 같다.
   - 접힌 패널은 먼저 펼친다.
   - 포커스는 컴포저로 간다.
   - 선택, 크기 버블, `doan active`는 그대로다.
5. Pick from canvas를 쓸 수 없을 때(캔버스를 보일 수 없음, 컴포저가 입력을 받지 않음, 32곳 한도) Add to message는 `aria-disabled`이고, Pick from canvas와 같은 이유를 툴팁으로 보인다. 버블 모양은 바뀌지 않는다.
6. 점프 하이라이트의 3px 그라디언트 선은 요소 영역 바깥에서 시작한다. 흰 1px 링과 빛 번짐은 선 바깥으로 함께 옮긴다. 작업 중 프레임 표시(`doan work update --frame`)도 같다. 점(12px 원)은 그대로다.
7. 다섯 버디 모두에서 선과 버블 글자가 보인다. 흰 캔버스에서 선은 3:1 이상이고, 버블 글자는 accent 버튼과 같은 대비를 낸다. 흰색·어두운색(#050507)·보라색(#5b21b6) 캔버스에서 측정값을 `docs/DESIGN.md`에 적는다.
8. 초안 `.doan/canvases/canvas-mark-accent.html`과 구현을 `/design-sync`로 맞춘다.

## 하지 않는 것

- 점프 하이라이트 선 두께 변경(3px 그대로), 선택 핸들, 크기 조절.
- 버블 Play의 툴팁. Play는 지금처럼 이름만 있다.
- 흰 링 대신 다른 대비 장치. 버디 색과 비슷한 캔버스에서 선이 덜 보이는 것은 사용자가 받아들였다.
- 점 칩의 Add to message. 선택은 프레임과 요소만 있다.
- 키보드 단축키. 버튼은 Tab으로 닿고 Enter·Space로 누른다.
- 텍스트 범위 표시(`.text-range`)와 프로토타입 창. 바꾸지 않는다.
- `/agent-eval`. 에이전트가 보는 것이 바뀌지 않는다(AGENTS.md 'Workflow'의 조건에 해당하지 않음).
