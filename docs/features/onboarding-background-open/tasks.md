# onboarding-background-open — tasks

순서: PoC → 순수 함수(CLI·main) → 연결(I/O) → guide·eval → 승격. 형식 변경이 없어 schema·fixture 단계는 없다. 보이는 UI가 바뀌지 않으므로 `/design-draft`는 없다.

## T0. PoC — background 실행과 활성화 때 보이기

- (a) 격리된 사본으로 design §6의 1~4를 확인한다. 커밋하지 않는 최소 패치로 `npm --prefix app run package`를 하고, `app/dist/mac-arm64/Doan.app`을 임시 폴더에 복사해 `/usr/bin/open -g <사본> --args --user-data-dir=<tmp> --doan-launch=background`로 실행한다. 실행 전 다른 Doan이 떠 있지 않은지, `lsregister -dump`의 `design.doan.app` 등록을 확인하고, `app/runtime/` real-state 지문으로 실제 userData가 바뀌지 않았음을 확인한다. 맨 앞 앱은 `lsappinfo`로 읽고, ⌘Tab·Dock 클릭은 사람이 하거나 computer-use로 한다. 패치는 끝나면 되돌린다.
- (b) 사용자 승인 뒤(spec 결정 7), 실제 Doan을 잠시 종료하고 설치된 번들의 CLI로 `doan onboarding start --json`을 실행해 완료 조건 1을 확인한다. 실제 HOME·userData를 쓰므로 실행 전후 상태를 기록한다.
- 검증: `/usr/bin/open -g`와 `lsappinfo`·`lsregister`는 AGENTS.md 'Commands'에 없다 — command undecided, needs user confirmation. 판정: `-g` 실행 뒤 맨 앞 앱 불변, `isActive` false→true, `did-become-active` 기록, `bounce` 반환값이 id, 실행 중 앱에 `open -g`가 갔을 때의 결과 기록. 실패하면 멈추고 보고한다. 결과는 이 문서 '확인 결과'에 적는다.
- **commit 경계**: `docs(feature): onboarding-background-open PoC result`

## T1. CLI 실행 방식

- `launchArgs`, `bootstrap`·`Context.Launch`의 background 인자(design §2), 주석 수정.
- 검증: `go test ./...`, `go vet ./...` 통과(`onboarding_test.go`, `open_test.go`에 두 argv와 호출 방식 고정).
- **commit 경계**: `feat(cli): open Doan in the background for onboarding start`

## T2. main 순수 규칙

- `revealFor`와 실행 flag 해석(design §3.3, §4).
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): reveal rule for background onboarding launches`

## T3. main 연결

- `createWindow`의 `show: false`와 `windowShown` 초기값(§3.2), `did-become-active` 최상위 등록과 대기 해제(§3.4), `index.ts:635` 경로, 최소화 복원, Dock bounce.
- 검증: `npm --prefix app test` green(design §4 'main 연결' 사례가 `index.test.ts`에 있음), typecheck·build 통과. `/runtime-test`는 Playwright `_electron`이 LaunchServices를 거치지 않고 focus emulation을 켜므로 T0(a)와 같은 방식(LaunchServices 실행, `lsappinfo`, 사람·computer-use의 전환)으로 완료 조건 2~4, 6을 확인한다: 켜진 앱의 숨긴 창·보이는 창·최소화된 창, Doan이 맨 앞일 때, 기동 중 Dock 클릭, ⌘Tab·Dock 클릭 뒤 포커스가 장면 제목(`document.activeElement`), `doan open`이 맨 앞으로 옴, 다른 앱이 전체 화면일 때 Space가 바뀌지 않음. 온보딩 완료 기록이 있으면 첫 실행이 열리지 않으므로 첫 실행 사례에서는 기록을 지운 임시 userData를 쓴다. 완료 조건 1은 T0(b)의 결과를 쓴다. 다중 디스플레이·Stage Manager는 확인하지 못하면 BACKLOG에 적는다.
- **commit 경계**: `feat(app): keep the onboarding window behind the app in use`

## T4. guide와 eval

- `cli/internal/cli/skill.md` Onboarding 1(`:91`)을 새 동작(뒤에서 열고 Dock으로 알림)으로, Onboarding 3(`:93`)과 `stop_required` 안내를 "Dock의 Doan을 눌러 열고 …"로 고친다(spec 결정 6). O2 rubric에 Doan 단계의 Dock 안내 확인과 "Doan 창이 보인다고 말하지 않음"을 더한다.
- 검증: `go test ./...` 통과(skill 크기 예산 `skillOutputBudget` 포함), `node .agents/skills/verify/scripts/verify.mjs --eval` 통과, `node eval/run.ts --self-test --scenarios O2`가 `self-test PASS`. `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios O1,O2,O3,O3b --agents claude,codex`에서 모든 시나리오가 두 에이전트 모두 통과하고, 결과를 `docs/USABILITY-EVAL.md`에 따로 커밋한다. 이 eval은 가짜 앱에 붙으므로 실행 방식은 확인하지 않는다.
- **commit 경계**: `docs(skill): onboarding start opens Doan in the background`, `test(eval): O2 checks the Dock hand-off`, `docs(usability-eval): …`

## T5. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`(영문, 현재 규칙으로): §5 item 0 'First run' 99줄을 `onboarding start`(뒤에서 열고 Dock으로 알림, 맨 앞이면 바로 보임, macOS 대화상자 예외)와 `doan open`(앞으로 옴)의 대비로 고친다. item 10(240줄)의 "as `onboarding start` does"도 맞춘다.
- `docs/ARCHITECTURE.md`: §4 'Bootstrap'(`open -g`와 `--doan-launch=background`, `onboarding start`만), §7 'Main window'(258줄: background 실행의 숨긴 창, `windowShown`, `did-become-active` 대기, `isActive` 판단과 그 이유), T0에서 확인한 사실.
- `docs/BACKLOG.md`: `doan open` launching a closed app 항목(50줄)을 T0(b) 결과에 맞게 고치고, 확인하지 못한 표면(다중 디스플레이, Stage Manager, 실행 중 앱의 `open -g`)을 적는다.
- `docs/features/onboarding-background-open/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `rg -n "docs/features/onboarding-background-open|/usr/bin/open|opens the app" docs app cli .agents eval AGENTS.md`에서 이 디렉터리를 가리키는 곳이 없고 남은 설명이 새 규칙과 맞음.
- **commit 경계**: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(backlog): …`), 마지막에 `docs(feature): remove onboarding-background-open documents`.

## 확인 결과

(T0에서 채운다.)
