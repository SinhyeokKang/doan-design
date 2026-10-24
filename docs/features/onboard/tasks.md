# onboard — tasks

순서: 결정 기록 → PoC 7 게이트 → (여기부터 `feat-onboard`) 초안(게이트) → CLI → 순수 함수 → main(CLI 찾기 · 패키지) → main(폴더 · 3단계) → main(온보딩 · e2e 격리) → renderer → e2e → `/design-sync` → 실사용 관찰과 skill 본문 → 패키지된 앱 확인 → 승격.

- 브랜치(2026-10-24 사용자): task 0 · 1은 문서만 바꾸므로 main에서 커밋하고 push한다. task 2부터는 `/orchestrate`가 main에서 만든 `feat-onboard` 브랜치에서 하고, push와 PR로 끝낸다(병합하지 않는다).
- `── commit ──`은 커밋 경계다. 코드 경계는 `test:`(red) + `feat:` 한 쌍으로 나눠도 된다.
- 각 코드 경계에서 해당 언어의 테스트와 정적 검사(`go test ./...` · `go vet ./...`, `npm --prefix app test` · `npm --prefix app run typecheck`)가 통과해야 한다.
- `app/`을 바꾼 경계는 `npm --prefix app run e2e`도 자체 최종 `runtime-test: PASS`와 exit 0으로 끝나야 한다(AGENTS.md `/runtime-test`).
- 모든 자동 검증은 design.md '테스트 격리'의 환경을 쓴다. 작업 앞뒤로 spec 완료 조건 12의 키 단위 목록을 비교해 같아야 한다.

## 0. 분할 결정 기록 (main)

- PRODUCT §5 'Feature split' 표를 바꾼다.
  - #8은 `onboard`로 바꾼다(첫 실행 네 단계 마법사, 번들 CLI, 서명 없는 로컬 `.app`, `doan skill` 본문 다듬기).
  - #9 `dist`를 더한다(Developer ID 서명 · 공증 dmg, brew cask, electron-updater, Releases CI, x64/universal, `docs/OPERATIONS.md`). #9는 앱 전체 사이클 완성도 작업 뒤로 미룬다고 적는다.
- PRODUCT §7에 2026-10-24 결정 줄을 더한다. 내용은 분할과 근거(비공개 저장소, 서명 인증서 없음, 라이선스 미정, 사용자 "배포 관련은 다 뒤로 미뤄"), 그리고 로컬 `.app`을 남기는 이유다. §7의 과거 줄은 그대로 둔다.
- AGENTS.md 'Documents' 표에서 `docs/OPERATIONS.md`를 맡는 기능을 "feature 8 `onboard-dist`"에서 #9 `dist`로 바꾼다.
- ARCHITECTURE의 `#8` 언급(§6 본문 다듬기, §8 build/release settings, §13 bundled path)과 `app/src/main/cli.ts`의 주석은 task 13에서 바꾼다.
- 검증: `grep -n "onboard-dist" docs/PRODUCT.md AGENTS.md`에 남은 줄이 분할을 설명하는 새 줄과 §7의 과거 줄뿐이다. `grep -n "dist" docs/PRODUCT.md`에 #9 행이 있다.

── commit (`docs(product): split onboard-dist into onboard and dist`) ──
── commit (`docs(agents): move OPERATIONS.md to the dist feature`) ──

## 1. PoC 7 (게이트, main)

- PRODUCT §6 표에 PoC 7 행(7a~7d, design.md 'PoC 의존'의 기준)을 더한다.
- `.scratch/onboard/poc7/`에서 7a~7d를 확인한다. 모두 design.md '테스트 격리'의 환경에서 돌리고, 쓴 환경 변수를 기록한다. 격리할 수 없는 항목은 실행하지 않고 사용자에게 묻는다. Codex 실행은 사용자 허락을 받은 뒤에 한다(모델 경계).
- 7d는 electron-builder를 `.scratch/` 안에만 설치해 확인한다. `app/package.json`은 아직 바꾸지 않는다.
- 7c의 실제 읽기 출력은 격리된 설정에서 만든 것만 `.scratch/onboard/poc7/`에 남긴다. task 4가 그것을 `app/src/main/onboarding/fixtures/`로 옮겨 커밋한다.
- 검증: PRODUCT §6 'Results'에 결과가 있다(통과 여부, 관찰, 날짜, 버전, 잰 시간). 실제 사용자 상태의 키 단위 비교가 같다. 하나라도 기준을 넘지 못하면 멈추고 사용자에게 묻는다.

