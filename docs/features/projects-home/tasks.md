# projects-home — 작업 순서

## 앞선 단계

`/feature-review`(완료 2026-10-25) → `/design-draft` → 사용자가 앱에서 초안 확인 → 아래 작업.

- `/design-draft`는 `design/projects-home.html`에 다음을 그린다: 홈(빈 상태 포함), 카드·줄 상태 표, 체크 목록(스캔 진행·Already added·워크트리 하위 항목), 폴더 설정 확인, 토스트, 드롭 오버레이, 작업공간 상단 바·워크트리 전환기·상태 줄.
- **Codex와 Claude가 같은 요청으로 각자 초안을 그린다.** Codex 워커는 공정성을 위해 `gpt-6-astra` reasoning high로 띄운다. 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분이 있으면 고른 초안에 붙인다. 고른 근거와 가져온 부분을 초안 노트에 적는다(사용자 요구 2026-10-25, 이 단계에 한해 모델 경계를 넘어도 된다).
- 레퍼런스: Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본으로 본다. 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스도 직접 확인한다. 참고한 화면과 파일은 초안 노트에 출처로 적는다(사용자 2026-10-24·25).

## 순수 함수

1. Go git 해석 순수 함수: `parseGitFile`, `parseHead`, `parseCommondir`, `isMainWorktree`, `worktreeGitdirs`, `mapWorktrees`, `ignoreAtOrAboveHome`(`cli/internal/repo` 아래).
   - 확인: `go test ./...` — 다음 입력이 녹색이다.
     - 디렉터리 `.git`, `gitdir:` 파일(절대·상대 경로), commondir 있음·없음(submodule)
     - main 판정: 일반 저장소, bare, submodule, separate-git-dir
     - HEAD: 브랜치, detached 40·64자리, `refs/heads/` 밖의 ref, placeholder
     - CRLF·끝 개행, 4 KiB 초과, 중복·잘못된 gitdir 줄, 200개 초과
     - 모노레포 `rel` 매핑, 홈과 그 위 무시

— 커밋 경계 A1: `feat(cli): pure git worktree parsing`

2. `folders.insertAt`, `folders.replaceAt`.
   - 확인: `npm --prefix app test` — 중복 경로, 범위 밖 index, 이미 있는 경로가 녹색.
3. `groupProjects`, `cardRow`, `classifyPick`, `scanCandidates`, `latestChange`, `toastState`, `menuState`, `switchTarget`.
   - 확인: `npm --prefix app test` — 다음이 녹색이다.
     - 묶음: 저장 순서 유지, 같은 `common` 묶음, 기억한 `common`으로 문제 상태 줄 유지, 비 git 단독 카드
     - 상태 표 5종, Open·Selected 표시
     - 판정: 하위 폴더 → 루트, `.git` 있는 폴더 → Not set up, 저장소를 담은 폴더 → scan, 그 밖 → confirm, 이미 저장됨 → duplicate
     - 후보 상태 4종과 기본 체크(워크트리 하위 항목은 체크 해제)
     - 토스트 교체·일시정지·만료
     - 화면별 메뉴 활성 표
     - 워크트리 전환 대상(같은 canvas id → 기억 → 없음)

— 커밋 경계 A2: `feat(app): pure helpers for project home`

## CLI (I/O)

4. `doan ls`가 `result.git`을 채운다. 위로 찾기, 4 KiB·200개 상한, realpath·디스크 표기, prunable 제외, 실패하면 생략한다. `Context`에 홈 값을 더한다. ARCHITECTURE §12에 옮길 결과 모양 메모를 남긴다.
   - 확인: `go test ./...` + `go vet ./...` — 다음이 녹색이다.
     - 손으로 만든 파일 레이아웃 픽스처(기본): main 체크아웃, linked worktree, detached, 비 git, 끊어진 `gitdir`, 루프, `ENOTDIR`, 모노레포, 홈 dotfiles
     - 실제 `git init`·`git worktree add` 픽스처(보조): `exec.LookPath("git")`가 실패하면 skip한다. 격리된 HOME에서 `-c user.name=… -c user.email=…`로 커밋한다. CLI 코드는 git을 실행하지 않는다.
     - MCP `ls`가 같은 결과를 돌려준다.
