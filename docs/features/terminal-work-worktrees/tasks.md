# terminal-work-worktrees — tasks

순서: 순수 함수(main·renderer) → main 저장·폴더 → main 소켓 → UI → 승격. 형식(JSON Schema) 변경은 없다. 보드 안내가 새 UI이므로 `/feature-review` 뒤 `/design-draft`가 `.doan/canvases/terminal-work-worktrees.html`(다른 worktree 작업 안내 + Open, 긴 branch 이름, branch 없음)을 그리고, 사용자가 앱에서 확인한 뒤 `/tdd`로 들어간다.

## T1. 순수 규칙

- main: `autoRegisterRoot`, `pruneAuto`, `autoAfterAdd`(design §4).
- renderer: `siblingWork`(design §3.1), W 소멸 도착지 함수(design §3.4).
- 테스트: design §4 표의 사례 전부. `siblingWork`는 `agentIndicator.test.ts`에 둔다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): rules for auto-registered worktrees`

## T2a. main 저장과 폴더

- `auto-folders.json` 저장(쓰기 순서, 직렬화, 손상 파일, `folders.json`을 제대로 읽었을 때만 정리; design §2.2).
- shell `adopt(root, view)`: 목록 추가, 자동 표시, `folder.common` 채우기, `list` 항목 바로 알리기(design §2.1-4).
- `readFolder`의 errno, 사라진 자동 등록분을 `notFound` 없이 제거(watcher 경로 포함), 자동 등록분 플래그를 entries에 싣기(design §2.3, §3.3).
- 제거를 `index.ts`의 `folders:remove`와 같은 정리 경로로 보내기(selection, `thumbs.removed`, `retainWorkRoots`).
- 직접 추가(`store`, `duplicate`, `existing`, 온보딩 `ProjectAdder`)와 Locate·Set Up re-root에서 자동 표시 해제.
- 테스트:
  - `folderStore.test.ts`: 새 파일 쓰기·읽기, 손상 파일은 표시 없음, 먼저 시작한 쓰기가 나중에 끝나도 이기지 않음, `folders.json`을 읽지 못하면 표시를 정리하지 않음.
  - `shell.test.ts`: `adopt` 뒤 W가 `list` 항목으로 바로 알려지고 `loading`·별도 group이 없음; 자동 등록·자동 제거는 목록만 보내고 `FolderFocus`는 보내지 않음; 자동 등록분 삭제 → `notFound` 항목이 한 번도 나가지 않음(watcher 경로 포함); `EACCES`·`uninitialized`는 지우지 않음; 직접 추가분은 지금처럼 `notFound`; 재시작 뒤 자동 표시 유지; `duplicate`·`existing`에서 표시 해제.
  - main 연결 테스트: W에 selection을 둔 뒤 W를 지우면 `doan active`의 selection이 비고 thumbnail이 정리됨.
- 검증: `npm --prefix app test` green, typecheck 통과.
- **commit 경계**: `feat(app): store and prune auto-registered worktrees`

## T2b. main 소켓

- `answerLine` v3의 자동 등록 분기(design §2.1): `result.root` 일치, `git.worktrees` 판단, `ls` 뒤 재비교, 동시 `start` 합치기, 등록된 root가 없으면 `ls` 생략, 1.5초 타이머, 늦은 적용, 진행 중 등록에 온 `done`, `workState.roots`에 W를 넣은 뒤 work 적용, `RuntimeState`의 비동기 멤버.
- 테스트(`runtime.work.test.ts`): token 실패 시 `ls` 없음; `done`은 등록 없음; 다른 저장소·같은 checkout의 다른 doan root·`uninitialized` W는 거절; `result.root` ≠ 요청 root는 거절; 같은 root 동시 `start`는 `ls` 한 번; `ls`를 붙잡은 채 Remove from Doan → 등록 없음; 기한 초과 → `project_not_open` 뒤 등록과 work 적용; 진행 중 등록에 온 `done`은 등록 뒤 적용되어 스피너가 남지 않음; 응답이 `ok:true`면 work가 실제로 적용됨.
- 검증: `npm --prefix app test` green, typecheck 통과.
- **commit 경계**: `feat(app): register a saved repository's worktree on doan work start`

