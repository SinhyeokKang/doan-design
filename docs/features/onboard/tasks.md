# onboard — tasks

순서: 결정 기록 → PoC 7 게이트 → 초안(게이트) → CLI → 순수 함수 → main(CLI 찾기 · 패키지) → main(폴더 · 3단계) → main(머신 설정) → renderer → e2e → `/design-sync` → 실사용 관찰과 skill 본문 → 패키지된 앱 확인 → 승격. `── commit ──`은 커밋 경계다. 코드 경계는 `test:`(red) + `feat:` 한 쌍으로 나눠도 된다. 각 코드 경계에서 해당 언어의 테스트와 정적 검사(`go test ./...` · `go vet ./...`, `npm --prefix app test` · `npm --prefix app run typecheck`)가 통과해야 한다.

모든 자동 검증은 임시 HOME · 임시 userData · 임시 저장소를 쓴다. 실제 `~/.local/bin`, `~/.agents`, `~/.claude`, `~/.claude.json`, `~/.codex`, `~/Library/Application Support/doan/`은 작업 앞뒤로 목록과 해시를 비교해 바뀌지 않았음을 확인한다.

## 0. 분할 결정 기록

- PRODUCT §5 'Feature split' 표에서 #8을 `onboard`(첫 실행 온보딩 · 번들 CLI · 서명 없는 로컬 `.app` · `doan skill` 본문 다듬기)로 바꾸고, #9 `dist`(Developer ID 서명 · 공증 dmg · brew cask · electron-updater · Releases CI · x64/universal)를 더한다. #9는 앱 전체 사이클 완성도 작업 뒤로 미룬다고 적는다.
- PRODUCT §7에 2026-10-24 결정 줄: 분할과 근거(비공개 저장소, 서명 인증서 없음, 라이선스 미정, 사용자 "배포 관련은 다 뒤로 미뤄"), 로컬 `.app`을 남기는 이유.
- 검증: `docs/PRODUCT.md`에 두 변경이 있고, `grep -n "onboard-dist" docs/*.md AGENTS.md`에 남은 언급이 분할을 설명하는 곳뿐이다.

── commit (`docs(product): split onboard-dist into onboard and dist`) ──

## 1. PoC 7 (게이트)

- `.scratch/onboard/poc7/`에서 design.md 'PoC 의존'의 7a~7d를 확인한다.
- 7b · 7c는 임시 HOME 또는 각 에이전트의 설정 디렉터리 변수로 격리한다. 격리할 수 없는 항목이 있으면 실행하지 않고 사용자에게 묻는다. Codex 실행은 사용자 허락을 받은 뒤에 한다(모델 경계).
- 7d는 electron-builder를 `.scratch/` 안에서만 설치해 확인한다. `app/package.json`은 아직 바꾸지 않는다.
- 7c의 실제 `mcp get`/`list` 출력을 `app/src/main/` fixture 후보로 `.scratch/onboard/poc7/`에 남긴다.
- 검증: 결과(통과 여부, 관찰, 날짜, 버전)가 PRODUCT §6 'Results'에 있고, 실제 사용자 설정의 앞뒤 비교가 같다. 하나라도 기준을 못 넘으면 멈추고 사용자에게 묻는다.

── commit (`docs(product): PoC 7 onboarding results`) ──

## 2. 초안 (게이트)

- design.md '초안 요청'대로 `/design-draft`로 `design/onboard.html`을 그린다.
- 사용자가 앱에서 초안을 보고 확정한다. 첫 문장 문구도 이때 확정한다.
- 검증: `go run ./cli/cmd/doan check --json --repo .`에 오류 0(`mock.css`의 `hardcoded_color` 경고만 허용), `go run ./cli/cmd/doan ls --json --repo .`에 `onboard` 캔버스와 요청한 상태 프레임이 모두 있다.

── commit (`docs(design): onboard draft`) ──

## 3. CLI — `doan init --token-css` 절대 경로