5. `/agent-eval`: `npm --prefix app run package` 후 `node eval/run.ts`.
   - 확인: `ls` 출력이 바뀐 뒤에도 기존 시나리오에 새로운 실패가 없다. 라운드를 `docs/USABILITY-EVAL.md`에 기록한다.

— 커밋 경계 B1: `feat(cli): report git worktree info in doan ls`

## main (I/O)

6. `FolderEntry.git`(CLI 결과 전달), 경로별 마지막 `common` 기억, `CanvasRow.mtimeMs`와 `changedAt`, 창 포커스 시 다시 읽기(60초 스로틀). sandbox preload에서 `webUtils.getPathForFile`이 되는지 먼저 확인한다.
   - 확인: `npm --prefix app test` — ls와 stat 사이에 지워진 캔버스는 값이 비고, 스로틀은 가짜 시계로 확인한다. `npm --prefix app run typecheck` 통과.
7. 추가 흐름: `folders:add`(여러 폴더 선택), `folders:add-paths`(검증), `folders:scan`·`scan-cancel`·`add-candidates`(불투명 ID, 동시 실행 4, 진행 이벤트), `folders:confirm-folder`.
   - 확인: `npm --prefix app test` — 다음이 녹색이다.
     - 상위 폴더 자체는 저장되지 않는다.
     - doan 설정 여부는 CLI 결과로만 정해진다.
     - 파일·상대 경로·비문자열·33개 이상은 거부된다.
     - 자식 200개 초과, 숨김 폴더 제외, 심볼릭 링크 자식은 따라가지 않는다.
     - 자식 `doan ls`가 없거나 타임아웃이면 "Couldn't read"로 표시된다.
     - Cancel하면 남은 실행이 끝난다.
     - 발급하지 않은 ID는 거부된다.
     - 마법사의 `openFolder()` 계약이 그대로다.
8. 제거·복구 IPC: `folders:remove`(가드, 카드 단위), `folders:restore {removalId}`, `folders:locate`, `folders:reveal`. 메뉴: File > Add Project…(⌘O, 숨긴 창이면 보이고 대화상자), Edit > Undo Remove(토스트 동안), Go > Home(⇧⌘H), 화면별 활성 갱신.
   - 확인: `npm --prefix app test` — 다음이 녹색이다.
     - 저장 목록에 없는 경로와 만료된 `removalId`는 거부된다.
     - restore는 원래 index로 돌아가고 새 서버 키를 받는다.
     - 가드에서 취소하면 아무것도 지워지지 않는다.
     - 발신자 프레임 검사.
     - 메뉴 항목 이름과 가속키를 고정한다(`app/src/main/index.test.ts`).

— 커밋 경계 B2: `feat(app): project add, scan, remove, restore and locate in main`

## UI

9. renderer 화면 상태(home | workspace)와 최소 홈 목록(줄 클릭 → 작업공간), 작업공간 상단 바(←, 브레드크럼, 워크트리 전환기), 작업공간 숨기기(`visibility: hidden` + `inert`), 루트별 마지막 캔버스·보기 메모리. 사이드바는 현재 루트만 받는다. 기존 e2e를 최소 홈 → 작업공간 진입을 거치도록 고친다.
   - 확인: `npm --prefix app test`(App·Sidebar) + `npm --prefix app run e2e`. runtime.ts 전체(anchors → comments-ui → onboarding 포함)가 최종 `runtime-test: PASS`와 exit 0으로 끝난다.