## T3. renderer 안내, 숨김, 이동

- 보드 안내 + Open(design §3.1), 자동 등록분 숨김(§3.3), 보던 W가 사라지거나 숨겨질 때의 이동과 직전 선택 기억(§3.4).
- 테스트:
  - 안내 컴포넌트: 문구와 accessible name, Open이 W와 캔버스를 고르고 기록에 방문 하나, Back으로 R의 캔버스, 자기 root 작업이 이김, R의 캔버스에 glow·dot field 없음, 안내가 사라질 때 focus가 캔버스 영역으로 감, 나타날 때 focus를 가져가지 않음.
  - App 테스트: 자동 등록 뒤 화면·선택된 worktree·Back/Forward가 그대로임; focus 이벤트 없이 W가 목록에서 빠질 때 W의 캔버스·Overview·Project Settings 각각의 도착지, W의 기억한 캔버스가 지워짐(POSTMORTEM 2026-11-03); 자동 등록분이 `list`가 아니면 목록·문제 행·Home 카드에 없음.
  - `App.terminalWork.test.tsx`: "an expanded project that is not loaded opens its terminal slot's canvas"를 넓혀 클릭 뒤 선택된 worktree가 W임을 확인; work가 W의 첫 목록보다 먼저 오면 W가 경로를 목록에 올린 뒤 스피너가 뜸.
- 검증: `npm --prefix app test` green, typecheck·build 통과.
- `/runtime-test`(격리된 앱과 그 앱의 CLI·`DOAN_RUNTIME`): 등록된 repo에 `git worktree add`로 W를 만들고 W에서 `doan work start` → W 자동 등록(별도 카드 없음), 프로젝트 행 스피너, 스피너 클릭으로 W 선택, main checkout의 같은 캔버스에 안내, Open으로 W 이동, Back으로 복귀, `done` 뒤 안내 사라짐, 재시작 뒤 W 유지, W 폴더 삭제 → 목록 변화를 기다린 뒤 W가 빠지고 보던 화면이 직전 worktree로 감(Missing 줄 없음).
- `/design-sync`로 안내를 초안과 비교한다.
- **commit 경계**: `feat(renderer): show terminal work from another worktree with Open`

## T4. 문서 승격과 feature 디렉터리 삭제

- 마지막 통합 전에 `/agent-eval`을 돌린다(AGENTS.md 'Workflow'). W3b와 H7은 영향이 없을 것으로 본다(design §5).
- `docs/PRODUCT.md`: spec '바뀌는 PRODUCT·ARCHITECTURE 결정'의 PRODUCT 항목(§3 Out of scope 4, §5 item 1·2·10).
- `docs/ARCHITECTURE.md`: 같은 목록의 ARCHITECTURE 항목(§3 'Shell tree', §4 'Terminal work over app-socket v3'의 'Dispatch'·'Best effort'·'State', §12 `project_not_open`, §7·§11 `auto-folders.json`).
- `docs/DESIGN.md`: `/design-sync`가 잰 안내 값.
- `docs/BACKLOG.md`: 자동 등록분 누적과 worktree별 제거 없음(spec 결정 6), 실제 앱에서 확인하지 못한 표면.
- `docs/features/terminal-work-worktrees/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 문서 전용 확인으로 `rg -n "terminal-work-worktrees" docs AGENTS.md .agents app cli eval` 결과가 없다(`rg`는 AGENTS.md 'Commands'에 없는 대상 확인용 명령이다).
- **commit 경계**: 문서별로 나눈다, 마지막에 `docs(feature): remove terminal-work-worktrees documents`.
