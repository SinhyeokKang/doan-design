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
7. 보던 자동 등록 worktree가 사라질 때의 도착지는 직전 선택이나 main checkout이 문제 상태여도 그 root로 간다(사용자 결정, R1 리뷰). design §3.4 문구 그대로다.
8. v3 'Dispatch' 순서는 schema → token → `start` 경로 패턴 → 등록된 root/자동 등록이다(사용자 결정, M 리뷰). 응답은 바뀌지 않는다. T4에서 ARCHITECTURE §4에 적는다.
9. 자동 등록분이 외부·네트워크 볼륨에서 잠깐 사라져(ENOENT) 목록에서 빠지는 것은 spec 결정 2 그대로 두고, T4에서 BACKLOG 알려진 한계에 적는다 — 지휘자 판단(M 리뷰 정보 항목). 다음 `doan work start`에서 다시 등록된다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| M | T1(main: `autoRegisterRoot`, `pruneAuto`, `autoAfterAdd`), T2a, T2b | `app/src/main/**`(새 규칙 모듈, `folderStore`, `shell`, `cli`, `view`, `index`, `runtime`, `addFlow`·`addProjects`와 각 테스트), `app/src/preload/**` | 없음 | Opus high — 두 파일 쓰기 순서·세대 직렬화, 비동기 등록과 기한 경쟁, 동시 `start` 합치기. 틀리면 목록 유실이나 남는 스피너 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합(`e18fa3d8..b0c9e7d1`), 리뷰 1라운드 🔴 0, 🟡 2 수정 완료 |
| R1 | T1(renderer: `siblingWork`, W 소멸 도착지), T3 중 플래그가 필요 없는 것(보드 안내 + Open §3.1, 사이드바 slot 테스트 §3.2, picking 안내 위치 §3.6) | `app/src/renderer/**` | 없음 | Opus high — App navigation·기록·focus 상태가 얽히고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, typecheck, build | 통합(`470d48ec..8dbcd2ca`), 리뷰 1라운드 🔴 0 |
| R2 | T3 중 플래그 의존 항목: 자동 등록분 숨김(§3.3), 보던 W가 사라지거나 숨겨질 때의 이동과 직전 선택 기억(§3.4)과 그 App 테스트 | `app/src/renderer/**` | M 통합 | Opus high — R1과 같은 이유 | R1과 같음 | 대기 |
| R3 | T3 `/runtime-test` 전 항목과 실제 Orca worktree(`orca worktree create`로 만든 것)에서 보낸 `doan work start` probe(사용자 요청), `/design-sync`(`sibling-notice`, `picking-hint`)와 `docs/DESIGN.md` 측정값 | `app/src/renderer/**`(sync 수정), `docs/DESIGN.md`, `.scratch/` | M·R1·R2 통합 | Opus high — 실제 앱 격리와 측정 판단 | `/runtime-test` 증거, `/design-sync` 보고, 앱 test·typecheck·build | 대기 |
| E | T4 `/agent-eval` | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/` | 전체 통합 | Sonnet medium — 정해진 시나리오 실행과 기록 | `node eval/run.ts` 결과와 기록 | 대기 |
| 지휘자 | T4 승격(PRODUCT, ARCHITECTURE, BACKLOG), feature 디렉터리 삭제, 통합 `/verify` | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/terminal-work-worktrees/` | 전체 통합 | — | `verify.mjs`, `rg` 참조 확인 | 대기 |
| 리뷰 | 배치별 `/code-review`(보고만) | 없음 | 각 배치 완료 | M: Opus high, R: Opus medium — diff 난이도 기준 | 🔴 0 | 대기 |

## 겹침과 순서

- M과 R1은 파일이 겹치지 않아 병렬로 돈다(main·preload ↔ renderer).
- R2는 M의 `view.ts` 플래그가 필요하다. M 통합 뒤 R 작업자에게 `feat/terminal-work-worktrees`로 rebase하게 하고 새 Task로 보낸다.
- R3는 M·R1·R2 통합 뒤, E와 지휘자 승격은 R3 통합 뒤다.
- tasks의 항목은 모두 위 행 하나에 속한다: T1 → M·R1, T2a·T2b → M, T3 → R1·R2·R3, T4 → E·R3(DESIGN.md)·지휘자.

## 진행

