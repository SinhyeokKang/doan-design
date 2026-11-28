# 텍스트 드래그 가장자리 이동 — tasks

순서: PoC → 순수 함수 → 앱 루프 → viewer → 실기 확인 → 승격. `[commit]`은 커밋 경계다. `/agent-eval`은 필요 없다(guide, CLI 출력, `doan check`, 스킬 stub이 바뀌지 않는다).

## T1. PoC

- design.md 'PoC'의 항목을 `.scratch/canvas-text-edge-pan/`의 probe로 격리된 실제 앱에서 확인한다.
- 검증: 항목마다 결과(관찰, 측정값)가 `.scratch/`에 있고, 고른 포인터 위치 출처와 이유가 design.md 'PoC 결과'에 적혀 있다. 실행은 `.scratch/`의 일회성 probe(`node .scratch/canvas-text-edge-pan/probe.mjs`)와 네이티브 마우스 구간이다.
- `[commit]` design.md

## T2. 순수 함수

- `edgePanVelocity`, `clampToArea`, `edgePanStep`(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 경우: 영역 안(0), 변의 마지막 px(포함), 소수 좌표, `null` 포인터, 네 변 각각, 네 모서리, 넘은 거리와 줌(0.25·1·4)에 상관없는 같은 화면 속도, 창 밖, 범위의 프레임 끝이 영역 안이면 그 축 0, 부호 규약, 프레임 간격 0(첫 프레임)·8·16·33 ms와 큰 간격의 상한, 영역 폭 0, `clampToArea`.
- `[commit]` `test:` → `feat:`

## T3. 앱 루프

- `CanvasController.ts`: 텍스트 드래그 중 루프, `panBy`와 `applyView`, 단계마다 `text-point`, 모든 종료 경로에서 멈춤.
- 검증:
  - `CanvasController.test.ts`: 변에 닿은 포인터가 움직이지 않아도 view가 계속 바뀌고 `text-point`(영역 변으로 자른 점)가 나간다. 가장자리에서 떨어지거나 범위의 프레임 끝에 닿으면 멈춘다. 놓기, Esc, Select와 Hand의 blur(⌘Tab: 드래그 끝, 범위 남음), reload, 캔버스 전환, pick·Capture area 시작, 모달·메뉴 열림, 앱 문서가 `buttons=0` 이벤트를 받음, `dispose`에서 루프가 멈춘다. `pointer()`가 `null`이거나 reject될 때 움직이지 않는다. invoke가 한 번에 하나만 나간다. Hand는 `pointer()`를 부르지 않고 창 밖(음수 좌표)에서도 동작한다. 신뢰 확인(`textCheck`)이 끝나기 전에는 움직이지 않는다. 이동 중 휠이 합쳐진다. 텍스트 드래그가 아닐 때는 버튼을 누른 채 변에 닿아도 돌지 않는다: 4 px 문턱 전의 누르기, 텍스트가 아닌 누르기, Hand 팬, Space, Capture area. 이동 중 프레임마다 React render가 없다(현재 프레임이 바뀔 때처럼 지금 팬과 같은 경우만).
  - `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 내보낸 viewer

- viewer의 텍스트 드래그에 같은 이동(frame이 보낸 좌표, 스크롤 끝에서 멈춤)을 더하고 `node app/scripts/viewerInspect.mjs`로 다시 만든다.
- 검증: `node app/scripts/viewerInspect.mjs --check`가 통과하고, `app/src/main/exportViewer.test.ts`의 실제 DOM fixture에 가장자리 이동 경우를 더한다. `npm --prefix app test`와 `go test ./...`가 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 실기 확인

- `/runtime-test`: 격리된 실제 앱에서 Select와 Hand 텍스트 드래그로 네 변과 모서리, 창 밖 포인터, 텍스트가 아닌 누르기로 변에 닿았을 때 움직이지 않음, 멈춤, 놓은 뒤 범위와 ⌘C, Esc, ⌘Tab. 네이티브 마우스 끌기가 필요한 구간은 짧게 하고 포커스를 가져간 단계를 보고에 적는다.
- 검증: 항목마다 스크린샷이나 관측값이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
- `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## T6. 승격과 정리

- PRODUCT: §5 item 4 'Canvas text'의 "no edge auto-scroll"을 가장자리 이동 규칙으로 바꾼다.
- ARCHITECTURE: design.md '형식, 규약, 결정에 미치는 영향'의 항목을 적는다.
- BACKLOG: T5에서 확인하지 못한 항목을 더하고, 화면 밖 iframe의 하이라이트 항목과 viewer 텍스트 드래그 항목을 고쳐 쓴다.
- `docs/features/canvas-text-edge-pan/`를 지운다.
- 검증: PRODUCT에 "no edge auto-scroll"이 없고 새 규칙이 있다. 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-text-edge-pan after promotion`