── commit (`docs(product): PoC 7 onboarding results`) ──

## 2. 초안 (게이트, `feat-onboard`)

- design.md '초안 요청'대로 `/design-draft`로 `design/onboard.html`을 그린다.
- 사용자가 앱에서 초안을 보고 확정한다. 첫 문장 문구와 앱 이름 표기(`doan`)도 이때 확정한다.
- 검증:
  - `go run ./cli/cmd/doan check --json --repo .`에 오류가 0이다. `mock.css`의 `hardcoded_color` 경고만 허용한다.
  - `go run ./cli/cmd/doan ls --json --repo .`에 canvas id `onboard`와 프레임 id 8개(`wizard-cli`, `wizard-agents`, `wizard-project`, `wizard-prompt`, `confirm-replace`, `sidebar-setup`, `project-setup-dialog`, `sidebar-first-prompt`)가 모두 있다.

── commit (`docs(design): onboard draft`) ──

## 3. CLI — `doan init --token-css` 절대 경로

- `repo`에 새 helper를 두고 `Init`이 절대 경로일 때 먼저 그것을 거치게 한다. 스키마 검사는 바꾼 상대 경로로 한다.
- MCP `init` 도구의 `tokenCss` 설명(`mcp.go`)과 `skill.md`의 `--token-css` 설명을 고친다.
- 경계 사례: design.md 'Go helper' 항목 전부, 그리고 MCP `init`에 절대 `tokenCss`를 주는 경우.
- 검증:
  - `go test ./...` · `go vet ./...`가 통과한다.
  - 임시 저장소 `<tmp>`(mktemp, `/var/...`)에 `<tmp>/a/tokens.css`를 만든다. `go run ./cli/cmd/doan init --json --repo <tmp> --token-css /private<tmp>/a/tokens.css`가 `ok`이고, `.doan/config.json`의 `tokenCss`가 `a/tokens.css`다.
  - 저장소 밖에 실제로 만든 `<tmp2>/outside.css`를 주면 exit 2 `usage_error`다.

── commit (`feat(cli): accept absolute token css paths inside the repo`) ──

## 4. 순수 함수 (TS)

- design.md '순수 함수로 떼어 낼 부분'의 TS 함수 전부. 위치는 `app/src/main/onboarding/states.ts`(+ `states.test.ts`), `app/src/main/cli.ts`(+ `cli.test.ts`), `app/src/main/folderState.ts`(+ 테스트), `app/src/renderer/onboardingView.ts`(+ `onboardingView.test.ts`)다.
- PoC 7 출력을 `app/src/main/onboarding/fixtures/`로 옮긴다. 사용자 경로나 다른 서버 정보가 없는지 확인한 뒤 옮긴다.
- 경계 사례는 다음과 같다.
  - 링크 · 스텁: 깨진 링크, 상대 링크 값, `SKILL.md` 자체가 링크 · 디렉터리, 부모(`~/.local/bin` · `~/.claude/skills`)가 파일이거나 링크(`ENOTDIR`), 다른 대소문자의 같은 경로
  - PATH: 빈 항목, 끝 슬래시, `~` 미확장 항목
  - 셸 탐지 출력: 잡음, nonce 없음, 빈 출력
  - `mcpState`: 범위가 다른 등록
  - `initOutcome`: `invalid_config`, 시간 초과, spawn 오류, `initialized: false`
  - `reconcileFolders`: 같은 루트 합치기와 순서, 한 읽기에서 두 하위 폴더가 같은 루트로 재루팅되는 경우, 위쪽 저장소의 깨진 설정, 대소문자만 다른 표기
  - `isTranslocated`, fish의 `rcFileFor`
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과.

── commit (`feat(app): onboarding pure helpers`) ──

## 5. main — CLI 찾기와 로컬 패키지

- `cliCommand`를 design.md 흐름 1대로 바꾼다.
- `app/package.json`에 다음을 더한다.
  - `version` `0.1.0`, `productName` `doan`
  - electron-builder 설정(appId `design.doan.app`, `extraResources`의 `bin/doan`)
  - `package` 스크립트(흐름 2)

  electron-builder는 정확한 버전으로 devDependency에 넣는다(`npm --prefix app install --save-exact --save-dev electron-builder@<PoC 7d 버전>`). `app/dist/`는 무시 목록에 넣는다.
