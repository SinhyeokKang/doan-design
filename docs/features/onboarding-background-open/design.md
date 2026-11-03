# onboarding-background-open — design

spec의 결정 1~3을 CLI 실행 방식(꺼진 앱)과 앱의 창 표시(켜진 앱, 실행 직후)로 나눈다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| CLI | `cli/internal/cli/onboarding.go`, `open.go`, `run.go` | `bootstrap`이 실행 방식을 받는다. `onboarding start`는 background, `open`은 지금처럼 foreground |
| CLI guide | `cli/internal/cli/skill.md` | Onboarding 1의 "shows the Doan window" 문장 |
| app main | `app/src/main/index.ts` | background로 실행됐을 때 첫 창을 보이지 않고 대기, `onboarding start`의 창 표시, 활성화 때 대기 중인 창 보이기, Dock bounce |
| app main 순수 규칙 | 새 `app/src/main/backgroundReveal.ts`(이름은 `/tdd`에서 정함) | 상황에 따라 보일지·미룰지·Dock을 튀길지 고르는 함수 |
| formats·socket | 없음 | 앱 socket 메시지, CLI 응답, `runtime.json`은 그대로다 |

## 2. CLI

- `launchBundle(bundle, background bool)`: background면 `/usr/bin/open -g <bundle> --args <background flag>`, 아니면 지금처럼 `/usr/bin/open <bundle>`. `-g`는 LaunchServices가 앱을 활성화하지 않고 실행하게 한다. `--args`는 새로 실행될 때만 argv로 전달되며, bootstrap은 앱이 없을 때만 실행하므로 이 조건과 맞는다.
- `Context.Launch`의 모양을 바꾸거나 `bootstrap`에 실행 방식 인자를 더한다. `onboarding start`만 background를 넘긴다. `open`은 foreground다(spec 결정 2).
- 순수 함수: `launchArgs(bundle, background) []string`. 테스트가 두 argv를 고정한다.
- flag 이름은 `/tdd`에서 정한다(예: `--doan-launch=background`). 앱은 이 flag 하나만 읽고 다른 argv는 무시한다.

## 3. app main

### 3.1 순수 규칙 `revealFor(input)`

입력: `reason`(`launch` | `onboarding-start`), `background`(실행 flag 유무, launch에만 의미), `appActive`(Doan이 맨 앞 앱인지), `windowVisible`. 출력: `{ show: "now" | "on-activate" | "none", bounce: boolean }`.

| 상황 | show | bounce |
|---|---|---|
| launch, background flag 없음 | now | false (지금 그대로) |
| launch, background flag 있음 | on-activate | true |
| onboarding-start, appActive | now (지금 그대로, spec 결정 3) | false |
| onboarding-start, !appActive, 창 숨김 | on-activate | true |
| onboarding-start, !appActive, 창 보임 | none (보이는 창을 앞으로 올리지 않음) | true |

### 3.2 연결

- `createWindow`: background 실행이면 `show: false`로 만든다. 지금은 `show` 기본값(true)이라 만들자마자 보인다.
- 대기(`on-activate`): main이 "활성화되면 보일 창"을 기억한다. `app.on("did-become-active")`(⌘Tab, Dock 클릭, 다른 경로 모두)에서 대기 중이면 `showWindow`를 부르고 대기를 푼다. 기존 `app.on("activate")`(Dock 클릭·reopen)는 그대로 창을 보인다. `did-become-active`는 macOS 전용 이벤트이며 Electron 45에서 쓸 수 있는지 PoC로 확인한다(§6).
- Dock 알림: `app.dock.bounce("informational")`. 한 번만 튄다.
- `appActive` 판단: Electron에는 `app.isActive()`가 없다. 후보는 `BrowserWindow.getFocusedWindow() !== null`(창이 key일 때만 참)과 `did-become-active`/`did-resign-active`로 main이 직접 추적하는 값이다. PoC에서 정한다(§6).
- `index.ts:635`의 `if (appHidden) app.show(); showWindow(win)`는 `revealFor`의 결과를 따른다. `app.show()`(앱 숨김 해제)도 앱을 활성화할 수 있으므로 `now`일 때만 부른다.
- `doan open`, 링크, 알림, 메뉴, `second-instance`, `activate` 경로는 바꾸지 않는다(spec 결정 2, 비목표).

