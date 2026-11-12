# Git 저장소가 아닌 폴더에서 Keep out of Git — 작업

각 커밋 경계 앞에서 다음을 돌린다.
- `go test ./...`
- `go vet ./...`
- `npm --prefix app run typecheck`
- `npm --prefix app run lint`
- `npm --prefix app test`

Set Up 폼, 설정 패널, Project Settings 확인 창은 새 UI다. 그래서 `/design-draft`로 초안을 그리고 사용자 확인을 받은 다음 `/tdd`로 간다.

1. [ ] **PoC: git init.** design.md 'PoC 의존'을 확인한다.
   - 스크립트는 `.scratch/keep-out-git-init/`에 두고 커밋하지 않는다.
   - 모든 실행은 `mktemp -d` 폴더에서 한다. HOME을 임시 폴더로 둔 경우와 실제 전역 설정을 읽는 경우를 각각 돌린다.
   - 무엇을 확인하나:
     - 미리 `mkdir`한 빈 `.git`에 `/usr/bin/git init --quiet --template=`이 되는지. Homebrew git이 있으면 그것으로도 확인한다.
     - `.git/hooks`가 비었는지.
     - 전역 `init.templateDir`과 `init.defaultBranch`를 어떻게 다루는지.
     - `init.defaultObjectFormat=sha256` 저장소에서 `go run ./cli/cmd/doan ls --json --repo <tmp>`와 `init --storage local`이 동작하는지. 이 확인은 저장소를 `git init`으로 만든 뒤에 한다.
     - `git init`에 걸리는 시간(20회, 중앙값과 최댓값).
   - 확인: 로그가 남고, 결과를 아래 'PoC 결과'에 적는다.
   - 예상과 다른 것이 있으면 멈추고 사용자에게 돌아온다.
     - 빈 `.git`에 init이 안 되면, 임시 형제 폴더에 init한 뒤 rename하는 방식으로 바꿀지 묻는다.
     - sha256 저장소를 읽지 못하면, 거절할지 지원할지 묻는다.
   - 커밋 경계: 문서만.
2. [ ] **초안 (`/design-draft`).** design.md '초안 요청'의 캔버스, 프레임, 상태를 그린다.
   - 확인: `doan check`와 `doan ls`가 통과하고, 사용자가 앱에서 초안을 확인했다.
3. [ ] **형식과 fixture.** design.md '형식 변경'을 반영한다.
   - CLI envelope 스키마의 `error.storageReason`
   - `git_init_failed`: `envelope.go`의 코드 목록과 exit 값, mapping fixture, `formats/types.ts`
   - 소켓 v2 `OnboardingChange`의 `.git/`
   - fixture 두 개
   - 확인: `go test ./...`와 `npm --prefix app test`의 schema·fixture 테스트가 녹색이다.
   - 커밋 경계.
4. [ ] **테스트 먼저 (`/tdd`).** design.md '순수 함수'의 Go·TS 함수와, 아래 셸 동작을 테스트로 고정한다.
   - **Go, 저장소를 만드는 기본 동작**
     - `init`과 `config`에 `--git-init`을 주면 비 Git 폴더에 `.git/`, exclude 쌍, `.doan/`이 생긴다.
     - 플래그가 없으면 `local_not_git`이고, NextSteps에 사람 동의 문장이 있다.
     - `--git-init`과 `--storage repo`를 같이 주거나 `--git-init`만 주면 `usage_error`다.
     - 이미 저장소면 `git init`을 하지 않는다.
     - 상위가 저장소이면 하지 않는다.
   - **Go, HOME**
     - HOME 자체와 그 상위에서는 거절한다.
     - dotfiles 저장소 아래 폴더에는 만든다.
   - **Go, 실패와 경쟁**
     - 가짜 git이 없으면 `git_missing`이고 아무것도 쓰지 않는다.
     - 가짜 git이 실패하면 `git_init_failed`이고 `.git`이 없다.
     - `.git`이 직전에 생겼으면(EEXIST) 거절하고 그 `.git`은 그대로 남는다.
     - 이후 단계가 실패하면 만든 `.git`을 지운다.
     - dev/ino가 다르면 지우지 않는다.
     - 지우기에 실패하면 `cleanup_failed`이고 message에 경로가 있다.
   - **Go, 환경과 경로**
     - 환경에 `GIT_DIR`이 있어도 폴더에 init한다(허용 목록).
     - `.git`이 파일(worktree 연결)이거나 깨진 symlink이면 지금처럼 `git_unreadable`이나 저장소로 판정되고, `git init`을 하지 않는다.
     - `--template=` 뒤 exclude 쓰기가 `info/`를 만든다.
     - 공백과 NFD 유니코드가 든 경로.
     - `ls`의 `repo_not_found`에 `storageReason`이 붙는 경우와 붙지 않는 경우(경로 없음, 다른 명령).
   - **TS**
     - `ls` 파싱, 계획, `initArgs`.
     - Set Up 폼: `notGit`일 때 `.git/` 줄. 보여 준 경우에만 `--git-init`.
     - 설정 패널의 한 줄과 라디오 전환.
     - Project Settings 확인 흐름: 열림, Cancel, Escape, 성공, 실패, 잠금 중 deep link, 열린 사이 Missing·reroot·`storageReason` 사라짐.
     - Include → Keep out → Include 왕복: `.gitattributes`와 `.git`이 유지된다.
     - 같은 폴더 Set Up 반복.
     - 오류 문구 세 개.
   - 확인: 새 테스트만 red다.
   - 커밋 경계: 새 함수는 stub으로 export한다. 그래야 typecheck와 `go vet`이 통과한다.
