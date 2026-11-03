# terminal-work-worktrees — tasks

순서: 순수 함수(main·renderer) → main I/O(소켓, 폴더 저장) → UI → 승격. 형식(JSON Schema) 변경은 없다. 보드 안내가 새 UI이므로 `/feature-review` 뒤 `/design-draft`가 `.doan/canvases/terminal-work-worktrees.html`(다른 worktree 작업 안내 + Open, 긴 branch 이름, branch 없음)을 그리고, 사용자가 앱에서 확인한 뒤 `/tdd`로 들어간다.

## T1. main 순수 규칙

- `autoRegisterRoot`, `pruneAuto`, `autoAfterAdd`/`autoAfterRemove`(design §4).
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): rules for auto-registered worktrees`

## T2. main 연결

- `answerLine` v3의 자동 등록 분기와 동시 요청 합치기, deadline(design §2.1), `auto-folders.json` 저장(§2.2), 새로고침의 사라진 자동 등록분 제거와 화면 정리(§2.3), 직접 추가·Remove from Doan에서 자동 표시 해제.
- 테스트: `runtime.test.ts`(token 실패 시 `ls` 없음, `done`은 등록 없음, 다른 저장소 거절), `shell.test.ts`(자동 등록 뒤 목록·focus 이벤트, 사라진 자동 등록분만 제거, 권한 오류는 유지, 재시작 뒤 자동 표시 유지), `folderStore.test.ts`(새 파일 쓰기·읽기, 손상 파일).
- 검증: `npm --prefix app test` green, typecheck 통과.
- **commit 경계**: `feat(app): register a saved repository's worktree on doan work start`

## T3. renderer 안내와 사이드바

- `siblingWork`와 보드 안내 + Open(design §3.1), 프로젝트 행 slot 클릭이 W를 고르는지 확인·수정(§3.2).
- 테스트: `agentIndicator.test.ts`의 `siblingWork` 사례, 안내 컴포넌트 테스트(문구, Open이 W와 캔버스를 고름, 자기 root 작업이 이김), 사이드바 slot 클릭 테스트.
- 검증: `npm --prefix app test` green, typecheck·build 통과. `/runtime-test`: 등록된 repo에 `git worktree add`로 W를 만들고 W에서 `doan work start`(격리된 앱과 그 앱의 CLI·`DOAN_RUNTIME`) → W 자동 등록, 프로젝트 행 스피너, main checkout의 같은 캔버스에 안내, Open으로 W 이동, `done` 뒤 안내 사라짐, W 폴더 삭제 뒤 목록에서 빠짐. `/design-sync`로 안내를 초안과 비교한다.
- **commit 경계**: `feat(renderer): show terminal work from another worktree with Open`

## T4. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`: §3 Out of scope 4의 예외, §5 item 1 'Only registered worktrees appear'와 자동 등록·제거 규칙, item 2 'Terminal work'의 다른 worktree 안내.
- `docs/ARCHITECTURE.md`: §4 'Error codes'(`project_not_open`), 'Dispatch'(v3 자동 등록 순서와 deadline), 'State'; §3 'Shell tree'의 "Git-discovered worktrees are never added" 예외; §7 device-local storage에 `auto-folders.json`; §13.
- `docs/DESIGN.md`: `/design-sync`가 잰 안내 값.
- `docs/BACKLOG.md`: 실제 앱에서 확인하지 못한 표면.
- `docs/features/terminal-work-worktrees/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `rg -n "docs/features/terminal-work-worktrees" docs AGENTS.md` 결과 없음.
- **commit 경계**: 문서별로 나눈다, 마지막에 `docs(feature): remove terminal-work-worktrees documents`.
