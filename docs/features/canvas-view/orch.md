# canvas-view — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `2539b57` (main)
- 통합 브랜치: `feat-canvas-view` (main `2539b57`에서 만든다). 모든 배치를 이 브랜치에 통합한다.
- 지휘: Claude Code(claude-opus-5-5). Orca orchestration Run으로 워커를 관리한다.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-22 | 태스크 0의 PoC 실험 명령을 이번 실행의 게이트로 허용한다: `.scratch/poc1-canvas/` 안에서 `app/node_modules`의 Electron 45.0.0 · Playwright 1.64.1로 최소 앱을 띄우는 `node <스크립트>`, `app/node_modules/.bin/electron <경로>`, 필요하면 그 디렉터리 안의 `npm install`. `app/package.json`은 건드리지 않는다 | 사용자 |
| 2026-10-22 | B0(PoC)와 B1(순수 함수)을 병렬로 돌린다. B0이 실패하면 B1 결과는 통합하지 않고 보류한 채 다시 정한다 | 사용자 — B1은 PoC 결과에 거의 기대지 않는다 |
| 2026-10-22 | 워커는 Claude Code만 쓴다. 배치마다 모델과 effort를 아래 표처럼 명시해 띄우고 `launch.effective`로 확인한다 | 지휘 판단 — AGENTS.md 모델 경계, orchestrate 0단계 3 |
| 2026-10-22 | 병렬 배치는 각자 `feat-canvas-view`에서 만든 새 worktree에서 돈다 | 지휘 판단 — 커밋하는 워커가 같은 checkout을 쓰면 index가 겹친다(app-shell과 같다) |
| 2026-10-22 | 태스크 2의 `canvasViewUpdate`(`canvasView.ts`)는 B1이 아니라 B2가 맡는다. `FolderEntry`의 `servedRev` 필드도 B2가 `view.ts`에 더한다 | 지휘 판단 — `canvasViewUpdate`는 `servedRev`에 기대고, `servedRev`의 발행 규칙(흐름 9)은 태스크 4의 몫이다. `view.ts`는 B1(`width`) → B2(`servedRev`) 순서로 직렬이 된다 |
| 2026-10-22 | 태스크 8(DIRECTORY.md · runtime-test 스킬)은 B4가 태스크 6 · 7과 함께 한다. 태스크 9(승격과 정리)는 지휘가 한다 | 지휘 판단 — 태스크 8은 e2e 단계와 스크린샷 이름을 아는 B4가 적는다. 승격은 orchestrate 5단계의 지휘 몫이다 |
| 2026-10-22 | 휠 상수: 줌 감도 `0.01`(`exp(-dy * 0.01)`), `deltaMode` 1 = 16px, 2 = 800px. 테스트로 값을 고정한다 | 지휘 판단 — B1 리뷰 U1. 느낌을 맞추는 구현 상수이고, PoC 1 휠 확인이 어색하면 다시 고친다 |
| 2026-10-22 | `resizeKeep`을 지운다. 창 크기가 바뀌어도 view를 그대로 둔다 | 지휘 판단 — B1 리뷰 U2. 화면 좌표 기준이 컨테이너 왼쪽 위라 항등 함수가 되고, 쓰지 않는 인자를 남기는 것은 AGENTS.md가 말하는 미리 만든 유연성이다. 동작은 e2e 단계 5가 확인한다 |
| 2026-10-22 | `fitFrame`은 현재 view를 넷째 인자로 받는다. 맞춤 · 프레임 점프의 위쪽 맞춤은 `y = margin`, 가로는 가운데다 | 지휘 판단 — B1 차이 1 · 4. 크기 0 프레임 규칙에 현재 배율이 필요하다 |
| 2026-10-22 | 캔버스 iframe 탐색 제한을 initiator 규칙으로 바꾼다: `will-frame-navigate`의 `details.initiator`가 앱 창의 메인 프레임이고 새 URL이 토큰 경로 아래면 허용하고, 그 밖에는 토큰 URL에서 같은 폴더 키로 가는 탐색만 허용한다. design.md '보안' 탐색 제한의 `about:blank` 규칙을 이것으로 바꿔 읽는다. `allowFrameNavigation`에 인자가 하나 늘고, B3가 B1 코드와 테스트를 고친다 | 사용자 — PoC 1 항목 5에서 `about:blank` 규칙의 구멍 두 개(캔버스가 스스로 `about:blank`로 간 뒤 다른 폴더 키로 이동, CSP에 막힌 링크 뒤 리로드 거부)가 나왔고, initiator 규칙은 둘 다 막았다 |
| 2026-10-22 | "앱 메인 프레임이 시작한 탐색"은 `details.initiator`가 있고 그 `parent`가 `null`인 경우다(객체 동일성 비교 안 함, `initiator`가 없으면 아님). 탐색 제한은 닫힌 쪽으로 판단한다: 손자 프레임임이 확인된 경우(`frame.parent.parent`가 있음)만 제한하지 않고, `frame`이나 `parent`가 `null`이면 제한한다 | 지휘 판단 — B0 리뷰 🔴1 · 🔴2. `fromAppFrame`과 같은 판단을 쓰고, 동일성 비교가 빗나갈 때 열린 쪽으로 새지 않게 한다 |
| 2026-10-22 | 캔버스 안 링크로 새 문서가 뜨면(`layout.href`가 바뀌면) 렌더러가 iframe 높이를 150px로 초기화한다. 높이 고정은 그 문서가 끝날 때까지 유지하고, 오탐은 한계로 받아들인다. 200,000px 상한은 렌더러가 건다 | 지휘 판단 — B0 리뷰 🟡6 · 🟡7. `min-height: 100vh` 캔버스가 링크 이동 뒤 줄어들지 못하는 경우를 막는다 |
| 2026-10-22 | 렌더러는 iframe `src`를 `CanvasRow.url`로만 넣고, `layout.href` 등 캔버스가 보낸 값으로는 넣지 않는다 | 지휘 판단 — B0 리뷰 🟡8. initiator 규칙에서는 앱 메인 프레임이 시작한 탐색이 어느 폴더 키로든 허용되기 때문이다 |
| 2026-10-22 | `layout.href`는 자르지 않고, 8 KiB를 넘으면 메시지를 버린다. `href`는 열린 캔버스 표시에만 쓴다 | 지휘 판단 — B1 리뷰 ⚪3. 잘린 `href`는 `CanvasRow.url`과 맞지 않는다. 캔버스 스크립트가 위조할 수 있다(design.md 흐름 5) |

