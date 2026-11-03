# onboarding-background-open — design

spec의 결정 1~7을 CLI 실행 방식(꺼진 앱)과 앱의 창 표시(켜진 앱, 실행 직후)로 나눈다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| CLI | `cli/internal/cli/onboarding.go`, `open.go`, `run.go` | `bootstrap`과 `Context.Launch`가 실행 방식을 받는다. `onboarding start`는 background, `open`은 지금처럼 foreground |
| CLI guide | `cli/internal/cli/skill.md` | Onboarding 1(`skill.md:91`)의 "shows the Doan window", Onboarding 3(`skill.md:93`)의 Doan에서 하는 단계 안내 |
| eval | `eval/scenarios/O2*` rubric | Doan 단계의 Dock 안내 확인 한 줄 |
| app main | `app/src/main/index.ts` | background 실행이면 첫 창을 숨긴 채 만들고 대기, `onboarding start`의 창 표시, 활성화 때 대기 중인 창 보이기, Dock bounce, `windowShown` 초기값 |
| app main 순수 규칙 | 새 `app/src/main/backgroundReveal.ts`(이름은 `/tdd`에서 정함) | 실행 flag 해석, `onboarding start` 때 보일지·미룰지·bounce할지 |
| formats·socket | 없음 | 앱 socket 메시지, CLI 응답, `runtime.json`은 그대로다. 새 계약은 실행 argv flag 하나다 |

## 2. CLI

- 실행 flag: `--doan-launch=background`. Go와 TS가 같은 문자열을 쓰고, 승격 때 ARCHITECTURE §4 'Bootstrap'에 적는다.
- `launchArgs(bundle, background) []string`: background면 `["-g", bundle, "--args", "--doan-launch=background"]`, 아니면 지금처럼 `[bundle]`. `/usr/bin/open -g`는 LaunchServices가 앱을 활성화하지 않고 실행하게 한다. `--args`는 새로 실행될 때만 argv로 전달되며, bootstrap은 앱이 없을 때만 실행한다.
- `bootstrap(ctx, background bool, fail, attempt)`, `Context.Launch func(bundle string, background bool) error`. `onboardingStart`(`onboarding.go:250`)는 true, `Open`(`open.go:35`)은 false를 넘긴다. 테스트 harness(`onboarding_test.go`)가 넘어온 방식을 기록한다.
- `onboarding.go:490`의 "so it is visible" 주석과 `run.go:35` 주석을 고친다.

## 3. app main

### 3.1 활성 상태

`app.isActive()`(Electron 45, macOS, `app/node_modules/electron/electron.d.ts:1577`)로 Doan이 맨 앞 앱인지 판단한다. `BrowserWindow.getFocusedWindow()`는 쓰지 않는다. Doan이 맨 앞인데 창을 닫아 둔(숨긴) 경우 null이라 비활성으로 잘못 판단하고, 이미 활성이라 `did-become-active`도 오지 않아 창이 끝내 보이지 않는다.

### 3.2 실행 직후 (launch)

- 실행 argv에 flag가 있고 `createWindow` 시점에 `!app.isActive()`이면 `show: false`로 만들고 "보일 창 대기"를 켠다. flag가 없거나 이미 활성이면 지금처럼 보인다(사람이 기동 중에 Dock을 눌렀거나 ⌘Tab한 경우 포함).
- `windowShown`(`index.ts:203`, 지금은 `true`로 시작)을 같은 판단으로 정한다. `thumbnails`를 만들기 전에 정하거나 뒤에 `syncThumbnailPause()`를 부른다. 그래야 `window:visible`, 썸네일 멈춤, 알림의 `shown` 입력(`index.ts:754`)이 숨은 창을 보이는 것으로 보지 않는다.
- launch에서는 bounce하지 않는다. CLI는 실행 뒤 항상 같은 `start` 요청을 보내므로(`onboarding.go` `bootstrap`) bounce는 그 `start` 처리에서 한 번만 한다.
- `paintWhenInitiallyHidden`은 기본값(true)을 둔다. 숨은 renderer가 계속 그리고 `ready-to-show`가 온다.

### 3.3 `onboarding start` (켜진 앱)

순수 함수 `revealFor({ appActive, windowVisible, pending })` → `{ show: "now" | "on-activate" | "none", bounce: boolean }`. `windowVisible = windowShown && !appHidden && !win.isMinimized()`.

| 상황 | show | bounce |
|---|---|---|
| appActive | now (지금 그대로: `app.show()` if hidden, 최소화면 `restore()`, `showWindow`) | false |
| !appActive, 창이 보이지 않음(숨김·최소화·app 숨김), 대기 없음 | on-activate | true |
| !appActive, 창이 보이지 않음, 이미 대기 중 | on-activate | false |
| !appActive, 창이 보임 | none (보이는 창을 앞으로 올리지 않음) | true |

`now`가 아닐 때는 `app.show()`도 `win.show()`도 부르지 않는다. 둘 다 앱을 활성화한다(`window.show()`는 "Shows and gives focus", `electron.d.ts`).

### 3.4 대기와 해제

- `app.on("did-become-active")`를 모듈 최상위에 등록한다(`open-url`처럼). 대기 중이면 `now`와 같은 순서(`app.show()` if hidden, `restore()` if minimized, `showWindow`)로 보이고 대기를 끈다. 창이 아직 없으면 대기만 남겨 `createWindow`가 `app.isActive()`로 판단하게 한다.
- `showWindow`가 불리는 다른 경로(`doan open`, 링크, 알림 클릭, `activate`, `second-instance`, 메뉴)는 대기를 끈다. 오래된 대기가 나중에 창을 띄우지 않게 한다.
- 기존 `app.on("activate")`(Dock 클릭·reopen)와 `second-instance`는 바꾸지 않는다.
- Dock 알림: `app.dock.bounce("informational")`. 반환값(요청 id, 이미 활성이면 `-1`)을 기록해 테스트와 probe가 판정한다.