5. [ ] **Go.** 다음을 구현한다.
   - `ls`와 `find`의 `storageReason`
   - `repo/gitinit.go`: 위치 판정, 환경, 확보, 실행, 되돌리기
   - `Context` 주입
   - `init.go`와 `storage.go`의 `--git-init`
   - `envelope.go`
   - `onboarding.go`의 steps 표
   - `skill.md`
   - 확인: `go test ./...`가 녹색이고 `go vet ./...`가 통과한다. guide 출력 예산 테스트(`skill_test.go`)도 녹색이다.
   - 커밋 경계.
6. [ ] **app main.** 다음 파일을 구현한다.
   - `folderState.ts`, `initArgs`, `plannedChanges`, `projectAdder.ts`
   - `shell.ts`와 `cli.ts`: 인자와 CLI 환경의 PATH·`DEVELOPER_DIR`
   - `configBridge.ts`, `operations.ts`
   - 확인: `npm --prefix app test`가 녹색이다.
   - 커밋 경계.
7. [ ] **renderer.** 다음을 구현한다.
   - `ProjectSetupDialog.tsx`, `Onboarding.tsx`, `storageRules.ts`, `ProjectSettingsPage.tsx`
   - `notGit`을 폼까지 넘기는 경로
   - 첫 구현이므로 `/design-sync`로 2번 초안과 맞춘다.
   - 확인:
     - `npm --prefix app test`가 녹색이다.
     - `node .scratch/design-sync/<screen>/measure.mjs` 측정이 통과한다.
     - `node .agents/skills/verify/scripts/verify.mjs --eval`이 PASS다. onboarding DTO가 바뀌기 때문이다(POSTMORTEM 2026-11-07).
   - 커밋 경계.
8. [ ] **실제 앱 확인 (`/runtime-test`).**
   - 준비:
     - `npm --prefix app run package`로 패키지 앱을 만든다.
     - 격리 조건으로 띄운다. 임시 userData·HOME·SHELL을 쓰고, 가짜 SHELL의 PATH는 실제 git을 찾게 한다.
     - 짧은 probe로 확인한다.
   - 빈 폴더, Set Up 폼, Keep out of Git (완료 조건 1·2):
     - `.git/` 줄이 보인다.
     - Set Up 뒤 `.git/`과 exclude 쌍이 생긴다.
     - `git status`에 `.doan/`이 보이지 않는다.
   - 같은 폴더를 Include in Git으로 Set Up 하면 `.git/`이 생기지 않는다(완료 조건 5).
   - Add Projects 설정 패널과 첫 실행에서 한 번씩 확인한다. 첫 실행은 `doan onboarding project select`로도 한 번 한다(완료 조건 1·3).
   - Project Settings에서 전환한다(완료 조건 4):
     - 확인 창에서 Cancel과 성공을 각각 본다.
     - 성공 뒤 안내 줄과 포커스를 본다.
   - 저장소 판정 경계:
     - 상위가 저장소인 하위 폴더에는 `.git/`이 생기지 않는다(완료 조건 6).
     - 임시 HOME 자체를 Set Up 하면 거절된다(완료 조건 7).
   - CLI를 직접 실행한다(완료 조건 3):
     - `doan init --storage local --git-init`과 `doan config --storage local --git-init`.
     - 플래그가 없을 때의 거절.
   - 테스트로만 확인한 항목:
     - git 없음(완료 조건 8)과 되돌리기(완료 조건 9)는 실제 앱에서 만들 수 없다. 4번 테스트로만 확인했다고 남긴다.
   - 확인: probe 로그가 spec.md 완료 조건 1–9를 위처럼 만족한다.
9. [ ] **에이전트 평가 (`/agent-eval`).** guide(`skill.md`)와 `local_not_git` NextSteps가 바뀌었다.
   - 범위:
     - O4 시나리오(`eval/scenarios/O4/`, `init --storage local`).
     - 비 Git 폴더에서 에이전트가 사람 동의 없이 `--git-init`을 붙이지 않는지 보는 시나리오가 필요하면, 그 추가 여부를 사용자에게 묻는다.
   - 확인: `node eval/run.ts --self-test --scenarios O4`가 `self-test PASS`이고 exit 0이다. 실제 라운드 결과는 `docs/USABILITY-EVAL.md`에 기록한다.
10. [ ] **승격과 삭제.**
    - PRODUCT:
      - §3 Out of scope 6: 예외와 그 조건, "the only Git setting Doan writes" 문장.
      - §5 item 0 'Doan files'.
      - Project Settings 항목: 확인 창, 이유 문장, 잠금 문장, 안내 줄.
      - 에이전트의 `doan init` 설명: `--git-init`과 사람 동의.
    - ARCHITECTURE:
      - §4 'Storage in onboarding'.
      - §7 Clone과 'Storage writes'.
      - §12 'Storage'와 envelope의 `error.storageReason`.
      - §13의 git 명령 문장.
    - DESIGN.md: 초안과 측정값.
    - USABILITY-EVAL: 9번의 결과.
    - `docs/features/keep-out-git-init/`를 삭제한다.
    - 확인: 문서 diff를 검토하고, `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.
    - 커밋 경계: 문서별로 커밋한다.

## PoC 결과

(1번에서 채운다.)