- 새 명령 `npm --prefix app run package`를 AGENTS.md 'Commands'에 더한다.
- 검증:
  - `npm --prefix app run package`가 끝난다.
  - `app/dist/mac-arm64/doan.app/Contents/Resources/bin/doan skill --json`의 `result.version`이 `0.1.0`이다.
  - 그 뒤 `git status --porcelain`이 비어 있다(`app/dist/` 무시를 확인한다).
  - `npm --prefix app test`가 통과한다.

── commit (`chore(app): bundle the doan cli in a local unsigned app`) ──
── commit (`docs(agents): add the package command`) ──

## 6. main — 위로 다시 묻기와 3단계 init

- shell `refresh`의 위로 다시 묻기, `close(old)` 뒤 `add(root)`로 하는 재루팅, `folders.json` 저장, 포커스 대상 전달.
- IPC: 토큰 CSS 파일 선택(main이 결과를 보관하고 선택 ID로 가리킨다). init 실행 순서는 저장된 `uninitialized` 폴더인지 확인 → 위로 다시 묻기 → `doan init` → `initOutcome` → 다시 읽기다. 발신 프레임 확인은 기존과 같다.
- 경계 사례:
  - init 실패 봉투(`invalid_config`), CLI 시간 초과와 spawn 오류
  - 파일 선택 취소
  - init 직전에 폴더가 사라진 경우
  - 동시 init(연타는 한 번만 실행)
  - init 직전 재루팅
  - init의 `result.repo`로 식별하지 않는다. 저장 표기를 유지한다(POSTMORTEM 2026-10-21 Recurrence).
- 검증:
  - `npm --prefix app test` · `npm --prefix app run typecheck` 통과
  - shell 테스트: `repo/web`을 연 뒤 `repo`에서 init하면, 다음 읽기에서 저장 경로가 `repo`로 바뀐다. `repo`가 이미 열려 있으면 하나만 남는다. 재루팅 뒤 watcher와 서버 key가 새 루트로 동작한다.
  - `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`가 watcher만 낸다.
  - `npm --prefix app run e2e` PASS

── commit (`feat(app): re-root stale subfolders and initialize repos from the app`) ──

## 7. main — 온보딩과 e2e 격리

- 셸 탐지, 링크 · 스텁 · MCP 상태 읽기와 동작, `onboarding.json`, 앱 메뉴 "Set Up doan…", 마법사 열기 신호, 스텁 파일 `app/src/main/onboarding/SKILL.md`(`?raw` import).
- 시간 제한 값을 PoC 7 측정치를 바탕으로 숫자로 정하고 테스트로 고정한다.
- 테스트에서는 `os.homedir()`가 임시 HOME을 읽게 한다. 에이전트 CLI는 인자를 기록하는 가짜 실행 파일로, 셸은 가짜 `SHELL` 스크립트로 바꾼다.
- e2e helper(`runtime.ts`, `comments-ui.ts`, `anchors.ts`): design.md '테스트 격리'의 환경을 주고, 온보딩을 다루지 않는 단계에서는 `onboarding.json`을 미리 쓴다. `runtime.ts:374` 단언을 새 문구로 바꾼다. AGENTS.md의 수동 dev 명령에 HOME 격리 주의를 단다.
- 경계 사례:
  - 시간 초과한 셸이나 에이전트 CLI가 호출자를 한 번만 정리한다.
  - `$SHELL`이 없거나 실행할 수 없다.
  - 에이전트 실행 파일 ENOENT.
  - `blocked` 대상이 바뀌지 않는다.
  - 교체는 확인 응답 뒤에만 한다.
  - 쓰기 직전 재판정이 기대와 다르면 거부한다.
  - 같은 동작을 동시에 실행하면 한 번만 실행된다(EEXIST).
  - 1단계 미완료면 MCP 동작을 거부한다(main에서도 검사).
  - `PATH`의 `doan`만 있는 개발 빌드에서는 1단계를 거부한다.
  - Translocation 경로에서는 1단계를 거부한다.
  - 다시 열었을 때 늦게 온 상태 응답을 버린다.
  - `onboarding.json`이 깨졌으면 마법사를 연다.
