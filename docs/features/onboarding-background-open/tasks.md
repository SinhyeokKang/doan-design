# onboarding-background-open — tasks

순서: PoC → 순수 함수(CLI·main) → 연결(I/O) → guide → 승격. 형식 변경이 없어 schema·fixture 단계는 없다. 보이는 UI가 바뀌지 않으므로 `/design-draft`는 없다.

## T0. PoC — background 실행과 활성화 때 보이기

- design §6의 세 가정을 패키지된 앱으로 확인한다. 실험 코드와 기록은 `.scratch/`에 두고, 결과(통과·실패, 쓴 방법, 날짜)는 이 문서의 '확인 결과'에 적는다.
- 검증: `npm --prefix app run package` 뒤 격리된 `app/dist/mac-arm64/Doan.app`을 `open -g`로 실행해 맨 앞 앱이 바뀌지 않음을 `osascript`로 확인, ⌘Tab·Dock 클릭 뒤 창이 보임, Dock bounce 확인. 실패하면 멈추고 보고한다.
- **commit 경계**: `docs(feature): onboarding-background-open PoC result`

## T1. CLI 실행 방식

- `launchArgs(bundle, background)`, `bootstrap`의 실행 방식 전달. `onboarding start`만 background, `open`은 foreground.
- 검증: `go test ./...`, `go vet ./...` 통과(`onboarding_test.go`, `open_test.go`에 두 argv와 호출 방식 고정).
- **commit 경계**: `feat(cli): open Doan in the background for onboarding start`

## T2. main 순수 규칙

- `revealFor(input)`와 실행 flag 해석(design §3.1, §4).
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): reveal rule for background onboarding launches`

## T3. main 연결

- `createWindow`의 `show: false`(background 실행), `did-become-active` 대기 해제, `index.ts:635` 경로, Dock bounce, `appActive` 판단(T0에서 정한 방법).
- 검증: `npm --prefix app test` green, typecheck·build 통과. `/runtime-test`로 패키지된 앱에서 완료 조건 1~6(꺼진 앱, 켜진 앱의 숨긴 창·보이는 창·최소화된 창, Doan이 맨 앞일 때, ⌘Tab·Dock 클릭, `doan open`이 맨 앞으로 옴)을 확인한다.
- **commit 경계**: `feat(app): keep the onboarding window behind the app in use`

## T4. guide

- `cli/internal/cli/skill.md` Onboarding 1: "shows the Doan window"를 새 동작(뒤에서 열고 Dock으로 알림, 사람이 전환하면 보임)으로 고친다. 사람에게 Doan에서 할 일이 있을 때는 Dock이나 ⌘Tab으로 Doan을 열라고 말하게 한다.
- 검증: `go test ./...`(skill 테스트) 통과, `/agent-eval`의 온보딩 관련 시나리오 통과(`node eval/run.ts --scenarios <온보딩 시나리오>`; 시나리오 id는 `eval/`에서 확인).
- **commit 경계**: `docs(skill): onboarding start opens Doan in the background`

## T5. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`(영문, 현재 규칙으로): §5 item 0 'First run'의 "the bundled CLI opens the app when it is not running for `onboarding start`" 줄에 뒤에서 열고 Dock으로 알리며 맨 앞일 때만 바로 보인다는 규칙, `doan open`은 앞으로 온다는 대비.
- `docs/ARCHITECTURE.md` §4 'Bootstrap': `open -g`와 실행 flag, 앱의 대기·`did-become-active` 규칙, T0에서 확인한 사실(LaunchServices·Electron 동작)과 그 이유.
- `docs/BACKLOG.md`: 실제 앱에서 확인하지 못한 표면이 있으면 적는다.
- `docs/features/onboarding-background-open/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `rg -n "docs/features/onboarding-background-open" docs AGENTS.md` 결과 없음.
- **commit 경계**: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`), 마지막에 `docs(feature): remove onboarding-background-open documents`.

## 확인 결과

(T0에서 채운다.)
