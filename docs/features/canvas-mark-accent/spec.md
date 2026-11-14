# canvas-mark-accent — spec

캔버스 오버레이의 선택·호버 표시, 크기 버블, 점프 하이라이트를 버디 accent로 바꿔 요소 바깥에 그린다. 크기 버블에 선택한 것을 대화 컴포저에 칩으로 넣는 버튼을 더한다. 결정은 모두 2026-11-14 리드 세션에서 사용자가 정했다. 체인 `chain-261114-2`의 링크 4로 `/orchestrate`가 돈다.

## 사용자

- **사람**: 캔버스를 보고 고르고 대화하는 사람이다. 표시가 요소 자체의 가장자리를 가리지 않고, 고른 것을 바로 메시지에 넣는다.
- **에이전트**: 바뀌는 것이 없다. 칩은 지금 Pick from canvas가 넣는 것과 같은 앵커로 보낸다(ARCHITECTURE §7). 가이드, CLI 출력, `doan check` 규칙, 스킬 stub은 그대로다.

## 문제

- 선택(1px 검정 실선)과 호버(같은 선의 점선)를 요소 영역 **안쪽** 1px에 그린다. 그래서 요소 자체의 1px 테두리나 가장자리 픽셀을 덮는다. 바깥에는 흰 1px 링(`box-shadow`)이 둘러 있다(`app/src/renderer/styles.css:82-83`).
- 점프 하이라이트의 3px 그라디언트 선도 요소 안쪽에 그려서 요소 가장자리 3px를 덮는다(`styles.css:456-457`).
- 표시와 크기 버블이 검정이라 앱의 accent(버디 색)와 따로 논다.
- 선택한 것을 메시지에 넣으려면 Picker로 같은 것을 다시 눌러야 한다. 그러면 선택이 지워진다(PRODUCT §5 item 6).

## 완료 조건

1. 선택 표시는 요소 영역 바깥 1.5px에 `--text-accent` 실선으로 그린다. 호버는 같은 자리의 같은 색 점선이고, Picker 모드의 호버도 같다. 흰 링은 없다. 캔버스 배율과 관계없이 화면에서 1.5px이다. 1x 화면에서는 Chromium이 1px로 그린다.
2. 크기 버블은 `--affordance-accent` 배경에 `--text-on-accent` 글자다. 높이·글자 역할·위치 규칙은 지금과 같고, 표시선 바깥 가장자리에서 5px 떨어진다(지금은 1px 선 바깥 4px다).
3. 선택이 있으면 크기 버블에 "Add to message" 버튼(lucide `Crosshair`)이 늘 보인다. 순서는 Play, 크기 글자, Add to message이고, Play는 지금처럼 재생할 수 있는 프레임일 때만 있다. Add to message는 늘 버블 끝에 있다.
4. Add to message를 누르면 다음이 일어난다.
   - 선택한 프레임이나 프레임 안 요소가 칩으로 캔버스 대화 컴포저의 커서 자리에 들어간다. 칩은 Pick from canvas가 같은 대상에서 만드는 것과 같다.
   - 접힌 패널은 먼저 펼친다.
   - 포커스는 컴포저로 간다.
   - 선택, 크기 버블, `doan active`는 그대로다.
5. 다음 경우 Add to message는 `aria-disabled`이고, 이유를 툴팁과 접근성 설명으로 보인다. 버블 크기와 배치는 그대로이고, 버튼 잉크만 `--text-on-accent` 45 % 혼합으로 흐려진다.
   - Capture area 모드: "Finish or cancel the capture first."
   - 프레임 밖 요소(노트) 선택: "Only frames and what's in them can go in a message."
   - Pick from canvas를 쓸 수 없을 때(컴포저가 입력을 받지 않음, 32곳 한도, 캔버스를 보일 수 없음): 컴포저 쪽 이유는 Pick과 같은 문구다. 캔버스 쪽 이유는 "Add to message isn't available while the canvas can't be shown."이고, 목록에 없는 캔버스면 그 안내 문구다.
6. 포커스:
   - 버블이 사라질 때 Add to message에 있던 포커스는 툴바 Picker로 간다. 버블 Play에 있던 포커스는 지금처럼 툴바 Play로 간다.
   - Play만 사라지면 Play에 있던 포커스는 같은 버블의 Add to message로 간다.
   - reload 뒤 같은 선택을 다시 찾으면 포커스가 같은 버튼으로 돌아온다.
   - 어떤 경우에도 포커스가 페이지 body로 떨어지지 않는다.
   - 버블 버튼에서 누른 Esc는 툴팁이 열려 있어도 선택을 한 단계 올린다.
7. 점프 하이라이트의 3px 그라디언트 선은 요소 영역 바깥에서 시작한다. 흰 1px 링과 빛 번짐은 선 바깥으로 함께 옮긴다. 작업 중 프레임 표시(`doan work update --frame`)도 같다. 점(12px 원)은 그대로다.
8. 다섯 버디의 `--text-accent` 대 흰색 대비가 3:1 이상이다. 다섯 버디의 버블 글자 대비와, 흰색·#050507·#5b21b6 캔버스에서 잰 선택 선과 점프 하이라이트 대비를 `docs/DESIGN.md`에 적는다. 3:1 미만도 기록만 한다. 포포·도리의 버블 글자(4.5:1 미만)는 'Intended exceptions'에 적는다.
9. 초안 `.doan/canvases/canvas-mark-accent.html`과 구현을 `/design-sync`로 맞춘다.

## 하지 않는 것

- 점프 하이라이트 선 두께 변경(3px 그대로), 선택 핸들, 크기 조절.
- 버블 Play의 툴팁. Play는 지금처럼 이름만 있다.
- 흰 링 대신 다른 대비 장치. 버디 색과 비슷한 캔버스에서 선이 덜 보이는 것은 사용자가 받아들였다.
- 노트 칩. 노트 선택에서 Add to message는 비활성이다. Pick도 프레임 밖을 칩으로 만들지 않는다.
- 키보드 단축키와 메뉴 항목. 버튼은 Tab으로 닿고 Enter·Space로 누른다. 나중에 Edit 메뉴 항목을 붙일 수 있게 넣기 동작은 App 함수 하나로 둔다.
- Tab 순서와 화면 밖 버블의 포커스. 지금 Play와 같게 둔다.
- 텍스트 범위 표시(`.text-range`)와 프로토타입 창. 바꾸지 않는다.
- `/agent-eval`. 에이전트가 보는 것이 바뀌지 않는다(AGENTS.md 'Workflow'의 조건에 해당하지 않음).