- 검증:
  - `npm --prefix app test` · `npm --prefix app run typecheck` 통과
  - 임시 HOME 테스트에서 `blocked` 파일 · 디렉터리의 해시가 동작 전후로 같다.
  - `npm --prefix app run e2e` PASS. 기존 단계가 마법사에 가려지지 않는다.

── commit (`feat(app): machine setup for the cli link, skill stub and mcp`) ──
── commit (`docs(agents): isolate HOME for manual dev runs`) ──

## 8. renderer

- 마법사, 교체 확인 대화상자, "Not initialized" 행의 새 문구 · [Set Up…] · 프로젝트 설정 대화상자, 열린 캔버스의 새 메시지, "No canvases" 행의 [Copy first prompt]. 초안을 따른다.
- 포커스 · Escape · Cmd+W · draft 가드 규칙은 design.md 흐름 4를 따른다.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공, `npm --prefix app run e2e` PASS.

── commit (`feat(app): onboarding screens`) ──

## 9. e2e (`/runtime-test`)

- `app/e2e/`에 온보딩 단계를 더한다. `DOAN_CLI` 절대 경로, 임시 HOME, 가짜 SHELL, 가짜 `claude` · `codex`를 쓴다.
  - 진입과 닫기: 빈 userData로 첫 실행하면 마법사가 열린다. 닫은 뒤 재실행하면 열리지 않는다. 메뉴로 다시 연다. 창이 숨은 상태에서 메뉴로 열면 창이 보인다. 깨진 `onboarding.json`이면 마법사가 열린다. 마법사가 열린 동안 두 번째로 실행하면 같은 창이 보인다.
  - 1단계: 링크 생성, `link-other` 교체 확인, `blocked`는 바뀌지 않음, PATH 없음 안내.
  - 2단계: [Connect]가 기록한 인자(Claude `--scope user`), 두 에이전트 모두 감지되지 않음, 셸 탐지 시간 초과로 Couldn't check, 부분 실패에서 멈춤.
  - 3단계: 마법사 안 설정과 사이드바 [Set Up…]. 토큰 CSS가 있을 때와 없을 때, 저장소 밖 파일 오류, init 직전 재루팅 안내.
  - 하위 폴더 재루팅(재시작 · Reopen 뒤).
  - 4단계: 마법사와 사이드바의 첫 문장 복사. 툴팁은 `hoverTooltip`으로 읽는다.
- 비활성 이유는 인라인 문구로 읽는다.
- 검증: `npm --prefix app run e2e`가 자체 최종 `runtime-test: PASS`와 exit 0으로 끝나고, 실제 사용자 상태의 키 단위 비교가 같다.

── commit (`test: onboarding runtime checks`) ──

## 10. `/design-sync`

- 온보딩 화면의 첫 구현을 `design/onboard.html`과 비교하고, `docs/DESIGN.md`에 기록한다.
- 검증: `/design-sync` 스킬의 완료 조건을 따른다(측정 표, 불일치 0 또는 문서화된 차이, 회귀 테스트).

── commit (`/design-sync`가 정한 경계를 따른다) ──

## 11. 실사용 관찰과 skill 본문 (수동, 사용자 허락)

- design.md 흐름 13대로 진행한다. 관찰 저장소는 `git init`과 3단계(토큰 CSS 있음)를 마친 빈 임시 저장소다. 관찰은 최대 3회차이고, Codex 허락은 회차 묶음으로 한 번에 묻는다. 기록은 `.scratch/onboard/observe/`에 남긴다.
- 막힌 곳을 `cli/internal/cli/skill.md`에 반영한다. 규칙(ARCHITECTURE §1) 자체를 바꿔야 하면 멈추고 묻는다.
- 이 task는 수동 관찰이다. 에이전트 세션 기록이 생기므로 '실제 상태 불변' 비교 대상에서 뺀다. 그 밖의 doan 대상(링크 · 스텁 · MCP 키)은 여전히 비교한다.
- 검증:
  - 마지막 회차에서 두 에이전트 모두, 첫 문장만으로 만든 캔버스에 대해 `go run ./cli/cmd/doan check --json --repo <tmp>`의 오류가 0이다.
  - `go test ./...`가 통과한다(`skill_test.go`의 끝 표시줄).
  - 관찰 요약(날짜, 버전, 막힌 곳, 고친 곳)을 승격 대상으로 남긴다.
  - Codex 허락이 없으면 Codex 쪽은 미검증으로 보고한다.