- 저장소 안 절대 경로를 받아 디스크 표기의 저장소 기준 상대 경로로 저장한다. MCP `init`의 `tokenCss`도 같은 경로를 탄다(`cli.Run` 공유).
- 경계 사례: design.md 'Go' 항목 전부, MCP `init`에 절대 `tokenCss`.
- 검증: `go test ./...` · `go vet ./...` 통과. 임시 저장소에서 `go run ./cli/cmd/doan init --json --repo <tmp> --token-css <tmp>/a/tokens.css`가 `ok`이고 `.doan/config.json`의 `tokenCss`가 `a/tokens.css`다. `--token-css /tmp/outside.css`는 exit 2 `usage_error`다.

── commit (`feat(cli): accept absolute token css paths inside the repo`) ──

## 4. 순수 함수 (TS)

- design.md '순수 함수로 떼어 낼 부분'의 TS 함수 전부. `mcpState` · `parseShellProbe`는 PoC 7에서 남긴 실제 출력을 fixture로 쓴다.
- 경계 사례: 깨진 링크, 상대 링크 값, 다른 대소문자의 같은 경로, `ENOTDIR`, PATH의 빈 항목 · 끝 슬래시, 셸 잡음 출력, 같은 루트 합치기와 순서, 위쪽 저장소의 깨진 설정.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과.

── commit (`feat(app): onboarding pure helpers`) ──

## 5. main — CLI 찾기와 로컬 패키지

- `cliCommand`를 design.md 흐름 1대로 바꾼다.
- electron-builder를 정확한 버전으로 devDependency에 더한다(`npm --prefix app install --save-exact --save-dev electron-builder@<PoC 7d 버전>`). `package` 스크립트, `extraResources`의 `bin/doan`, `go build` 버전 주입, `app/dist/` 무시 목록.
- 새 명령 `npm --prefix app run package`를 AGENTS.md 'Commands'에 더한다(일하는 방식이 바뀌므로 AGENTS.md 수정 대상).
- 검증: `npm --prefix app run package`가 끝나고, `app/dist/mac-arm64/<앱>.app/Contents/Resources/bin/doan skill --json`의 `result.version`이 `app/package.json`의 `version`과 같다. `npm --prefix app test` 통과.

── commit (`build(app): bundle the doan cli in a local unsigned app`) ──
── commit (`docs(agents): add the package command`) ──

## 6. main — 위로 다시 묻기와 3단계 init

- `readFolder`의 `rooted` 결과, shell의 저장 경로 교체 · 합치기, `folders.json` 저장.
- IPC: 토큰 CSS 파일 선택(시작 위치는 그 폴더), `doan init` 실행과 결과 봉투 전달, 성공 시 다시 읽기. 발신 프레임 확인은 기존 IPC와 같다.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과. shell 테스트: `repo/web`을 연 뒤 `repo`에서 init → 다음 읽기에서 저장 경로가 `repo`로 바뀌고, `repo`가 이미 열려 있으면 하나만 남는다. `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`가 watcher만 낸다.

── commit (`feat(app): re-root stale subfolders and initialize repos from the app`) ──

## 7. main — 머신 설정

- 셸 탐지, 링크 · 스텁 · MCP 상태 읽기와 동작, `onboarding.json`, 메뉴 "Set Up Doan…", 설정 화면 열기 신호, skill 스텁 파일(앱 리소스).
- HOME은 `os.homedir()`로 읽어 테스트에서 임시 HOME을 줄 수 있게 한다. 에이전트 CLI는 테스트에서 인자를 기록하는 가짜 실행 파일로 바꾼다.
- 경계 사례: 시간 초과한 셸 · 에이전트 CLI가 호출자를 한 번만 정리, `blocked` 대상 불변, 교체는 확인 응답 뒤에만, 1단계 미완료 시 MCP 동작 거부(main에서도 검사), 개발 빌드의 1단계 거부.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과. 임시 HOME 테스트에서 `blocked` 파일 · 디렉터리의 해시가 동작 전후로 같다.

── commit (`feat(app): machine setup for the cli link, skill stub and mcp`) ──

## 8. renderer

