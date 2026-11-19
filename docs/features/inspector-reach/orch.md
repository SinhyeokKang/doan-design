# inspector 넓히기 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261119-1](../chain-261119-1/chain.md) 링크 3(마지막)
- 시작 해시: `989ff7a6e` (링크 2 header-breadcrumb-worktree 머지 `e3d03257d` 뒤 체인 파일 기록)
- 통합 브랜치: `feat/inspector-reach` (리드가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- conductor: Claude Code (Opus 5.5)

## 결정 기록

- 모델 배치: 구현 배치(고침 라운드 포함)는 모두 Codex `gpt-6.2-astra` 워커, 리뷰는 Claude(독립 리뷰 워커와 conductor 리뷰)가 맡는다. 사용자 지시(체인 '상시 권한' 링크 2·3, Astra 신버전 시험). `gpt-6.2-astra`는 `$CODEX_HOME/models_cache.json`에 있다.
- tasks 1(버블 초안), 6(PoC), 7(뷰어 초안)은 끝났다: `.doan/canvases/inspector-reach-bubble.html`, `.doan/canvases/inspector-reach-viewer.html` 사용자 확정, PoC 결과와 행 단위 물러서기 결정(design 'PoC 결과', 'PoC 뒤 결정', '초안 리뷰에서 정한 것').
- 배치 순서: tasks대로 (B) 앱을 먼저, (A) CLI 뷰어를 그 뒤에 직렬로 돌린다. 근거: 사용자 지시와 tasks.md. 뷰어 element menu는 B의 `treeScrollLeft`를 생성 코드로 받고, `exportViewer.test.ts`가 `shell.css`를 `styles.css`에 선언 단위로 고정하므로 A는 B가 통합된 통합 브랜치에서 시작한다.
- 생성 스크립트 이름: conductor 재량 — `app/scripts/viewerInspect.mjs [--check]`(기존 `doanyGolden.mjs`와 같은 방식). A가 만들고 AGENTS.md 'Commands'에 한 줄 더한다(체인 시작 점검 4 승인). `--check`는 버블 golden처럼 verify gate(`.agents/skills/verify/scripts/verify.mjs`)에 한 단계로 넣는다. 근거: 생성물이 소스와 달라지면 CI에서 잡혀야 한다(design '코드 가져오기').
- 생성 도구: conductor 재량 — `app/node_modules`에 이미 있는 도구(`typescript`, vite 8의 `rolldown`)로 TS를 JS로 바꾼다. 새 패키지를 더하지 않는다.
- WebKit `@import` `data:` 시트: conductor 재량 — PoC가 검증한 방법(수집기가 data: 텍스트를 풀어 `replaceSync`로 다시 파싱)을 쓴다. Go에서 import를 펼치면 export 출력과 프로토타입 경로까지 바뀐다(design 'PoC 뒤 결정'이 구현 때 고르게 했다).
- 외부 시트 판별: design 'PoC 결과'는 시트를 잠깐 끄는 방법이 transition을 튀게 할 수 있다고 적었다. 워커가 다른 방법을 먼저 찾고, 없으면 쓰되 transition이 보이지 않게 한다. 어느 쪽이든 결과 행은 사용자 결정대로 토큰 없이 계산된 값만 보인다.
- tasks 4의 `/design-sync`(버블·element menu 측정)는 B 통합·리뷰 뒤 B 워커에게 새 Task로 보낸다(같은 코드를 안다). `/runtime-test`(tasks 4의 실제 앱 확인)는 conductor가 한다. 로그인은 필요 없다(체인 '로그인').
- tasks 10(브라우저 확인): 체인 시작 점검 3 승인대로 A 워커가 `.scratch/` Playwright 스크립트(Chromium·WebKit)로 확인한다. 실제 Safari는 실행하지 않고 BACKLOG 'Not verified in the real app'에 남긴다. 뷰어는 앱 화면이 아니라 `/design-sync` 대상이 아니므로 같은 스크립트가 초안 `inspector-reach-viewer.html`과 export 결과를 computed style로 비교하고 `docs/design/canvas.md` 'Canvas row menu and export viewer'에 적는다(링크 2 V의 방식).
- B 1차는 리뷰 전에 통합했고, A는 B-rev와 병렬로 시작했다: conductor 재량 — A가 받는 B 결과(`treeScrollLeft`, element menu CSS)는 이미 통합되었다. B 고침 라운드는 A가 소유한 파일을 건드리지 않고(`app/src/renderer/**`의 B 파일), B 고침이 `treeScrollLeft`나 element menu CSS를 바꾸면 A의 `--check`와 `exportViewer.test.ts` 고정이 A 통합 때 잡는다. 그때 A 워커에게 맞춤 Task를 보낸다.
- tasks 5(B 승격)와 11(최종 verify), 12(승격)는 conductor가 끝에 한 번에 한다(PRODUCT·ARCHITECTURE 문서별 커밋).

## Codex 사용

- 2026-11-19 22:43 기록(23:05 확인, `$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 8% 사용, plan pro. 사용할 수 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B | tasks 2, 3, 3a | `app/src/renderer/**`: 새 버블 순수 모듈과 테스트, `CanvasController.ts`, `sizeBubble.ts`, `BubbleAdd.tsx`, `App.tsx`, `headerShowButtons.ts`, `InspectorPanel.tsx`, `styles.css`와 각 테스트 | 없음 | Codex Astra high — controller DOM과 React portal을 잇는 포커스 규칙, 클릭 분배가 틀리면 Add to message가 잘못 실행된다(postmortem 2026-11 툴바 포커스) | `npm --prefix app test`, typecheck, lint | 1차 완료 `a6a0d2a89`·`a188117b6` → 통합 `f3ce32ce2`·`dd47ce900` (dispatch `ctx_325cf1e81639`, 워크트리 `irb-b`; Vitest 513 files / 14,853 PASS, typecheck·lint PASS) |
| B-rev | B 리뷰 | 없음(보고만) | B | Claude Opus high — 포커스·이벤트 경로가 여러 컴포넌트에 걸친다 | `/code-review` 보고 | 1차 🔴0 🟡1 ⚪4 (`irb-b/.scratch/review-B.md`; dispatch `ctx_2b45741c621e`) → B 고침 1차(🟡1, ⚪1·3·4) 진행 중 (dispatch `ctx_93e01fc74f9e`). ⚪2는 conductor `/runtime-test` 항목 |
| BDS | tasks 4(`/design-sync`) | B와 같음, `docs/design/prototype.md`, `docs/design/canvas.md` | B, B-rev | Codex Astra(B 워커 후속 Task) — 측정 절차가 정해져 있다 | 측정값 기록, 960×600에서 헤더 도구가 breadcrumb 옆에 들어감, test | 대기 |
| A | tasks 8, 9, 10 | `cli/internal/export/**`(뷰어 `shell.*`, `measure.js`, 새 `inspect.js`, `assemble.go`, 테스트와 고정 출력), `app/scripts/viewerInspect.mjs`와 테스트, `app/src/main/exportViewer.test.ts`, 생성 대상 앱 소스의 export 범위(동작 변경 없음), `.agents/skills/verify/scripts/verify.mjs`의 한 단계, AGENTS.md 'Commands' 한 줄, `docs/design/canvas.md` 뷰어 절 | B 통합 | Codex Astra high — 신뢰하지 않는 메시지 검증, CSSOM cascade, 생성 규칙, 두 엔진 | `npm --prefix app test`, typecheck, lint, `go test ./...`, `go vet ./...`, `node app/scripts/viewerInspect.mjs --check`, `node eval/run.ts --self-test --scenarios X1,X2` | 진행 중 (dispatch `ctx_0fb0fca266a4`, 워크트리 `irb-a`, 기준 `dd47ce900`; `launch.effective` codex/gpt-6.2-astra/high 확인) |
| A-rev | A 리뷰 | 없음(보고만) | A | Claude Opus high — 보안 경계(postMessage)와 생성 코드 | `/code-review` 보고 | 대기 |
| conductor | tasks 4(`/runtime-test`), 5, 11, 12 | orch.md, 승격 문서, BACKLOG | 전부 | — | `/runtime-test`, verify, `grep -rn "inspector-reach" docs/ app/ cli/` | 대기 |

- 겹침: B와 A는 직렬이다. 위 '배치 순서'.
- 모든 tasks 체크 항목: 1·6·7 끝, 2·3·3a B, 4 BDS+conductor, 5 conductor, 8·9·10 A, 11·12 conductor. 주인 없는 항목은 없다.

## Astra 신버전 결과

| 배치 | 라운드 | 리뷰에서 나온 문제 |
|---|---|---|
