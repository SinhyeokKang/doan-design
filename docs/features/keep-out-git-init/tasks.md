# Git 저장소가 아닌 폴더에서 Keep out of Git — 작업

각 커밋 경계 앞에서 `go test ./...`, `go vet ./...`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다. Project Settings의 확인은 새 UI라서 `/design-draft`로 초안을 그리고 사용자 확인을 받은 다음 `/tdd`로 간다.

1. [ ] **PoC: git init과 호환.** design.md 'PoC 의존'을 확인한다. 스크립트는 `.scratch/keep-out-git-init/`에 두고 커밋하지 않는다. 모든 실행은 `mktemp -d` 폴더에서, `HOME`을 임시 폴더로 둔 경우와 실제 전역 설정을 읽는 경우 각각.
   - `/usr/bin/git init --quiet --template=`: `.git/hooks`가 비었는지, `HEAD`의 브랜치가 `init.defaultBranch`를 따르는지, 전역 `init.templateDir`이 무시되는지.
   - 상위 폴더가 저장소인 하위 폴더에서 `doan ls`·`doan init --storage local`의 현재 동작(`not_git`이 아니어야 함).
   - 이전 버전 CLI(`doan onboarding project select`)가 모르는 오류 코드 `git_unavailable`을 받으면 어떻게 나오는지.
   - 확인: 로그가 남고, 결과를 아래 'PoC 결과'에 적는다. 위 셋 중 예상과 다른 것이 있으면 멈추고 사용자에게 돌아온다.
   - 커밋 경계: 문서만.
2. [ ] **초안 (`/design-draft`).** Project Settings의 비 Git 프로젝트에서 Keep out of Git을 고를 때의 확인, 변경 목록의 `.git/` 줄(Set Up 폼, 첫 실행·Add Projects 설정 패널), `git_unavailable` 안내를 `.doan/canvases/`에 그린다.
   - 확인: `doan check`·`doan ls`가 통과하고, 사용자가 앱에서 초안을 확인했다.
3. [ ] **형식과 fixture.** `schema/`에 `repo_not_found` details의 `storageReason`, 오류 코드 `git_unavailable`(CLI와 앱 소켓), 플래그 `--git-init`. Go와 TS가 같이 읽는 fixture 하나.
   - 확인: `go test ./...`와 `npm --prefix app test`의 schema fixture 테스트 녹색.
   - 커밋 경계.
4. [ ] **테스트 먼저 (`/tdd`).** design.md '순수 함수'의 Go·TS 함수와, Go `init`·`config`의 셸 동작: `--git-init`으로 비 Git 폴더에서 `.git/`·exclude·`.doan/`이 생김, 플래그 없으면 `local_not_git`과 NextSteps, `--storage repo`와 함께면 `usage_error`, 이미 저장소면 `git init` 없음, 상위가 저장소면 없음, git 없음이면 `git_unavailable`이고 아무것도 없음, 직전에 `.git`이 생기면 거절, 이후 단계 실패면 만든 `.git` 지움. TS: `ls` 파싱, 계획, `initArgs`, Project Settings 확인 흐름, `git_unavailable` 문구.
   - 확인: 새 테스트만 red. 커밋 경계: 새 함수는 stub으로 export해 typecheck와 `go vet`이 통과하는 상태로 커밋.
5. [ ] **Go.** `ls` details, `repo/gitinit.go`(위치 판정·실행), `init.go`·`storage.go`의 `--git-init`과 되돌리기, `envelope.go`, `skill.md`.
   - 확인: `go test ./...` 녹색, `go vet ./...` 통과.
   - 커밋 경계.
6. [ ] **app main.** `folderState.ts`, `initArgs`, `plannedChanges`, `projectAdder.ts`, `shell.ts`, `configBridge.ts`, `operations.ts`.
   - 확인: `npm --prefix app test` 녹색.
   - 커밋 경계.
7. [ ] **renderer.** 변경 목록의 `.git/`, `git_unavailable` 안내, `storageRules.ts`, Project Settings 확인. 첫 구현이므로 `/design-sync`로 2번 초안과 맞춘다.
   - 확인: `npm --prefix app test` 녹색, `node .scratch/design-sync/<screen>/measure.mjs` 측정 통과, `node .agents/skills/verify/scripts/verify.mjs --eval` PASS(onboarding DTO가 바뀌므로, POSTMORTEM 2026-11-07).
   - 커밋 경계.
8. [ ] **실제 앱 확인 (`/runtime-test`).** 패키지 앱을 격리 조건(임시 userData·HOME·SHELL)으로 띄우고 짧은 probe로 확인한다.
   - 빈 폴더 Set Up(Keep out of Git): 변경 목록에 `.git/`, Set Up 뒤 `.git/`과 exclude 쌍, `git status`에 `.doan/`이 안 보임.
   - 같은 폴더 Include in Git: `.git/` 없음.
   - Add Projects 설정 패널과 첫 실행 각각 한 번.
   - Project Settings: Include in Git으로 Set Up 된 비 Git 프로젝트에서 전환과 확인.
   - 상위가 저장소인 하위 폴더: `.git/` 없음.
   - git 없음은 실제로 만들 수 없으므로 Go 테스트로만 확인했다고 남긴다.
   - 확인: probe 로그가 spec.md 완료 조건 1–7을 만족한다.
9. [ ] **승격과 삭제.**
   - PRODUCT §3 Out of scope 6: `git init` 예외(조건 포함).
   - PRODUCT §5 item 0 'Doan files'와 Project Settings 항목: 비 Git 폴더의 Keep out of Git, Project Settings 확인, `--git-init`.
   - ARCHITECTURE §7 Clone("the only git onboarding runs"), 'Storage writes', §12 'Storage', §13의 "The only Git command Doan runs".
   - DESIGN.md: 확인과 `.git/` 줄의 측정값.
   - `docs/features/keep-out-git-init/`를 삭제한다.
   - 확인: 문서 diff 검토, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계: 문서별 커밋.

## PoC 결과

(1번에서 채운다.)
