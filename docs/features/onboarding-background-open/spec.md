# onboarding-background-open — spec

에이전트가 `doan onboarding start`로 Doan을 열 때, 사람이 쓰고 있던 앱을 가리지 않고 포커스도 가져가지 않게 한다. Doan은 뒤에서 열리고 Dock 아이콘으로 알린다. `doan open`(캔버스 열기)은 지금처럼 맨 앞으로 온다.

## 사용자

- **사람(앱 사용자)**: 터미널이나 다른 앱에서 에이전트에게 Doan 설정을 맡긴 사람이다. 하던 작업이 Doan 창에 가리지 않는다. Doan을 보고 싶거나 Doan에서 할 단계가 있으면 Dock이나 ⌘Tab으로 전환한다.
- **에이전트**: 명령과 응답은 그대로다. guide가 두 가지 바뀐다. `onboarding start` 설명은 "창을 보인다"에서 "뒤에서 열고 Dock으로 알린다"로 바뀐다. 사람이 Doan에서 해야 하는 단계(Antigravity 주소 붙여넣기, 브라우저 다시 열기, `stop_required`의 대화 멈추기)에서는 Dock의 Doan을 눌러 열라고 말한다.

## 문제 (관찰된 사실)

- `onboarding start`가 꺼진 앱을 열 때 CLI는 `/usr/bin/open <bundle>`을 부른다(`cli/internal/cli/onboarding.go:497`, `launchBundle`). 이 호출은 앱을 활성화해 맨 앞으로 가져온다. 앱은 `BrowserWindow`를 `show: false` 없이 만들어(`app/src/main/index.ts:395`, `createWindow` 안) 만들자마자 창을 보인다.
- 이미 켜진 앱에 `onboarding start`가 오면 main이 `app.show()`와 `showWindow(win)`을 부른다(`app/src/main/index.ts:635`). 숨긴 창도 앞으로 나와 포커스를 가져간다.
- 그래서 에이전트가 온보딩을 진행하는 동안 사람이 쓰던 앱(터미널, 편집기, 브라우저)이 Doan 창에 가리고 키 입력이 Doan으로 간다(사용자 보고, 2026-11-03).
- PRODUCT §5 item 0은 이 동작을 "the bundled CLI opens the app when it is not running for `onboarding start` and for `doan open`"로 적고, guide(`cli/internal/cli/skill.md` Onboarding 1)는 "shows the Doan window"라고 적는다.

## 이미 정한 것 (사용자 결정)

결정 번호는 아래 '결정' 절까지 이어진다.

1. `onboarding start`는 Doan 창을 사람이 쓰던 앱 뒤에 연다. 쓰던 앱은 맨 앞에 남고 포커스도 그대로다. Dock 아이콘이 한 번 튀어(informational bounce) 열렸음을 알린다.
2. 바뀌는 것은 onboarding 도구뿐이다. `doan open`(캔버스 열기)과 `doan://` 링크는 지금처럼 앱을 맨 앞으로 가져온다.

## 완료 조건

1. Doan이 꺼져 있을 때 다른 앱이 맨 앞인 상태에서 `doan onboarding start --json`을 실행하면, 명령이 끝난 뒤에도 그 앱이 맨 앞(frontmost)이고 키 포커스를 가진다. Doan은 실행 중이고, main은 `app.dock.bounce("informational")`를 한 번 부른다. 응답은 지금과 같다. 예외: macOS가 띄우는 창(Agent setup의 관리자 암호 대화상자, 처음 여는 앱의 Gatekeeper 확인창)은 `-g`와 상관없이 맨 앞에 온다(결정 5).
2. Doan이 켜져 있고 다른 앱이 맨 앞일 때(창이 숨겨져 있든, 최소화돼 있든, 보이든) `onboarding start`는 Doan을 활성화하지 않는다. 숨긴 창이나 최소화된 창도 다른 앱 위로 나오지 않는다. 보일 창이 대기 중이 아니면 main이 bounce를 한 번 부른다. 이미 대기 중이면 다시 부르지 않는다.
3. 어떤 방법으로든(Dock 클릭, ⌘Tab, Spotlight, Mission Control 등) Doan이 맨 앞 앱이 되면 대기 중이던 창이 보인다. 최소화된 창은 복원한다(결정 4). 창이 보인 뒤 포커스는 온보딩 화면의 현재 장면 제목이나 대기 중이던 포커스 대상에 있고 `<body>`가 아니다.
4. Doan이 이미 맨 앞일 때 `onboarding start`는 지금처럼 창을 보인다(숨긴 창이면 보이고 포커스를 받는다). bounce는 부르지 않는다.
5. 세션 재사용, 입력 보존, 그 밖의 onboarding 명령(sign-in이 브라우저를 여는 것 포함)은 그대로다. 기존 onboarding 테스트(`cli/internal/cli/onboarding_test.go`, `app/src/main/onboarding/*.test.ts`)가 통과한다.
6. `doan open`과 `doan://` 링크는 앱이 꺼져 있을 때나 켜져 있을 때나 지금처럼 앱을 맨 앞으로 가져온다.
7. guide의 Onboarding 1이 새 동작을 말하고, Doan에서 할 단계마다 Dock의 Doan을 눌러 열라고 말한다. guide는 크기 예산 안에 있다. `/agent-eval` 온보딩 시나리오 O1·O2·O3·O3b가 Claude Code와 Codex 모두에서 통과하고, O2 rubric이 Doan 단계의 Dock 안내를 확인한다. 이 시나리오들은 가짜 앱에 붙으므로 guide 회귀와 안내 문구만 확인하고 실행 방식은 확인하지 않는다.

## 비목표

- `doan open`, `doan://` 링크, 알림 클릭, Dock 클릭, 앱 메뉴 동작의 창 표시 규칙 변경.
- 온보딩 브라우저 sign-in이 브라우저를 앞으로 가져오는 것(사람이 승인해야 하므로 그대로).
- Doan에서 하는 단계 자체(Antigravity 주소 붙여넣기, 브라우저 다시 열기)의 변경. 바뀌는 것은 거기로 가는 안내뿐이다.
- Agent setup의 관리자 대화상자 순서 변경(결정 5).
- macOS 밖의 플랫폼.

## 결정

3. **Doan이 이미 맨 앞이면 지금 동작을 유지한다(완료 조건 4).** 가릴 다른 앱이 없고 사람이 Doan을 보고 있으므로 숨긴 창을 보이는 편이 낫다. 예: Doan 안 대화의 에이전트가 저장소 추가를 요청받아 `start`를 부르는 경우(PRODUCT §5 item 0, 완료 뒤에도 `start` 사용). (지휘자 판단)
4. **최소화된 창도 숨긴 창처럼 다루고, 전환하면 복원한다.** 알림 클릭(`showFromNotification`)과 같다. (사용자 결정, /feature-review)
5. **macOS가 띄우는 관리자 대화상자와 Gatekeeper 확인창은 완료 조건 1의 예외다.** Doan이 뒤로 보낼 수 없고 사람의 승인이 필요한 창이다. (사용자 결정, /feature-review)
6. **guide는 Doan에서 할 단계에서만 Dock 안내를 한다.** `start` 직후에는 따로 말하지 않는다. (사용자 결정, /feature-review)
7. **CLI부터 이어지는 전체 경로(꺼진 앱 실행)는 사용자 승인 뒤 실제 HOME·실제 userData로 한 번 확인한다.** `/usr/bin/open`은 환경과 `--user-data-dir`을 넘기지 않아 격리할 수 없다(BACKLOG의 `doan open` launching a closed app 항목). (사용자 결정, /feature-review)