10. `Home`(빈 상태, 카드·줄 상태, Open·Selected 표시, 줄 메뉴·카드 메뉴·우클릭), `AddProjectsDialog`, `SetUpFolderConfirm`, `Toast`, `DropOverlay`, 작업공간 상태 줄, 포커스 규칙.
    - 확인: `npm --prefix app run e2e`에 새 단계를 더한다. 메뉴는 `menu(app, …)`로 부른다(Playwright 키는 네이티브 가속키에 닿지 않음 — PRODUCT §6 PoC 1 항목 4). 확인할 동작:
      - 빈 홈
      - 워크트리 두 개와 모노레포가 각각 카드 하나에 줄 두 개로 보인다. detached 줄, 비 git 줄.
      - 상위 폴더 → 체크 목록(Already added 비활성, 워크트리 하위 항목 체크 해제) → 고른 것만 추가된다.
      - 저장소가 아닌 빈 폴더 → 확인 → Not set up → 설정 폼.
      - 이미 저장된 폴더를 다시 추가하면 그 카드가 강조된다.
      - Remove → 토스트 → Undo가 원래 자리로 되돌린다. Edit > Undo Remove도 같다.
      - 숨긴 작업공간에 초안이 있을 때 Remove → 가드 문구에 프로젝트·캔버스 이름 → Keep writing이면 그 작업공간으로 돌아간다.
      - 홈 ↔ 작업공간을 오가도 캔버스·보기·초안·`doan active` 선택이 남는다. 홈 줄에 Selected 표시가 있다.
      - 워크트리 전환 → 같은 canvas id가 열리고, 가드가 뜬다.
      - Missing → Locate…
      - Config error → Show in Finder(main `shell.showItemInFolder` 스텁) → Details
      - CLI error → Retry
      - 로드된 작업공간의 폴더를 지우면 상태 줄이 뜨고, 홈으로 튕기지 않는다.
      - 모달을 닫으면 원래 줄로 포커스가 돌아간다.
      - real-state 불변. 최종 `runtime-test: PASS`, exit 0.
    - 실제 Finder 드래그 앤 드롭: Playwright로 재현할 수 없으면 `/runtime-test` 보고서에 "수동 확인 필요"로 남긴다(명령 미정 — 사용자 확인 필요). `folders:add-paths`는 e2e로 확인한다.
11. `/design-sync`: `design/projects-home.html`과 구현을 computed style로 비교하고 `docs/DESIGN.md`에 기록한다.
    - 확인: 비교 표에 남은 불일치가 없거나 문서화되어 있다. 이어서 `npm --prefix app run e2e`가 최종 `runtime-test: PASS`와 exit 0.

— 커밋 경계 C: `feat(app): home screen and project workspace shell`

## 마무리

12. `/runtime-test`, `/code-review`, `/refactor`(회귀를 고쳤으면 `/postmortem`). `npm --prefix app run typecheck`, `npm --prefix app test`, `npm --prefix app run e2e`, `go test ./...` 모두 통과.
13. 승격: 결론을 영어로 옮기고 `docs/features/projects-home/`를 지운다.
    - `docs/PRODUCT.md`: §5 앱 항목 1·3, 기능 분할 표에 이 기능 행, §7 결정 로그. 결정 로그에는 결정 1~4, Q1, R1·R2·R3·R6, Codex·Claude 초안 비교 방식, design.md '결정 영향'의 대체 목록을 넣는다.
    - `docs/ARCHITECTURE.md`: §7 화면 구조·메모리 모델·IPC·메뉴·토스트, §12 `doan ls` 결과의 `git`, §13 추가 흐름·git 해석·"`.git` is not consulted" 수정.
    - 확인: `grep -nE '^\| 2026-.*(projects-home|Home)' docs/PRODUCT.md`에 결정 행이 있고, `grep -n 'git' docs/ARCHITECTURE.md`에 §12 `git` 필드 설명이 있으며, `docs/features/projects-home/`가 없다.

— 커밋 경계 D: `docs: promote projects-home decisions`