── commit (`docs(skill): refine the doan guide from first-run observations`) ──

## 12. 패키지된 앱 확인 (사용자 확인 필요)

- 실행 명령은 미정이다. 사용자 확인이 필요하다. 후보는 `open -n --env HOME=<tmp> app/dist/mac-arm64/doan.app --args --user-data-dir=<tmp>` 또는 `app/dist/mac-arm64/doan.app/Contents/MacOS/doan --user-data-dir=<tmp>`의 직접 실행이다. `open`은 `--env` 없이는 환경을 넘기지 않는다. 정해지면 AGENTS.md 'Commands'에 더한다.
- 실제 HOME에 설치하려면 실행 전에 사용자에게 묻는다. 거절하면 임시 HOME으로만 확인한다. 이때 실제 `claude`(`~/.local/bin/claude`)가 감지되지 않는 한계가 있으므로, 실제 HOME 확인은 미검증으로 보고한다.
- 확인 항목:
  - 1단계 링크 값이 `.../doan.app/Contents/Resources/bin/doan`이다.
  - 설치된 `SKILL.md` 해시가 `app/src/main/onboarding/SKILL.md`의 해시와 같다.
  - MCP 등록이 command = 링크 절대 경로, args = `["mcp"]`, 사용자 범위다.
  - 패키지 앱에서 댓글을 하나 만든다. ASAR 안 utility process `mkdir-child` 실행을 확인하는 것이다(ARCHITECTURE §2의 배포 단계 확인 항목).
- 검증: `<HOME>/.local/bin/doan skill --json`이 `0.1.0`을 돌려준다. 위 확인 항목이 모두 맞는다. 댓글이 `.doan/comments/`에 append된다.

── commit 없음 (결과는 task 13에서 기록한다) ──

## 13. 승격과 정리

- PRODUCT:
  - §5 App 0번: 네 단계 마법사, 진입 · 닫기 · 재실행, `~/.local/bin`, 스텁 위치, Connect, MCP 등록 방식, 설정 위치 변수, 3단계 폼, 첫 문장, 사이드바 동작. "when a folder is chosen" 문장도 마법사의 Project 단계에 맞게 바꾼다.
  - §5 표: #8 완료를 표시한다.
  - §8: 두 열린 질문(토큰 경로, 하위 폴더)을 닫는다.
  - §7: 이번 결정 줄들(날짜와 근거)을 더하고, 2026-10-22 status chips 줄의 "Not initialized" 문구 변경을 반영한다.
  - §6: PoC 7과 실사용 관찰 요약.
- ARCHITECTURE:
  - §5 MCP: `init` 설명.
  - §6 Skills: 스텁 위치 · 내용 · 본문 변경. "#8 still refines the body"를 지운다.
  - §7 앱 스택: CLI 찾기, 패키지 빌드, 이름 · 버전 · appId, 앱 메뉴, `onboarding.json`, 저장소 밖 쓰기 경계, IPC.
  - §8: build settings는 onboard, release settings는 #9로 나눈다.
  - §9 Distribution: 로컬 `.app`만 있고 나머지는 #9다.
  - §12: `init --token-css` 절대 경로.
  - §13: 앱 폴더의 `repo_not_found` 재루팅, "bundled path in #8".
- `app/src/main/cli.ts`의 "feature 8" 주석.
- DIRECTORY.md: `app/src/main/onboarding/`, 새 renderer 파일, `app/dist/`. 필요하면 POSTMORTEM도.
- `docs/features/onboard/` 삭제.
- 검증:
  - `grep -rn "features/onboard" docs AGENTS.md`가 비어 있다.
  - `grep -n "#8" docs/ARCHITECTURE.md`에 남은 미래형 언급이 없다.
  - `go test ./...` · `npm --prefix app test`가 그대로 통과한다.

── commit (문서별로 나눈다: `docs(product): …`, `docs(architecture): …`, `docs(directory): …`, `docs(feature): retire onboard documents`; 주석 수정은 `chore: …`) ──
