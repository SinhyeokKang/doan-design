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
- A-rev ⚪4(export 크기 상한): conductor 재량 — 따로 상한 테스트를 두지 않는다. 출력 고정 테스트(`TestAssembleOutputIsPinned`·`TestExportOutputIsPinned`)가 모든 바이트 변화를 명시적 갱신으로 만들고, 50 MiB 한도와 할당 상한 테스트는 그대로다. 늘어난 양(+81,098 B, 빈 캔버스)은 ARCHITECTURE에 적는다.
- A-rev ⚪3(`docs/design/canvas.md`가 초안 `inspector-reach-viewer.html`을 이름으로 적음): conductor 재량 — 초안 파일은 남으므로 그대로 둔다. tasks 12의 `grep` 확인은 feature 디렉터리 경로(`docs/features/inspector-reach`)만 대상으로 본다.
- A-rev ⚪6(생성물이 vite 8에 딸린 `rolldown`에 의존): 받아들인다. 버전이 바뀌면 verify의 `viewer-inspect` 단계가 실패로 드러난다.
- A-rev 🟡1(외부 시트 판별이 애니메이션을 다시 시작하고 진행 중 transition을 끊음): A 고침 1차가 애니메이션 시간·재생 상태 복원과 인라인·읽을 수 있는 시트 transition 유지를 고쳤다(`7abe053cb`·`0ecfd1a52`, 두 엔진). 읽지 못하는 외부 시트가 transition과 끝값을 함께 선언하면 inspector가 열린 채 요소를 누를 때 진행 중 transition이 끝값으로 건너뛰는 것이 남았다. 사용자 결정(2026-11-20): 판별을 유지하고 알려진 한계로 ARCHITECTURE와 BACKLOG에 적는다.
- tasks 5(B 승격)와 11(최종 verify), 12(승격)는 conductor가 끝에 한 번에 한다(PRODUCT·ARCHITECTURE 문서별 커밋).

## 런타임 확인 (B, conductor)

- `node .scratch/runtime-test/irb-b/measure.mjs` exit 0, `RUNTIME PASS`(Playwright `_electron`, 창 숨김): 재생 가능한 프레임에서 버블 Show inspector를 눌러도 새 창이 열리지 않고 inspector가 열리며 포커스는 Hide inspector로 간다. 버블 버튼에 포커스가 있을 때 Esc·H로 버블이 사라지면 Play → 툴바 Play, Add → 툴바 Picker, Show inspector → 헤더 Show inspector(B-rev ⚪2). yield에서 `aria-disabled`, Enter는 아무것도 하지 않고, 창을 넓히면 포커스가 Hide inspector로 간다.
- Playwright `_electron`은 페이지 포커스를 흉내 내서(`document.hasFocus()`가 늘 true) 창 활성화 경로를 볼 수 없었다. 변경과 무관한 헤더 hand-off도 같은 결과(Hide sidebar)를 내서 probe의 한계로 판단했다.
- 그래서 `node .scratch/runtime-test/irb-b/native.mjs`로 다시 확인했다(exit 0, `NATIVE PASS`). Playwright 없이 개발 Electron을 띄우고 CDP 연결을 끊은 채 `open -a`로 Finder와 Doan을 번갈아 실제로 앞으로 가져왔다(포커스를 잠깐 가져간 단계). Show inspector·Play·Add 각각: 백그라운드에서 캔버스 파일이 바뀌어 reload되고(iframe 문서가 새것, 선택 유지), 포커스는 같은 버블 버튼으로 돌아오며, 창을 활성화한 뒤에도 그 버튼에 남는다(B-rev 🟡1의 실제 경로).
- 두 실행 모두 실제 상태 변화 없음(`assertRealState` 통과), 임시 폴더 삭제.

## Codex 사용