- R1: 작업자 완료(`SinhyeokKang/ttw-R1`, `efe364c9..4f1ccedf` 5 commits). 작업자 보고: `verify.mjs` PASS(app test 6625 pass). handoff와 commit이 일치하고 worktree가 깨끗한 것을 지휘자가 확인했다. 작업자 terminal은 리뷰 수정과 R2를 위해 남겨 뒀다. 리뷰 1라운드: Opus medium.
- R1 리뷰 1라운드(Opus medium): 🔴 0, 🟡 1(picking 중 `.doan-canvas-bottom`이 Canvas tools 옆 보드 클릭을 막음), 사용자 결정 1(결정 7). R1 작업자 terminal 재사용이 `agent_unconfigured`로 거절돼, R1을 해제하고 같은 worktree에 Sonnet medium 수정 작업자를 새로 띄웠다(CSS 한 규칙이라 기계적 수정).
- 실제 앱 확인으로 넘긴 것(R3): picking 중 tools 옆 띠 클릭, : notice가 사라질 때 Open의 focus가 캔버스 영역으로 가는지, 긴 label의 줄임표와 tooltip.
- M: 작업자 완료(`SinhyeokKang/ttw-M`, `3c15f7b2..1819f5fd` 7 commits). 작업자 보고: `verify.mjs` PASS(app test 6672 pass). 플래그는 `FolderEntry.autoRegistered?: true`(`view.ts`), 모든 kind에 붙는다. `RuntimeState`에는 멤버 하나 대신 `roots`·`readRoot`·`adopt` 셋이 생겼다(handoff '계획과 다른 점'). handoff와 commit이 일치하고 worktree가 깨끗한 것을 지휘자가 확인했다. 작업자는 해제했다. 리뷰 1라운드: Opus high.
- R1 수정 1라운드(Sonnet medium): `6a719dfe`(통합 `8dbcd2ca`) — `.doan-canvas-bottom`을 click-through로. 작업자의 `verify.mjs`는 세 번째에 PASS였다. 앞의 두 번은 이 배치가 건드리지 않은 `app/src/main/shell.test.ts:718` "replace reports the move as a re-root focus"에서 실패했다(main 기존 flaky로 보임). M 통합 뒤 다시 보고, 남으면 BACKLOG에 적는다.
- R1을 `feat/terminal-work-worktrees`에 cherry-pick했다(`470d48ec..8dbcd2ca`). 통합 `/verify`는 M까지 넣은 뒤 한 번 돌린다.
- M 리뷰 1라운드(Opus high): 🔴 0, 🟡 2(자동 등록분이 `uninitialized`가 되면 상위 re-root로 직접 추가분이 되고 `FolderFocus`가 나감; `readMarks`가 읽기 실패를 기록 없이 삼킴), ⚪ 3, 사용자 결정 1(결정 8). 수정 1라운드: Opus medium(🟡1이 re-root 경로 판단을 요구), shell.test.ts:718 flaky 관찰도 함께 맡겼다.
- M 수정 1라운드(Opus medium): `4474ab0e..f7d35b90` 4 commits(🟡1·🟡2·⚪1·⚪2). 🔴 0인 상태의 국소 수정이라 재리뷰 없이 받았다. flaky 원인: `shell.store([a, b])`가 첫 `doan ls`를 기다리지 않아 부하 시 `replace` 뒤에 focus 없는 목록 알림이 한 번 더 나가고 `toHaveBeenLastCalledWith`가 그것을 본다(파일 실행 11회 중 2회 실패). 이 feature 밖의 테스트 타이밍 문제라 T4에서 BACKLOG에 적는다.
- M을 cherry-pick했다(`e18fa3d8..b0c9e7d1`). 통합 HEAD `b0c9e7d1`에서 `node .agents/skills/verify/scripts/verify.mjs` PASS(지휘자 실행).
- R2 시작: 새 child worktree `ttw-R2`(기준 `b0c9e7d1`), Opus high.
- R2: 작업자 완료(`acdec449`, `415b1604`). 작업자 보고: `verify.mjs` PASS(app test 6707 pass, flaky 없음). handoff와 commit이 일치하는 것을 지휘자가 확인했다. 열린 항목: origin이 W인 page(Project Settings 등)를 떠나면 Home으로 간다. 리뷰 1라운드: Opus medium.
