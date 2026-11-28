# 텍스트 드래그 가장자리 이동 — tasks

순서: PoC → 순수 함수 → 앱 루프 → (viewer) → 실기 확인 → 승격. `[commit]`은 커밋 경계다.

## T1. PoC

- design.md 'PoC'의 항목을 `.scratch/canvas-text-edge-pan/`의 probe로 격리된 실제 앱에서 확인한다.
- 검증: 항목마다 결과(관찰, 측정값)가 `.scratch/`에 있고, 고른 포인터 위치 출처와 이유가 design.md 'PoC 결과'에 적혀 있다. 실행 명령은 일회성 probe(`node .scratch/canvas-text-edge-pan/probe.mjs`)이며 AGENTS.md 'Commands'에는 없다 — 명령 이름은 사용자 확인이 필요하다.
- `[commit]` design.md

## T2. 순수 함수

- `edgePanVelocity`, `edgePanStep`, 루프 판정(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 경우: 영역 안(0), 변에 딱 닿음, 네 변 각각, 네 모서리, 변을 넘은 거리와 상관없는 같은 속도, 창 밖, 프레임 간격 8 ms·16 ms·33 ms에서 같은 초당 이동, 영역 폭이 0인 경우.
- `[commit]` `test:` → `feat:`

## T3. 앱 루프

- `CanvasController.ts`: 텍스트 드래그 중 루프, `panBy`와 `applyView`, 단계마다 `text-point`, 모든 종료 경로에서 멈춤.
- 검증:
  - `CanvasController.test.ts`: 변에 닿은 포인터가 움직이지 않아도 view가 계속 바뀌고 `text-point`가 나간다. 가장자리에서 떨어지면 멈춘다. 놓기, Esc, blur(`releaseInput`), reload, 캔버스 전환에서 루프가 멈춘다. 텍스트 드래그가 아닐 때는 버튼을 누른 채 변에 닿아도 돌지 않는다: 4 px 문턱 전의 누르기, 텍스트가 아닌 누르기, Hand 팬, Space, Capture area. 이동 중 React render가 없다.
  - `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 내보낸 viewer

- viewer의 텍스트 드래그에 같은 이동을 더하고 `node app/scripts/viewerInspect.mjs`로 다시 만든다.
- 검증: `node app/scripts/viewerInspect.mjs --check`가 통과하고, `app/src/main/exportViewer.test.ts`의 실제 DOM fixture에 가장자리 이동 경우를 더한다. `go test ./...`가 통과한다.
- `[commit]` `test:` → `feat:`

## T5. 실기 확인

- `/runtime-test`: 격리된 실제 앱에서 Select와 Hand 텍스트 드래그로 네 변과 모서리, 창 밖 포인터, 텍스트가 아닌 누르기로 변에 닿았을 때 움직이지 않음, 멈춤, 놓은 뒤 범위와 ⌘C, Esc, ⌘Tab. 네이티브 마우스 끌기가 필요한 구간은 짧게 하고 포커스를 가져간 단계를 보고에 적는다.
- 검증: 항목마다 스크린샷이나 관측값이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
- `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## T6. 승격과 정리

- PRODUCT: §5 item 4 'Canvas text'의 "no edge auto-scroll"을 가장자리 이동 규칙으로 바꾼다.
- ARCHITECTURE: §3 'Selection' 'Input'에 이동 루프와 포인터 위치 출처를 적는다.
- BACKLOG: T5에서 확인하지 못한 항목을 더한다.
- `docs/features/canvas-text-edge-pan/`를 지운다.
- 검증: PRODUCT에 "no edge auto-scroll"이 없고 새 규칙이 있다. 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-text-edge-pan after promotion`