### 3.3 숨긴 채 도는 동안

창이 숨겨진 동안에도 온보딩 세션은 지금처럼 진행된다. `window:visible`은 false로 남고(`visibilityChanged`), 썸네일은 멈춘다. 온보딩 화면이 숨겨진 창에서 상태를 갱신하는 것은 지금 Close Window로 숨긴 경우와 같다(PRODUCT §5 item 0 'First run': Close Window hides it with its state).

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| `launchArgs(bundle, background)` | `onboarding.go` | foreground argv는 지금과 같음, background는 `-g`와 flag, 공백이 든 bundle 경로 |
| bootstrap 실행 방식 전달 | `onboarding_test.go`, `open_test.go` | `onboarding start`는 background로, `open`은 foreground로 Launch를 부름 |
| `revealFor(input)` | 새 main 모듈 | §3.1 표의 다섯 사례 |
| 실행 flag 해석 | 같은 모듈 | flag 있음·없음·다른 argv 무시 |

## 5. 형식·conventions·결정 영향

- JSON Schema, 앱 socket 메시지(`v`), CLI 응답, `runtime.json`은 바뀌지 않는다.
- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.
- guide(`skill.md`)가 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다.
- ARCHITECTURE §4 'Bootstrap'의 "opens the `.app` … once (`/usr/bin/open`)"을 실행 방식에 맞게 고친다(승격 task).
- "An explicit DOAN_RUNTIME never launches" 규칙은 그대로다.

## 6. PoC 의존

증명되지 않은 가정이 셋이라 첫 task가 PoC다. 패키지된 앱(`npm --prefix app run package`)을 AGENTS.md 'Commands'의 격리 규칙으로 실행하고, 맨 앞 앱은 `osascript -e 'tell application "System Events" to name of first process whose frontmost is true'`로 읽는다.

1. `open -g <Doan.app> --args <flag>`로 실행하고 창을 `show: false`로 만들면 다른 앱이 맨 앞에 남는다. Electron이 실행을 마치며 앱을 스스로 활성화하지 않는다.
2. Electron 45에서 `did-become-active`가 ⌘Tab과 Dock 클릭 모두에서 오고, 그때 `showWindow`로 창이 보인다.
3. 켜진 앱이 맨 앞이 아닐 때 `appActive`를 믿을 만하게 읽는 방법(§3.2의 두 후보)과, `app.dock.bounce("informational")`가 서명되지 않은 앱에서 튄다.

하나라도 실패하면 구현 전에 멈추고 사용자에게 보고한다. 예를 들어 1이 실패하면 `show: false` 대신 다른 방법을 찾아야 하고, 그 선택은 spec 결정 1의 모양을 바꿀 수 있다.

## 7. POSTMORTEM에서 가져온 함정

- **2026-10-22 'A fullscreen window stayed visible after Close Window'**: 창 표시·숨김은 macOS 상태(fullscreen, 최소화)에 따라 다르게 동작한다. PoC와 `/runtime-test`에서 숨긴 창과 최소화된 창을 함께 확인한다.
- **2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking'**: 온보딩 창의 포커스가 바뀌는 지점이다. 창이 나중에 보일 때 온보딩 화면의 포커스가 첫 컨트롤에 오는지 실제 앱에서 확인한다.
- **2026-10-30 'Renaming the bundle to Doan …'**: LaunchServices 동작은 패키지된 번들에서만 확인된다. dev run으로 PoC를 대신하지 않는다.