## 배치

| 배치 | 항목 | 파일 소유 | 전제 | 모델 · effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B0 | 태스크 0 | `.scratch/poc1-canvas/`, `docs/PRODUCT.md` §6, `docs/features/canvas-view/design.md` 'PoC 의존' · '정할 값' | 없음 | Opus high — OOPIF 주입 · 높이 측정 · 휠 전달을 실험으로 판정하고, 틀리면 이후 배치 전체가 틀어진다 | PRODUCT §6에 tasks.md 태스크 0의 일곱 결과가 통과 · 실패로, design.md에 주입 이벤트와 높이 규칙 · 상한이 적혀 있다 | 항목 5만 설계 규칙대로 실패 → initiator 규칙으로 재결정(사용자) 뒤 통과. `feat-canvas-view` `50f31df..248f6b9`, 리뷰 🔴2 🟡9 → 수정 1회 |
| B1 | 태스크 1, 태스크 2의 `parseCanvasMessage` · `acceptCanvasMessage`, 태스크 3 | `app/src/renderer/viewport.ts` · `canvasMessage.ts`와 테스트, `app/src/main/canvasFrame.ts`와 테스트, `app/src/main/view.ts`의 `canvasRows` `width`와 테스트 | 없음 | Sonnet high — 경계 사례가 tasks.md에 다 적힌 순수 함수다. 다만 탐색 허용 URL 판단은 보안 경계라 effort를 높인다 | `npm --prefix app test`, `npm --prefix app run typecheck`, 빨강 먼저 | 통과, `feat-canvas-view` `b190b5e..1dc5c3f`, 리뷰 🔴0 🟡2 → 수정 1회 |
| B2 | 태스크 4, 태스크 2의 `canvasViewUpdate` | `app/src/main/watch.ts` · `shell.ts`와 테스트, `app/src/main/view.ts`의 `FolderEntry` `servedRev`, `app/src/renderer/canvasView.ts`와 테스트 | B1 통합 | Opus high — 디바운스 · `again` 재실행 · 오래된 읽기 폐기 사이에서 플래그를 잃지 않아야 하는 동시성 작업이다 | `npm --prefix app test`, `npm --prefix app run typecheck`, 빨강 먼저 | 진행 중 |
| B3 | 태스크 5 | `app/src/main/index.ts`, 주입 스크립트(위치는 B0 결과로 정함), `app/src/preload/index.ts`, `app/electron.vite.config.ts` | B0 통과, B1 통합 | Opus high — 권한 · IPC 발신 프레임 · 탐색 제한 · CSP를 잇는 보안 작업이다 | `typecheck`, `run build`, `run e2e`의 기존 단계 `runtime-test: PASS` | 대기 |
| B4 | 태스크 6, 7, 8 | `app/src/renderer/main.ts` · `styles.css` · `index.html`, `app/e2e/runtime.ts`, `docs/DIRECTORY.md`, `.agents/skills/runtime-test/SKILL.md` | B2 · B3 통합 | Opus high — UI 상태 전환 · 두 휠 경로 · e2e 열한 단계와 변형 증명 다섯 줄을 한 번에 맞춘다 | `npm --prefix app test`, `typecheck`, `run e2e` `runtime-test: PASS`, `innerHTML` grep 0건, 변형 표 다섯 줄 실패 확인 | 대기 |
| 지휘 | 태스크 9 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/canvas-view/` 삭제 | B4 통합 | — | tasks.md 태스크 9의 검증 | 대기 |

리뷰 워커: B0 · B1은 Opus medium(실험 근거와 경계 사례 대조), B2 · B3 · B4는 Opus high(동시성 · 보안 · 큰 UI diff).

## 겹침과 순서

- B0과 B1은 겹치는 파일이 없어 병렬로 돈다.
- B2는 B1이 고친 `view.ts`를 이어 고치고 `width`를 쓰므로 B1 통합 뒤에 띄운다. B0을 기다리지 않는다.
- B3는 B0의 주입 이벤트 · 스크립트 위치와 B1의 `canvasFrame.ts`를 쓰므로 B0 통과와 B1 통합 뒤에 띄운다. B2와 파일이 겹치지 않아 B2와 병렬로 돈다.
- B4는 B2의 `servedRev` · `canvasViewUpdate`와 B3의 메뉴 명령 · 주입을 쓰므로 둘의 통합 뒤에 띄운다.
- 각 배치가 끝나면 독립 리뷰 워커가 `/code-review`를 하고, 🔴가 0이 될 때까지 배치 워커가 고친다.
- tasks.md의 체크 항목 대응: 태스크 0 → B0, 1 → B1, 2 → B1(`parseCanvasMessage` · `acceptCanvasMessage`) · B2(`canvasViewUpdate`), 3 → B1, 4 → B2, 5 → B3, 6 · 7 · 8 → B4, 9 → 지휘.