- 2026-11-20 링크 종료 때 terminal 상태줄: weekly 90% left.
- 2026-11-19 22:43 기록(23:05 확인, `$CODEX_HOME/sessions` 최신 rollout): 주간(10080분) 8% 사용, plan pro. 사용할 수 있다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B | tasks 2, 3, 3a | `app/src/renderer/**`: 새 버블 순수 모듈과 테스트, `CanvasController.ts`, `sizeBubble.ts`, `BubbleAdd.tsx`, `App.tsx`, `headerShowButtons.ts`, `InspectorPanel.tsx`, `styles.css`와 각 테스트 | 없음 | Codex Astra high — controller DOM과 React portal을 잇는 포커스 규칙, 클릭 분배가 틀리면 Add to message가 잘못 실행된다(postmortem 2026-11 툴바 포커스) | `npm --prefix app test`, typecheck, lint | 1차 완료 `a6a0d2a89`·`a188117b6` → 통합 `f3ce32ce2`·`dd47ce900` (dispatch `ctx_325cf1e81639`, 워크트리 `irb-b`; Vitest 513 files / 14,853 PASS, typecheck·lint PASS) |
| B-rev | B 리뷰 | 없음(보고만) | B | Claude Opus high — 포커스·이벤트 경로가 여러 컴포넌트에 걸친다 | `/code-review` 보고 | 1차 🔴0 🟡1 ⚪4 (`.scratch/evidence/review-B.md`) → B 고침 1차 `21ad93176`·`ee694b8a7`(🟡1, ⚪1·3·4; 수정 전 실패 확인, Vitest 14,858 PASS) → 통합 `fe76350aa`·`64e196a91`(conductor가 diff 확인). ⚪2는 conductor `/runtime-test` 항목 |
| BDS | tasks 4(`/design-sync`) | B와 같음, `docs/design/prototype.md`, `docs/design/canvas.md` | B, B-rev | Codex Astra(B 워커 후속 Task) — 측정 절차가 정해져 있다 | 측정값 기록, 960×600에서 헤더 도구가 breadcrumb 옆에 들어감, test | 완료 `66c2c312a`·`ebc09b60d` → 통합 `e133f89e3`·`ed1008ca4`(conductor가 diff 확인). 앱 실행 1회, 1,404개 비교 중 1,390개 일치, 남은 14개는 문서화된 편차(툴팁 포털·서브픽셀·상속 자간). 960×600 양쪽 열림에서 breadcrumb와 도구 간격 8px. B 워커 해제, 워크트리 `irb-b` 제거(브랜치 `SinhyeokKang/irb-b` `ebc09b60d` 유지) |
| A | tasks 8, 9, 10 | `cli/internal/export/**`(뷰어 `shell.*`, `measure.js`, 새 `inspect.js`, `assemble.go`, 테스트와 고정 출력), `app/scripts/viewerInspect.mjs`와 테스트, `app/src/main/exportViewer.test.ts`, 생성 대상 앱 소스의 export 범위(동작 변경 없음), `.agents/skills/verify/scripts/verify.mjs`의 한 단계, AGENTS.md 'Commands' 한 줄, `docs/design/canvas.md` 뷰어 절 | B 통합 | Codex Astra high — 신뢰하지 않는 메시지 검증, CSSOM cascade, 생성 규칙, 두 엔진 | `npm --prefix app test`, typecheck, lint, `go test ./...`, `go vet ./...`, `node app/scripts/viewerInspect.mjs --check`, `node eval/run.ts --self-test --scenarios X1,X2` | 완료. 1차 통합 `4d6ba2da4`..`9f53161e0`, 고침 1차 `7abe053cb`..`b5a62d7b4` → 통합 `e2d204711`까지. 워커 해제, 워크트리 `irb-a` 제거(브랜치 `SinhyeokKang/irb-a` `b5a62d7b4` 유지) |
| A-rev | A 리뷰 | 없음(보고만) | A | Claude Opus high — 보안 경계(postMessage)와 생성 코드 | `/code-review` 보고 | 1차 🔴0 🟡4 ⚪7 → 고침 1차 → 2차: 이전 지적 해결, 새 🟡1(외부 시트가 도착값을 정하는 transition)은 사용자가 한계를 넓혀 기록하기로 결정 |
| conductor | tasks 4(`/runtime-test`), 5, 11, 12 | orch.md, 승격 문서, BACKLOG | 전부 | — | `/runtime-test`, verify, `grep -rn "inspector-reach" docs/ app/ cli/` | `/runtime-test`(B) PASS, verify PASS(`e2d204711`), X1·X2 self-test PASS, 승격 `f916e6e8a`·`c17dd4991`(PRODUCT), `7ebfc73f2`·`215b1e07e`(ARCHITECTURE), `10700620f`(BACKLOG) |

- 겹침: B와 A는 직렬이다. 위 '배치 순서'.
- 모든 tasks 체크 항목: 1·6·7 끝, 2·3·3a B, 4 BDS+conductor, 5 conductor, 8·9·10 A, 11·12 conductor. 주인 없는 항목은 없다.

## Astra 신버전 결과

| 배치 | 라운드 | 리뷰에서 나온 문제 |
|---|---|---|
| B (tasks 2·3·3a, high) | 구현 1 + 고침 1 | B-rev 🔴0 🟡1 ⚪4: reload가 버블 Show inspector로 포커스를 되돌린 뒤 창 활성화 재포커스가 취소되지 않아 헤더로 넘어감(코드 읽기로 찾음). ⚪: pick 취소 경로 테스트 없음, 렌더 중 Play 조회, `treeScrollLeft` 상수 출처와 ArrowDown 테스트. 자기 리뷰는 "🔴·🟡 없음"이라 보고했다. 고침 1차로 전부 해결(수정 전 실패 확인). |
| A (tasks 8·9·10, high) | 구현 1 + 고침 1(두 번에 나눔) | A-rev 1차 🔴0 🟡4 ⚪7: 외부 시트 판별이 애니메이션을 다시 시작하고 transition을 끊음, shell 상한이 생산 쪽 상한과 묶이지 않음, 위조 press·drag가 메뉴를 닫고 V/H/Space를 막음, 핵심 동작이 추적 테스트에 없음. 핸드오프의 "transition을 막는다"는 리뷰가 반증했다. 고침 중 남은 부작용에서 지시대로 멈췄고 나머지 항목까지 멈춰 다시 보냈다. 2차: 전부 해결, 한계 확장 1건(사용자 수용). |
| BDS (tasks 4, B 워커) | 측정 1 | 리뷰 지적 없음. 앱 실행 1회로 다섯 프레임·깊이 13 메뉴·헤더 다섯 폭을 쟀다. 고칠 동작 차이 없음. |
