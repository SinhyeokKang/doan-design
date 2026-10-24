# projects-home — 작업 순서

앞선 단계: `/feature-review` → `/design-draft`(홈, 카드 상태, 추가 체크 목록, 워크트리 제안, 토스트, 작업공간 상단 바를 `design/projects-home.html`에 그림) → 사용자가 앱에서 초안 확인 → 아래 작업.

`/design-draft`는 Sorcerer(github.com/gbrasil720/sorcerer, MIT — 2026-10-22 테마 결정의 레퍼런스)의 프로젝트 목록·추가·내비게이션 화면을 저장소에서 직접 확인해 참고하고, 참고한 화면과 파일을 초안 노트에 출처로 적는다(사용자 요청 2026-10-24).

## 순수 함수

1. Go git 해석 순수 함수: `parseGitFile`, `parseHead`, `parseCommondir`, `worktreeRoots` (`cli/internal/repo` 아래).
   - 확인: `go test ./...` — 디렉터리 `.git`, `gitdir:` 파일, 상대·절대 commondir, detached(40·64자리), 잘못된 줄, 중복 워크트리가 녹색.
2. `folders.insertAt`, `folders.replaceAt`.
   - 확인: `npm --prefix app test` — 중복 경로, 범위 밖 index, 이미 있는 경로가 녹색.
3. `groupProjects`, `cardRow`, `latestChange`, `classifyPick`, `toastState`.
   - 확인: `npm --prefix app test` — 저장 순서 유지, 같은 common dir 묶음, 비 git 프로젝트 단독 카드, 상태 표 5종, 하위 폴더 → 루트, 상위 폴더 → scan 판정이 녹색.

— 커밋 경계 A: `feat(app): pure helpers for project home grouping` (+ `feat(cli): pure git worktree parsing`)

## CLI (I/O)

4. `doan ls`가 `result.git`을 채운다(`lstat`, 4 KiB·200개 상한, realpath, 실패 시 생략). ARCHITECTURE §12에 옮길 결과 모양 메모를 남긴다.
   - 확인: `go test ./...` + `go vet ./...` — 테스트 준비에서만 `git init`·`git worktree add`로 만든 픽스처(CLI 코드는 git을 실행하지 않음)로 main 체크아웃·linked worktree·detached·비 git·끊어진 `gitdir`·루프·`ENOTDIR`이 녹색. MCP `ls`가 같은 결과를 돌려주는 테스트 녹색.
5. `/agent-eval`(`npm --prefix app run package` 후 `node eval/run.ts`): `ls` 출력 변경 뒤 새로운 실패가 없음. 라운드를 `docs/USABILITY-EVAL.md`에 기록.

— 커밋 경계 B0: `feat(cli): report git worktree info in doan ls`

## main (I/O)

6. `FolderEntry.git`(CLI 결과 전달)·`changedAt`(캔버스 mtime) 채우기.
   - 확인: `npm --prefix app test` + `npm --prefix app run typecheck` 통과.
7. 추가 흐름: `folders:add`(여러 폴더 선택), `folders:add-paths`(경로 검증), 3a/3b 판정(`.git` 존재만 `lstat`), 하위 후보마다 `doan ls --repo` 호출, `git.worktrees`로 워크트리 제안 데이터.
   - 확인: `npm --prefix app test` — 상위 폴더는 저장되지 않음, doan 설정 여부는 CLI 결과로만 표시, 파일 경로는 버려짐이 녹색.
8. 제거·복구 IPC: `folders:remove`(카드 단위 포함), `folders:restore`, `folders:locate`, `folders:reveal`. 메뉴 Add Project…(⌘O), Go to Home(⇧⌘H).
   - 확인: `npm --prefix app test` — 저장 목록에 없는 경로는 거부되고, restore는 원래 index로 돌아오는 것이 녹색. 발신자 프레임 검사 테스트 녹색.

— 커밋 경계 B: `feat(app): project add, remove, restore and locate in main`

## UI

9. renderer 화면 상태(home | workspace)와 작업공간 상단 바(←, 저장소 이름, 브랜치 전환기). 사이드바는 현재 루트만 받는다. 홈으로 가도 작업공간은 언로드하지 않는다.
   - 확인: `npm --prefix app test`(App·Sidebar 단위) + `npm --prefix app run e2e` 기존 runtime·comments-ui·onboarding 단계가 홈 → 작업공간 진입을 거쳐 PASS.
10. `Home`, `ProjectCard`(상태 표, … 메뉴), `AddProjectsDialog`, `WorktreeOfferDialog`, `Toast`, 드롭 영역(preload `getPathForFile`).
   - 확인: `npm --prefix app run e2e`에 새 단계 추가 — 워크트리 두 개가 카드 하나에 브랜치 두 줄로 보임, 상위 폴더 → 체크 목록 → 고른 것만 추가, Remove → 토스트 → Undo가 원래 자리로 복원, Missing → Locate…, Config error → Show in Finder 호출(main에서 `shell.showItemInFolder` 스텁으로 확인), real-state 불변, 최종 `runtime-test: PASS`와 exit 0.
   - 실제 Finder 드래그 앤 드롭은 Playwright로 재현할 수 없으면 `/runtime-test` 보고서에 "수동 확인 필요"로 남긴다(명령 미정 — 사용자 확인 필요).
11. `/design-sync`: `design/projects-home.html`과 구현을 computed style로 비교하고 `docs/DESIGN.md`에 기록한다.
   - 확인: `/design-sync` 절차의 비교 표에 남은 불일치가 없거나 문서화되어 있음.

— 커밋 경계 C: `feat(app): home screen and project workspace shell`

## 마무리

12. `/runtime-test`, `/code-review`, `/refactor`. `npm --prefix app run typecheck`, `npm --prefix app test`, `npm --prefix app run e2e` 모두 통과.
13. 승격: 결론을 `docs/PRODUCT.md`(§5 MVP 앱 항목 1·3, 기능 분할 표에 이 기능 행 추가, §7 결정 로그에 결정 1~4와 Q1, 대체된 결정)와 `docs/ARCHITECTURE.md`(§7 화면 구조·IPC·메뉴, §12 `doan ls` 결과의 `git`, §13 추가 흐름·git 해석)에 영어로 옮기고 `docs/features/projects-home/`를 지운다.
    - 확인: `grep -n 'projects-home' docs/PRODUCT.md docs/ARCHITECTURE.md`에 날짜가 붙은 항목이 있고, `docs/features/projects-home/`가 없음.

— 커밋 경계 D: `docs: promote projects-home decisions`
