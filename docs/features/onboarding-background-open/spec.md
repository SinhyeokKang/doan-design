# onboarding-background-open — spec

에이전트가 `doan onboarding start`로 Doan을 열 때, 사람이 쓰고 있던 앱을 가리지 않고 포커스도 가져가지 않게 한다. Doan은 뒤에서 열리고 Dock 아이콘으로 알린다. `doan open`(캔버스 열기)은 지금처럼 맨 앞으로 온다.

## 사용자

- **사람(앱 사용자)**: 터미널이나 다른 앱에서 에이전트에게 Doan 설정을 맡긴 사람이다. 하던 작업이 Doan 창에 가리지 않는다. Doan을 보고 싶으면 Dock이나 ⌘Tab으로 전환한다.
- **에이전트**: 명령과 응답은 그대로다. guide의 `onboarding start` 설명만 "창을 보인다"에서 "뒤에서 열고 Dock으로 알린다"로 바뀐다.

## 문제 (관찰된 사실)

- `onboarding start`가 꺼진 앱을 열 때 CLI는 `/usr/bin/open <bundle>`을 부른다(`cli/internal/cli/onboarding.go:497` `launchBundle`). 이 호출은 앱을 활성화해 맨 앞으로 가져온다. 앱은 `BrowserWindow`를 `show: false` 없이 만들어(`app/src/main/index.ts:395`) 만들자마자 창을 보인다.
- 이미 켜진 앱에 `onboarding start`가 오면 main이 `app.show()`와 `showWindow(win)`을 부른다(`app/src/main/index.ts:635`). 숨긴 창도 앞으로 나와 포커스를 가져간다.
- 그래서 에이전트가 온보딩을 진행하는 동안 사람이 쓰던 앱(터미널, 편집기, 브라우저)이 Doan 창에 가리고 키 입력이 Doan으로 간다(사용자 보고, 2026-11-03).
- PRODUCT §5 item 0은 이 동작을 "the bundled CLI opens the app when it is not running for `onboarding start`"로 적고, guide(`cli/internal/cli/skill.md` Onboarding 1)는 "shows the Doan window"라고 적는다.

## 이미 정한 것 (사용자 결정)

1. `onboarding start`는 Doan 창을 사람이 쓰던 앱 뒤에 연다. 쓰던 앱은 맨 앞에 남고 포커스도 그대로다. Dock 아이콘이 한 번 튀어(informational bounce) 열렸음을 알린다.
2. 바뀌는 것은 onboarding 도구뿐이다. `doan open`(캔버스 열기)과 `doan://` 링크는 지금처럼 앱을 맨 앞으로 가져온다.

## 완료 조건

1. Doan이 꺼져 있을 때 다른 앱이 맨 앞인 상태에서 `doan onboarding start --json`을 실행하면, 명령이 끝난 뒤에도 그 앱이 맨 앞(frontmost)이고 키 포커스를 가진다. Doan은 실행 중이고 Dock 아이콘이 한 번 튄다. 응답은 지금과 같다.
2. Doan이 켜져 있고 다른 앱이 맨 앞일 때(창이 숨겨져 있든 보이든) `onboarding start`는 Doan을 활성화하지 않는다. 숨겨 둔 창도 다른 앱 위로 나오지 않는다. Dock 아이콘이 한 번 튄다.
3. 사람이 Dock 아이콘 클릭이나 ⌘Tab으로 Doan으로 전환하면 온보딩 창(또는 온보딩이 끝났으면 지금 화면)이 보인다. 숨겨져 있던 창도 이때 보인다.
4. Doan이 이미 맨 앞일 때 `onboarding start`는 지금처럼 창을 보인다(숨긴 창이면 보이고 포커스를 받는다). Dock은 튀지 않는다.
5. 세션 재사용, 입력 보존, 그 밖의 onboarding 명령(sign-in이 브라우저를 여는 것 포함)은 그대로다.
6. `doan open`과 `doan://` 링크는 앱이 꺼져 있을 때나 켜져 있을 때나 지금처럼 앱을 맨 앞으로 가져온다.
7. guide의 Onboarding 1이 새 동작을 말하고, `/agent-eval`의 온보딩 관련 시나리오가 통과한다.

## 비목표

- `doan open`, `doan://` 링크, 알림 클릭, Dock 클릭, 앱 메뉴 동작의 창 표시 규칙 변경.
- 온보딩 브라우저 sign-in이 브라우저를 앞으로 가져오는 것(사람이 승인해야 하므로 그대로).
- Antigravity 주소 붙여넣기처럼 사람이 Doan 창에서 해야 하는 단계의 안내 변경. 에이전트가 지금처럼 사람에게 Doan에서 하라고 말한다.
- macOS 밖의 플랫폼.

## 결정 (지휘자 판단, 확인 필요 시 /feature-review에서)

3. **Doan이 이미 맨 앞이면 지금 동작을 유지한다(완료 조건 4).** 가릴 다른 앱이 없고, 사람이 Doan을 보고 있으므로 숨긴 창을 보이는 편이 낫다.