### 3.5 숨긴 채 도는 동안

온보딩 세션은 지금처럼 진행된다. 창이 보이면 온보딩 화면의 포커스 계약(장면이 바뀌면 장면 제목, 또는 `state.focus` 대상; `Onboarding.tsx:163-173`, `:637-638`)을 따른다. 숨긴 동안 걸린 `requestAnimationFrame` 포커스 이동이 창이 보인 뒤 실행되는지 확인한다.

## 4. 테스트 대상

| 대상 | 위치 | 고정할 사례 |
|---|---|---|
| `launchArgs(bundle, background)` | `onboarding.go` | foreground argv는 지금과 같음, background는 `-g`와 flag, 공백이 든 bundle 경로 |
| bootstrap 실행 방식 전달 | `onboarding_test.go`, `open_test.go` | `onboarding start`는 background, `open`은 foreground |
| `revealFor` | 새 main 모듈 | §3.3 표의 네 사례 |
| 실행 flag 해석 | 같은 모듈 | flag 있음·없음·다른 argv 무시 |
| main 연결 | `app/src/main/index.test.ts`(`app` mock에 `isActive`, `dock.bounce`, `did-become-active` 추가) | background 실행이 `show: false`로 만들고 `show` 호출 없음, `window:visible` false; 기동 중 활성이면 바로 보임; `did-become-active`가 대기 중 창을 한 번 보이고 해제; 비활성 `start`는 `win.show`·`app.show` 없이 bounce 한 번, 대기 중 두 번째 `start`는 bounce 없음; 활성 `start`는 보이고 bounce 없음; 최소화 창은 복원; `doan open`·`activate`·`second-instance` 경로는 그대로이고 대기를 끔; quit 뒤 파괴된 창을 건드리지 않음 |

## 5. 형식·conventions·결정 영향

- JSON Schema, 앱 socket 메시지(`v`), CLI 응답, `runtime.json`은 바뀌지 않는다. 새 계약은 실행 argv flag `--doan-launch=background`다.
- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- guide(`skill.md`)와 O2 rubric이 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌리고, eval 변경이라 `verify.mjs --eval`과 self-test를 통과시킨다. guide 크기 예산(`skill_test.go:202` `skillOutputBudget`, POSTMORTEM 2026-10-29)을 지킨다.
- "An explicit DOAN_RUNTIME never launches" 규칙은 그대로다.

## 6. PoC 의존

T0에서 확인한다. 실험용 빌드는 `index.ts`에 커밋하지 않는 최소 패치(flag를 읽어 `show: false`, `did-become-active`에서 보이기, `isActive`·`bounce` 기록)를 넣어 패키지하고, 확인 뒤 되돌린다. 맨 앞 앱은 권한이 필요 없는 `lsappinfo info -only name "$(lsappinfo front)"`로 읽는다(`osascript`의 System Events는 Automation 권한을 묻는다).

1. `/usr/bin/open -g <사본>/Doan.app --args --user-data-dir=<tmp> --doan-launch=background`로 실행하고 창을 `show: false`로 만들면 다른 앱이 맨 앞에 남는다. 실행 중 `activate` 이벤트가 와서 기존 handler가 창을 보이게 하지 않는다(`electron.d.ts`는 첫 실행 때 `activate`가 올 수 있다고 적는다).
2. `app.isActive()`가 `-g` 실행 직후 false, ⌘Tab·Dock 클릭 뒤 true이고, `did-become-active`가 두 경로 모두에서 온다.
3. `app.dock.bounce("informational")`가 서명되지 않은 앱에서 id를 돌려준다(시각 확인은 사람). Dock 자동 숨김이 켜진 경우도 본다.
4. 이미 실행 중인 앱(런타임 socket이 없거나 기동 중)에 `open -g`가 가면 reopen → `activate` → `showWindow`로 앱이 앞으로 오는지 본다. 오면 그 경로를 고칠지, BACKLOG에 남길지 보고한다.

하나라도 실패하면 구현 전에 멈추고 사용자에게 보고한다. 1이나 2가 실패하면 spec 결정 1의 모양이 바뀔 수 있다.

## 7. POSTMORTEM에서 가져온 함정

- **2026-10-30 'Packaged-app probes failed for reasons of their own: keychain, signature identity and focus'**: `design.doan.app`의 LaunchServices 등록이 여럿이면 다른 사본이 열린다. LaunchServices로 실행하고, Playwright focus emulation을 끄고, 창 상태가 아니라 이벤트(`did-become-active`, `show`)로 판정한다. 실행 전 `lsregister -dump`로 등록을 보고, 다른 Doan이 떠 있지 않은지 확인한다.
- **2026-10-25 'Native hiding bypassed renderer-only lifetime checks'**: 네이티브 표시 상태를 초기값으로 잘못 두면 renderer 쪽 판단이 틀린다(§3.2 `windowShown`).
- **2026-10-27 'Native focus waits hid a locked desktop'**: 잠긴 화면에서는 포커스 대기가 실패로 보인다. probe 전에 화면이 잠기지 않았는지 확인한다.
- **2026-10-22 'A fullscreen window stayed visible after Close Window'**: 창 표시·숨김은 fullscreen·최소화에 따라 다르다. 최소화와 fullscreen을 T3에서 확인한다.
- **2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking'**: 창이 나중에 보일 때 포커스가 `<body>`로 떨어지지 않는지 확인한다(§3.5).