- 설정 화면, 교체 확인 대화상자, "Not initialized" 행의 "Set Up…"과 3단계 대화상자, 캔버스 없는 프로젝트의 첫 문장과 복사. 초안을 따른다.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): onboarding screens`) ──

## 9. e2e (`/runtime-test`)

- `app/e2e/`에 온보딩 단계를 더한다: 빈 userData로 첫 실행 시 설정 화면, 건너뛰기 후 재실행 시 안 열림, 메뉴로 다시 열기, 임시 HOME과 가짜 `claude` · `codex`로 2단계(기록된 인자 확인), `blocked` 대상 불변, 3단계(토큰 CSS 있음 · 없음 · 저장소 밖 파일 오류), 하위 폴더 재루팅, 첫 문장 복사.
- 1단계는 개발 빌드에서 비활성 표시만 확인한다. 실제 링크는 task 12에서 패키지된 앱으로 본다.
- 검증: `npm --prefix app run e2e`가 자체 최종 `runtime-test: PASS`와 exit 0으로 끝나고, 실제 사용자 상태 비교가 같다.

── commit (`test(e2e): onboarding runtime checks`) ──

## 10. `/design-sync`

- 온보딩 화면의 첫 구현을 `design/onboard.html`과 비교하고 `docs/DESIGN.md`에 기록한다.
- 검증: `/design-sync` 스킬의 완료 조건(측정 표, 불일치 0 또는 문서화된 차이, 회귀 테스트).

── commit (`/design-sync`가 정한 경계를 따른다) ──

## 11. 실사용 관찰과 skill 본문

- design.md 흐름 11대로 실제 Claude Code와 Codex에 첫 문장을 준다. 기록은 `.scratch/onboard/observe/`에 남긴다. Codex 실행은 매번 사용자 허락을 받는다(모델 경계).
- 막힌 곳을 `cli/internal/cli/skill.md`에 반영하고 같은 관찰을 다시 돌린다. 규칙(ARCHITECTURE §1) 자체를 바꿔야 하면 멈추고 묻는다.
- 검증: 두 에이전트 모두 첫 문장만으로 만든 캔버스에서 `go run ./cli/cmd/doan check --json --repo <tmp>` 오류가 0이다. `go test ./...` 통과(`skill_test.go`의 끝 표시줄). 관찰 요약(날짜, 버전, 막힌 곳, 고친 곳)을 승격 대상으로 남긴다.

── commit (`docs(skill): refine the doan guide from first-run observations`) ──

## 12. 패키지된 앱 확인 (사용자 확인 필요)

- task 5의 `.app`을 띄워 1단계 링크와 2단계를 실제로 확인한다. 실제 HOME에 쓰므로 실행 전에 사용자에게 묻는다. 거절하면 임시 HOME(`HOME=<tmp> open -n …` 또는 실행 파일 직접 실행)으로만 확인하고, 실제 HOME 확인은 미검증으로 보고한다.
- 검증: `~/.local/bin/doan skill --json`(또는 임시 HOME의 같은 경로)이 번들 CLI의 버전을 돌려준다. 등록된 MCP를 각 에이전트의 MCP 목록 명령으로 확인한다.

── commit 없음 (결과는 task 13에서 기록한다) ──

## 13. 승격과 정리

- PRODUCT: §5 App 0번 온보딩의 확정 내용(진입 · 건너뛰기 · 재실행, `~/.local/bin`, 스텁 위치, MCP 등록 방식, 3단계 대화상자, 첫 문장), §8의 두 열린 질문 닫기(토큰 경로, 하위 폴더), §7 결정 줄들(날짜 · 근거).
- ARCHITECTURE: §6 Skills(스텁 위치 · 내용 · 본문 변경), §7 앱 스택(CLI 찾기, 패키지 빌드, `onboarding.json`, 저장소 밖 쓰기 경계), §9 Distribution(로컬 `.app`만 있고 나머지는 #9), §12(`init --token-css` 절대 경로).
- DIRECTORY.md(새 모듈 · 리소스 · `app/dist/`), 필요하면 POSTMORTEM.
- `docs/features/onboard/` 삭제.
- 검증: `grep -rn "features/onboard" docs AGENTS.md`가 비어 있고, `go test ./...` · `npm --prefix app test`가 그대로 통과한다.

── commit (문서별로 나눈다: `docs(product): …`, `docs(architecture): …`, `docs(directory): …`, `docs(feature): retire onboard documents`) ──
