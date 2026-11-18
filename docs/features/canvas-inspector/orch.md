# 캔버스 인스펙터 — orch

- 출처: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 해시: `2f25f4ef7`(origin/develop)
- 통합 브랜치: `feat/canvas-inspector`(lead가 만들었다). 끝은 push와 develop 대상 PR, 병합은 lead가 한다.
- 모델 경계: Claude Code 지휘자이므로 Claude 워커만 쓴다. 교차 없음.

## 결정 기록

- 제품·구조 결정은 spec·design의 '정해진 것'과 사용자 확정 초안(tasks 0·1)에 모두 있다. 새로 물을 것은 없다(지휘자 판단 — spec·design 근거).
- 배치를 tasks 번호가 아니라 파일 소유로 나눈다. 2b·3의 순수 함수가 4·4b·5와 같은 파일에 있으므로, 그 파일을 맡는 배치가 자기 함수의 테스트(2b)와 구현(3)을 함께 한다. 커밋 경계는 배치마다 `test(app): …` → `feat(app): …`로 나눈다(지휘자 판단 — 같은 파일을 두 배치가 고치지 않게).
- renderer의 행 표시(B3)는 main의 `InspectRow`·`InspectGroup` 타입을 import한다. 그래서 리졸버 복원과 타입 계약(B0)을 먼저 끝내고 B1·B3를 시작한다.
- tasks 6(`/design-sync`, `/runtime-test`)은 B4 워커가 이어서 한다. 화면 구현 맥락을 그대로 쓰기 위해서다.
- 요소 메뉴는 박스를 그리지 않는 요소(`getClientRects()`가 비는 요소: display:none 하위, hidden input 등)를 빼고, display:contents는 자식을 그 깊이에 둔다. 선택·경로·프레임 행은 늘 남긴다(사용자 결정 — 골라도 보드에 보일 것이 없다).
- 요소 트리가 200행을 넘으면 경로 → 선택의 자식 → 형제 순으로 남긴다(지휘자 판단 — 선택 안으로 들어가는 것이 메뉴의 주된 이동이다).
- 좁은 창 기준은 design의 계산 순서(대화 폭을 먼저 뺀다)를 따른다. 그래서 대화 기본 폭에서는 약 1228, 둘 다 최소 폭이면 1164 미만에서 인스펙터가 양보한다. 비활성 툴팁은 대화 좁히기도 알린다("No room for the inspector. Widen the window, or narrow or hide the conversation."). 승격 때 PRODUCT의 경계 문구는 "대화 폭에 따라"로 적는다(사용자 결정).
- 면별 툴팁은 확정 패널 초안처럼 마주 보는 면을 묶는다("Top and bottom 20px, left and right 24px")(지휘자 판단 — 사용자가 확정한 초안).
- `not-shown`은 응답에서 바로 재요청하지 않는다. 다음 선택 적용이나 보이는 문서 변경 때 한 번 다시 묻고, 같은 선택·캔버스에서 두 번 이어지면 실패(Retry)로 바꾼다(지휘자 판단 — 디버거 분리 뒤 끝나지 않는 읽기를 막는다).
- `windowDebugger.ts`의 소유권 결함(같은 프로세스 중첩 iframe이 있으면 교체된 OOPIF 세션이 소유권을 되찾는다)을 이 feature에서 고친다. read-state proof에도 해당한다(사용자 결정).
- 수집기는 보이는 문서 proof가 없으면 2초 예산 안에서 `documents.onChange`를 기다려 다시 판정하고, 그래도 없으면 `unavailable`(Retry)로 답한다. `not-shown`은 다른 캔버스가 보이는 것이 확인될 때만 쓴다(지휘자 판단 — 디버거 분리 뒤 재요청 계기가 없는 고착을 막는다, read-state와 같은 대기 방식).
- Border·Gap은 `sides` 없이 단일 토큰 규칙을 따른다(지휘자 판단 — design은 면별 툴팁을 padding·margin·radius에만 요구한다).
- tasks 7(문서 승격과 정리)은 지휘자가 한다(orchestrate §5). README 표에 인스펙터를 넣을지는 통합 뒤 지휘자가 판단한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B0 | 2a 리졸버 복원, `InspectGroup` 6그룹과 `InspectRow`의 면별 토큰 정보 등 타입 계약(구현은 B1) | `app/src/main/inspect.ts`·`inspect.test.ts`·`inspect.fixture.json` | 없음 | Sonnet medium — 되살리기와 lint 고치기, 판단이 적다 | test·typecheck·lint | 대기 |
| B1 | 2b·3의 `inspectRows`(그룹 6개, Layout 조건, Columns)·`parseInspectRequest`, 4 전체 | `main/inspect*`, `main/inspector.ts`(+test), `main/windowDebugger.ts`(+test), `main/senderAllowed.ts`(+test), `main/index.ts`(+test, IPC 등록), `preload/index.ts` | B0 | Opus high — CDP 세션 소유, 직렬 큐, 늦은 응답, 재attach는 틀리면 다른 캔버스 값을 보인다 | test·typecheck·lint | 대기 |
| B2 | 2b·3의 `elementTree`·`nodeKind`·`nodeLabel`, 4b | `main/canvasScript.ts`(+test), `renderer/canvasMessage.ts`(+test) | 없음 | Opus medium — 주입 스크립트 seq 채널과 상한 줄이기, 범위가 좁다 | test·typecheck·lint | 대기 |
| B3 | 2b·3의 `panelBounds`·`canvasPanelsLayout`, `parseInspectorState`, `rowDisplay`·`rowCopyText`·`rowKey`, `inspectRequestFor`, `acceptInspect`, `headerShowButtons` | `renderer/rightPanelSize.ts`(+test), `restore/uiState.ts`(+test), 새 `renderer/inspectorRows.ts`(+test), 새 `renderer/headerShowButtons.ts`(+test) | B0 | Opus medium — 규칙이 많지만 순수 함수이고 테스트로 고정된다 | test·typecheck·lint | 대기 |
| B4 | 5 renderer 셸·패널·헤더 | `renderer/` UI(App.tsx, styles.css, ds/*.css, CanvasHeader, 인스펙터 패널, 요소 메뉴, 프로토타입 창), `docs/DESIGN.md` 한 줄씩 | B1·B2·B3 | Opus high — 그리드·포커스·키보드·늦은 응답이 얽힌다 | test·typecheck·lint | 대기 |
| B5 | 6 `/design-sync`·`/runtime-test` | B4와 같음, `docs/design/canvas.md`, `docs/DESIGN.md` | B4 | Opus high(B4 워커가 이어서) — 실앱 측정과 고치기 | verify, 측정 기록 | 대기 |
| 리뷰 | 배치마다 `/code-review` | 읽기만 | 각 배치 | 배치 난이도에 맞춰 Opus medium/high | 🔴 0 | — |
| 지휘자 | 7 문서 승격과 정리 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, README(필요하면), `docs/features/canvas-inspector/` 삭제 | B5 | — | tasks 7 검증 | 대기 |

tasks 체크 항목 대응: 0·1 완료, 2a→B0, 2b·3→B1·B2·B3(함수별), 4→B1, 4b→B2, 5→B4, 6→B5, 7→지휘자. 주인 없는 항목 없음.

## 겹침과 순서

- 병렬: B0 ∥ B2 → (B0 통합 뒤) B1 ∥ B3 ∥ (B2 계속) → B4 → B5 → 7.
- B1과 B2는 둘 다 `main/`이지만 파일이 겹치지 않는다. `main/index.ts`는 B1만 고친다. B2가 주입 스크립트 연결 때문에 `index.ts`를 고쳐야 하면 지연 항목으로 남긴다.
- B3가 `CanvasHeader.tsx`를 고치지 않도록 `headerShowButtons`는 새 파일에 둔다. `CanvasHeader.tsx` 연결은 B4다.

## 리뷰·통합 기록

- B0: 원본 대비 diff를 지휘자가 확인하고 먼저 통합했다(`3bfb41dcc`, `6e2101bf7`). 독립 리뷰는 B1과 함께 받는다.
- B2: 리뷰 🔴0 🟡0 🟢4. 🟢 두 건과 사용자 결정(박스 없는 요소 빼기)을 고쳤다. 통합 `e70f26bb7`, `dddeccdf3`, `aabce53bc`. 워커 해제, worktree 삭제, 브랜치 `SinhyeokKang/ci-b2` 유지.
- B3: 리뷰 🔴0 🟡1(`not-shown` 무한 재요청). 수정 라운드 1을 지휘자가 diff로 확인했다. 통합 `ae1fa59a6`, `f4d16203b`, `896cf30a8`. 워커 해제, worktree 삭제, 브랜치 유지.
- B0+B1: 리뷰 🔴0 🟡3 ⚪3. 수정 라운드 1 진행 중.
