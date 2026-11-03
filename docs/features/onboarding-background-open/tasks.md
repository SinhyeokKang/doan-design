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

T0(a)·(b)는 2026-11-03 23:37~23:42(KST)에 확인했다. design §6의 1·2는 통과했고, 3은 반환값과 사람의 시각 확인으로 통과했다(Dock 자동 숨김은 확인하지 않음). 4는 앱이 앞으로 왔다. 구현 전에 멈출 실패는 없다.

### 방법

- 커밋하지 않은 패치(`index.ts`: 실행 argv의 `--doan-launch=background`를 읽고, `createWindow` 때 `!app.isActive()`면 `show: false`와 대기를 켬, `did-become-active`에서 대기 중이면 `showWindow`, 숨겨 만들고 3초 뒤 `app.dock.bounce("informational")`, 이벤트와 `isActive`를 userData의 `poc.log`에 기록)로 `npm --prefix app run package`를 하고, `app/dist/mac-arm64/Doan.app`을 임시 폴더에 복사했다. 패치는 되돌렸다.
- 실행: `/usr/bin/open -g --env HOME=<tmp> --env CLAUDE_CONFIG_DIR=<tmp> --env CODEX_HOME=<tmp> <사본> --args --user-data-dir=<tmp> --doan-launch=background`. 맨 앞 앱은 `lsappinfo info -only name "$(lsappinfo front)"`를 0.5초마다 기록했다.
- 실행 전 화면 잠금을 확인했다(처음엔 잠겨 있어 사용자가 풀었다). 실제 Doan(`/Applications/Doan.app`)은 ⌘Q로 종료했고, 다른 Doan이 떠 있지 않았다. `lsregister -dump`에는 `design.doan.app` 등록이 88개(worktree 빌드, 마운트된 dmg 등) 있었다. 사본은 경로로 열었으므로 다른 사본이 열리지 않았다.
- Dock 클릭과 ⌘Tab은 사람이 했다. `orca computer`가 Dock의 접근성 트리를 읽지 못했고(`permission_denied`), 합성 ⌘Tab으로는 전환 대상을 고를 수 없다.
- 실제 상태: `app/runtime/real-state.ts`의 지문과 `~/Library/Application Support/doan*` 전체 트리 해시(35개 항목)를 실제 Doan을 종료한 직후와 T0(a)가 끝난 뒤 비교했다. 바뀐 항목은 없다.

### design §6 판정

1. **통과.** `-g` 실행 전후 맨 앞 앱은 그대로였다(1회차 Slack, 2회차 Orca). 로그는 `ready isActive=false`, `createWindow ... isActive=false show=false`, t+0.5·2·5초 모두 `isActive=false`이고, 실행 중 `activate` 이벤트는 오지 않았다. 두 번 실행해 같은 결과를 얻었다.
2. **통과.** Dock 클릭(23:39:01)에서 `did-become-active isActive=true pending=true` → `showWindow` → `activate hasVisibleWindows=true` → `window show`·`focus` 순으로 기록됐고, 사람이 창이 바로 보였다고 확인했다. ⌘Tab(23:40:24)에서는 `did-become-active isActive=true pending=true` → `showWindow` → `window focus`·`show`가 기록됐고 **`activate`는 오지 않았다**. 따라서 ⌘Tab 경로는 `did-become-active`로만 잡을 수 있다(design §3.4와 맞음).
3. **통과(자동 숨김 제외).** 서명하지 않은 사본에서 `app.dock.bounce("informational")`가 두 번 모두 `0`을 돌려줬다(비활성 상태, `-1` 아님). 사용자가 23:37:45 bounce를 눈으로 봤다. Dock 자동 숨김 경우는 사용자 결정으로 확인하지 않았다(bounce는 부차적).
4. **앱이 앞으로 왔다.** 사본이 실행 중이고 창이 보이는 상태에서 Orca가 맨 앞일 때 `open -g`를 다시 보냈더니 `activate hasVisibleWindows=true isActive=false` → `window show` → `did-become-active`가 기록되고 맨 앞 앱이 Doan으로 바뀌었다. `--args`와 `--env`는 무시됐다("already running" 경고). reopen이 기존 `activate` handler의 `showWindow`를 불러 `-g`를 무력화한다. 권고: 이번 범위에서 고치지 않고 BACKLOG에 남긴다. CLI는 socket에 닿지 못할 때만 실행하므로 이 경로는 앱이 기동 중이거나 socket이 없는 드문 경우뿐이고, `activate` handler를 바꾸면 비목표인 Dock 클릭 동작에 닿는다.

### T0(b) 실제 경로 기준 동작

- 실행 전(23:37:10): 실제 Doan 실행 중(pid 77619, `/Applications/Doan.app`), 맨 앞 앱 Orca, `runtime.json` 있음.
- 실제 Doan을 종료한 뒤 T0(a)를 하고, 23:41:48 맨 앞 앱 Orca에서 설치된 CLI(`~/.local/share/doan/current/bin/doan`)로 `doan onboarding start --json`을 한 번 실행했다.
- 결과: 종료 코드 0, 응답 `ok: true`(`completed: true`, 세션 id 있음). 맨 앞 앱은 23:41:48.4에 Doan으로 바뀌었고, 명령이 끝난 직후와 3초 뒤에도 Doan이었다. Doan은 다시 실행 중이다(pid 14002, 같은 번들). 설치본은 `-g`를 쓰지 않으므로 이 결과가 고칠 기준 동작이다.
- 실행 전후 실제 상태: 종료로 `runtime.json`이 사라졌다가 다시 생겼고, 다시 실행된 앱이 `ui-state.json`, `agent-auth`, provider Keychain 항목 속성을 바꿨다. T0(a) 동안에는 바뀐 항목이 없었으므로, 이 변화는 실제 Doan의 종료·기동에서 왔다.

### 확인하지 못한 것

- 창이 보인 뒤 포커스 위치(장면 제목, `<body>` 아님): 사용자가 답하려고 Orca로 돌아가 Doan이 비활성이었고, 접근성 트리에 포커스된 요소가 없었다. T3 probe에서 확인한다.
- Dock 자동 숨김일 때의 bounce.
- 실행 중 앱에 `open -g`가 갔을 때 창이 숨겨져 있거나 기동 중인 경우(창이 보이는 경우만 확인).
- PoC 사본의 LaunchServices 등록이 남아 있다(`lsregister -u`는 승인된 명령이 아니어서 하지 않았다).
