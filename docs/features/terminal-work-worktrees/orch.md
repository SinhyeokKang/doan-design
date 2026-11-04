# terminal-work-worktrees — orchestrate

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 파일은 배치 배정과 진행만 적는다.

- 시작 hash: `df0b6bff` (main = origin/main)
- 통합 브랜치: `feat/terminal-work-worktrees`
- 모델 교차: 없음(Claude Code 지휘자 → Claude 작업자만). `/agent-eval`은 AGENTS.md의 상시 예외로 두 runtime을 돈다.

## 결정 기록

1. 사용자에게 물을 열린 결정이 없다 — 지휘자 판단. spec 결정 1~7과 design의 사용자 결정(보드 안내 문구, picking 안내 위치)이 이미 정해져 있고, `/design-draft` 초안(`sibling-notice`, `picking-hint`)도 사용자가 앱에서 확정했다(design §3.1, §3.6).
2. T1은 main 규칙과 renderer 규칙으로 나눠 각 배치에 넣는다 — 지휘자 판단. 두 규칙은 파일이 겹치지 않고, 같은 배치의 다음 task가 바로 쓴다. commit도 둘로 나눈다(`feat(app): rules for auto-registered worktrees`, `feat(renderer): rules for sibling work and the fallback worktree`).
3. T2a와 T2b는 한 배치에서 순서대로 한다 — 지휘자 판단. 둘 다 `app/src/main/index.ts`를 고치고, T2b가 T2a의 `adopt`를 쓴다.
4. 자동 등록분 플래그(entries에 싣는 값)의 이름과 모양은 배치 M이 `/tdd`에서 정한다(design §3.3). 배치 R의 플래그 의존 항목은 M 통합 뒤 새 Task로 보낸다.
5. `/runtime-test`와 `/design-sync`는 main과 renderer가 모두 통합된 뒤 배치 R 작업자가 한다 — 지휘자 판단. 보드 안내는 main의 자동 등록이 있어야 실제 앱에서 보인다.
6. T4의 PRODUCT·ARCHITECTURE·BACKLOG 승격과 feature 디렉터리 삭제는 지휘자가 한다(/orchestrate §4·§5). DESIGN.md 측정값은 `/design-sync`를 하는 배치 R이 적는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| M | T1(main: `autoRegisterRoot`, `pruneAuto`, `autoAfterAdd`), T2a, T2b | `app/src/main/**`(새 규칙 모듈, `folderStore`, `shell`, `cli`, `view`, `index`, `runtime`, `addFlow`·`addProjects`와 각 테스트), `app/src/preload/**` | 없음 | Opus high — 두 파일 쓰기 순서·세대 직렬화, 비동기 등록과 기한 경쟁, 동시 `start` 합치기. 틀리면 목록 유실이나 남는 스피너 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| R1 | T1(renderer: `siblingWork`, W 소멸 도착지), T3 중 플래그가 필요 없는 것(보드 안내 + Open §3.1, 사이드바 slot 테스트 §3.2, picking 안내 위치 §3.6) | `app/src/renderer/**` | 없음 | Opus high — App navigation·기록·focus 상태가 얽히고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, typecheck, build | 대기 |
| R2 | T3 중 플래그 의존 항목: 자동 등록분 숨김(§3.3), 보던 W가 사라지거나 숨겨질 때의 이동과 직전 선택 기억(§3.4)과 그 App 테스트 | `app/src/renderer/**` | M 통합 | Opus high — R1과 같은 이유 | R1과 같음 | 대기 |
| R3 | T3 `/runtime-test` 전 항목, `/design-sync`(`sibling-notice`, `picking-hint`)와 `docs/DESIGN.md` 측정값 | `app/src/renderer/**`(sync 수정), `docs/DESIGN.md`, `.scratch/` | M·R1·R2 통합 | Opus high — 실제 앱 격리와 측정 판단 | `/runtime-test` 증거, `/design-sync` 보고, 앱 test·typecheck·build | 대기 |
| E | T4 `/agent-eval` | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/` | 전체 통합 | Sonnet medium — 정해진 시나리오 실행과 기록 | `node eval/run.ts` 결과와 기록 | 대기 |
| 지휘자 | T4 승격(PRODUCT, ARCHITECTURE, BACKLOG), feature 디렉터리 삭제, 통합 `/verify` | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/terminal-work-worktrees/` | 전체 통합 | — | `verify.mjs`, `rg` 참조 확인 | 대기 |
| 리뷰 | 배치별 `/code-review`(보고만) | 없음 | 각 배치 완료 | M: Opus high, R: Opus medium — diff 난이도 기준 | 🔴 0 | 대기 |

## 겹침과 순서

- M과 R1은 파일이 겹치지 않아 병렬로 돈다(main·preload ↔ renderer).
- R2는 M의 `view.ts` 플래그가 필요하다. M 통합 뒤 R 작업자에게 `feat/terminal-work-worktrees`로 rebase하게 하고 새 Task로 보낸다.
- R3는 M·R1·R2 통합 뒤, E와 지휘자 승격은 R3 통합 뒤다.
- tasks의 항목은 모두 위 행 하나에 속한다: T1 → M·R1, T2a·T2b → M, T3 → R1·R2·R3, T4 → E·R3(DESIGN.md)·지휘자.

## 진행

(통합 hash, 리뷰 라운드, 검증 증거를 여기 적는다.)
