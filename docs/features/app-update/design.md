# app-update — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D9(방식: `electron-updater`), D10(실행 때와 6시간마다, 뒤에서 받기, 끄는 설정), D11(켜는 사본), D12(rc 검증 = 부모 R1, 이 자식의 실제 업데이트 PoC), D23(막는 조건은 대화만), D24(표시 두 시안, 앱 메뉴, About, 데스크톱 알림 없음). 근거는 부모 '조사'의 electron-builder 26.18.0 문서와 코드다.

## 영향 범위

- **앱 main**: 새 `app/src/main/update/`(서비스, 자격 판정, 상태 기계, 오류 분류), `index.ts` 연결(시작 시 확인, 종료 흐름의 설치 지점), 앱 메뉴 항목, IPC 채널(아래 'IPC 계약'), `senderAllowed.ts` 허용 목록.
- **앱 renderer**: Settings > About의 업데이트 그룹(상태 행, "Check for updates automatically" 행), D24에서 고른 표시, 메뉴 명령. About의 업데이트 그룹은 About의 버전 읽기(`SettingsAbout.tsx`의 진입·focus 때 다시 읽기, 읽기 실패 때 페이지 전체를 바꾸는 분기)와 따로 main의 push로 갱신한다. 진행 라벨은 About의 "Checking"과 다른 "Checking for updates"다.
- **의존성**: `electron-updater`를 정확한 버전으로 `dependencies`에(AGENTS.md 'Commands'의 `--save-exact`). electron-builder 26.18.0과 맞는 판(npm `latest` 6.8.11 또는 `v26` 6.8.12)을 고른다. main은 의존성을 번들하므로(`externalizeDeps: false`, ARCHITECTURE §7 'Setup') 번들된 채로 import되는지 T4에서 빌드로 확인한다.
- **설정 저장**: `<userData>/preferences.json`(`app/src/main/preferences.ts`)에 `updates.autoCheck`(기본 true) 키를 더한다. `parsePreferences`, `parsePreferencesPatch`(:77, 지금 `notifications`·`newConversation` 밖의 키를 거부한다), `mergePreferences`를 고친다. `v: 1`을 유지한다(모르는 필드는 무시하는 규칙, :59). 이 파일은 TS 전용이라 공유 JSON Schema와 Go 픽스처는 필요 없다. 읽기 실패·새 버전 파일·저장 실패 규칙은 ARCHITECTURE §7 'Settings IPC' 'Preferences'를 따른다.
- **CLI·공유 형식(§11)·app-socket·`doan check`**: 영향 없음. `/agent-eval`도 필요 없다(가이드, CLI 출력, `doan check` 규칙, 스킬 stub을 바꾸지 않는다).
- **ARCHITECTURE 결정과의 관계**: "Doan never commits"·sandbox iframe·토큰 비취급과 무관하다. "the web only serves as the download path"(PRODUCT §3 Out of scope 5)의 연장으로 GitHub Releases만 묻는다. 승격 때 PRODUCT §3에 문장을 맞춘다.

## 순수 함수 (`/tdd` 대상)

- `updateEligibility({ isPackaged, hasFeedConfig, install })` → `enabled | disabled(reason)`. `install`은 agent setup의 `installEligibility` 결과(`app/src/main/agentSetup/plan.ts:35`, ARCHITECTURE §7 'Agent setup' 'Eligibility')다. reason은 `Ineligible`의 이유 코드(Applications 밖, translocation)를 그대로 쓰고 `dev`, `noFeed`를 더한다. 자동 확인 설정은 입력이 아니다(꺼도 수동 확인은 된다).
- `shouldCheck({ autoCheck, lastCheckedAt, now })` — 실행 직후 한 번, 그 뒤 6시간 간격. `autoCheck`가 false면 자동 확인을 하지 않는다. `lastCheckedAt`은 메모리에만 있다.
- `updateState(prev, event)` — `idle → checking → (upToDate | downloading(percent) → ready(version)) | failed(code, manual)`, `ready → restarting → (restartAborted)` 상태 기계. 같은 버전의 재확인, 받는 중 재확인, 실패 뒤 재시도, 수동 확인과 자동 확인의 겹침, `update-cancelled`를 다룬다. 입력은 electron-updater 이벤트(`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `update-cancelled`, `error`)와 앱 이벤트(수동 확인, 설치 시작, 종료 취소)다.
- `updateErrorCode(error)` → `offline | feedMissing | rateLimited | signatureMismatch | checksumMismatch | diskFull | installFailed | other`. electron-updater의 실제 오류 문구를 픽스처로 쓴다. `installFailed`는 사용자가 쓸 수 없는 `/Applications/Doan.app`에서 ShipIt이 실패한 경우를 포함한다.
- `installGate({ liveTurns, pendingAnswers })` → `allowed | blocked(reason)` (D23). `pendingAnswers`는 권한 요청과 질문을 기다리는 대화다.
- `updateView(state, eligibility, gate, autoCheck)` → About 행의 문구 키·버튼·이유 줄, 메뉴 항목 라벨과 활성, D24 표시의 보임 여부. `app/src/main/update/view.ts`에 두고 electron·Node를 import하지 않는다. renderer가 이 모듈을 import하므로 `app/src/renderer/rendererImports.test.ts` 경계 안에 있어야 한다(POSTMORTEM 2026-10-30 'A renderer import of a main module left the built app's window blank').

## 상태

문구는 T1 초안에서 clarify 프리셋으로 확정한다. 아래는 초안의 출발점이다.

| 상태 | About 행 | 동작 | D24 표시·메뉴 |
|---|---|---|---|
| 확인 전 | 지금 버전 | Check for Updates | 메뉴 "Check for Updates…" |
| 확인 중 | "Checking for updates" | — | 같음 |
| 최신 | "Doan is up to date." + "Last checked <time>" | Check for Updates | 같음 |
| 받는 중 | "Downloading Doan <v>… 42%" | — | 같음 |
| 준비됨 | "Doan <v> is ready." + Release Notes 링크 | Restart to Update | 표시 보임, 메뉴 "Restart to Update" |
| 막힘(D23) | 준비됨 + 이유 줄 "A conversation is running or waiting for your answer. Doan will update when you quit." | Restart to Update(누를 수 있고, 누르면 아무 일 없이 이유를 다시 알린다) | 같음 |
| 다시 시작 중 | "Restarting" | — | — |
| 다시 시작 중단 | "Couldn’t restart Doan. Quit and open it again to finish the update." | — | 표시 유지 |
| 실패(수동 확인·받기) | 종류별 문구, 원인을 단정하지 않는다 | Retry | 메뉴 "Check for Updates…" |
| 실패(자동 확인) | 최신과 같게 "Last checked <마지막 성공 시각>" | Check for Updates | 같음 |
| 꺼진 사본 | "Updates work when Doan is in the Applications folder." | — | 메뉴 항목은 About을 연다 |
| 피드 없는 빌드 | "Updates aren’t available in this build." | — | 같음 |

- 자동 확인 행: "Check for updates automatically". 설명에 "끄면 자동 확인만 멈추고, 받은 업데이트는 종료할 때 설치된다"를 적는다.
- 행의 결과는 페이지 live region이 한 번 읽는다. 첫 읽기와 진행률 변화는 읽지 않는다(MCP Connectors와 같은 규칙).
- 라벨은 ellipsis 규칙을 따른다(DESIGN 'Label ellipsis'): 메뉴 "Check for Updates…"는 About을 열므로 ellipsis, About 버튼 "Check for Updates"와 진행 라벨 "Restarting"은 없음.
- Release Notes는 `https://github.com/SinhyeokKang/doan-design/releases/tag/v<version>`을 브라우저로 연다(main의 `shell.openExternal`).
- Copy details 한 줄: "Updates: <상태>, last checked <time>".

## IPC 계약

ARCHITECTURE §7 'Settings IPC'의 규칙(sender 검사, 검증한 값만)을 따른다.

| 채널 | 방향 | 값 |
|---|---|---|
| `update:get` | renderer → main (invoke) | 현재 `UpdateSnapshot`(상태, 자격, 게이트, `autoCheck`, 마지막 확인 시각). renderer가 다시 로드되거나 창이 숨은 동안의 변화도 이걸로 받는다 |
| `update:state` | main → renderer (event) | 바뀐 `UpdateSnapshot` |
| `update:check` | invoke | 수동 확인 시작 |
| `update:install` | invoke | `allowed`(다시 시작 시작) 또는 `blocked(reason)` |
| `update:openNotes` | invoke | Release 페이지 열기 |

- `UpdateSnapshot` 타입과 오류 코드 목록은 `app/src/main/update/view.ts` 옆의 validator 없는 타입 파일에 둔다(renderer import 경계 안).
- 새 채널은 `senderAllowed.ts` 허용 목록에 넣는다.
- 메뉴 항목의 라벨과 활성은 `menuState` 입력에 업데이트 상태를 더해 정한다. 활성 조건은 Settings 메뉴와 같다(첫 실행, modal, lock 중 비활성).
- 자동 확인 설정은 기존 preferences IPC로 읽고 쓴다.

## 구조

- `UpdateService`(Electron 의존 부분만): 자격이 `enabled`일 때만 `autoUpdater`를 만든다. `autoDownload`와 `autoInstallOnAppQuit`를 켠다(뒤에서 받고, 누르지 않으면 다음 종료 때 설치). `allowPrerelease`는 지금 버전이 prerelease일 때만 true로 명시한다(D12). 로그는 main 로그로만, 렌더러에는 상태와 고정 오류 코드만 보낸다(지금 onboarding이 git stderr를 내보내지 않는 원칙과 같다). 테스트는 updater 인터페이스를 주입한다.
- **설치 경로**: Restart to Update를 누르면 main이 `installGate`를 다시 보고(POSTMORTEM 2026-10-25 toast 항목), 허락되면 `installPending = true`를 세우고 `app.quit()`을 부른다. 기존 `before-quit` → `quitInOrder`(`app/src/main/index.ts:1215–1262`)가 그대로 돌아 대화를 저장하고 상태를 flush하며 `quitting = true`가 된다. `quitInOrder` 끝의 `app.quit()`(:1261)을 `installPending`이면 `autoUpdater.quitAndInstall()`로 바꾼다. 이때 `quitting`이 참이라 창이 숨지 않고 닫힌다. 대화 저장이 종료를 취소하면 설치하지 않고 `restartAborted`가 되며, 받은 업데이트는 다음 종료 때 `autoInstallOnAppQuit`로 설치된다.
- **D23 범위**: 막는 것은 대화(턴, 권한 요청, 질문)뿐이다. 진행 중인 clone, 에이전트 로그인, MCP 연결은 `before-quit`이 지금처럼 취소한다(`index.ts:1235–1250`).
- 피드 계약(release-ci): `Contents/Resources/app-update.yml`이 없으면 `hasFeedConfig = false`. 테스트 빌드와 로컬 패키지에는 없다.
- 링크: `~/.local/share/doan/current → realpath(process.resourcesPath)`는 같은 경로에서 번들이 바뀌어도 그대로라 `~/.local/bin/doan`, `/usr/local/bin/doan`, 스킬 링크를 고칠 필요가 없다(ARCHITECTURE §7 'Agent setup'). 업데이트가 일상이 되면 `codexRuleText()`가 바뀐 버전에서 옛 `doan.rules`를 남의 것으로 보고 갱신하지 않는다(ARCHITECTURE §7 'Ownership'). 이 버전 간 이전 문제를 승격 때 BACKLOG에 남긴다.

## 확인 (PoC 대신)

- 실제 업데이트(Squirrel.Mac 교체, 피드, 서명, 다시 열림, `~/.local/share/doan/current`)는 부모 R1(rc.1 → rc.2)에서 확인한다(D12). 서명되고 피드가 켜진 PoC 빌드를 따로 만들지 않는다. 실패하면 `develop`에서 고친 뒤 rc.3으로 다시 본다.
- 코드로 답이 나온 것(부모 '조사'): rc도 `latest-mac.yml`, zip 안 앱은 스테이플됨, electron-builder는 태그를 만들지 않음.
- 번들된 `electron-updater`가 main 번들에서 import되는지는 T4의 `npm --prefix app run build`와 패키지 실행으로 확인한다.
- 종료 순서는 `index.test.ts`의 순서 테스트로 고정한다(설치는 flush 뒤, 종료 취소면 설치 없음).

## UI (D24)

- `/design-draft`로 `.doan/canvases/app-update.html`을 그린다. 프레임: About 업데이트 그룹의 상태별 행(위 '상태' 표 전부), 자동 확인 행(켜짐·꺼짐), 표시 시안 (a) 앱 헤더 오른쪽 끝·에이전트 사용량 표시보다 오른쪽, (b) 사이드바 하단 오버레이(각각 준비됨·막힘), Doan 메뉴의 두 라벨. 사용자가 (a)와 (b) 중 하나를 고르고, 고른 결과를 이 문서에 적는다.
- 기존 공용 프리미티브를 쓴다. 문구는 clarify 프리셋을 먼저 읽고 쓰고, 실패·꺼짐 상태는 harden 프리셋을 본다. 디자인 프리셋은 `doan design-skill --json`으로 목록을 보고 필요한 것만 읽는다(AGENTS.md 'Design presets in development skills').

## 공통 함정

- POSTMORTEM 2026-10-30(서명 정체성): R1의 두 rc는 같은 Team ID로 서명된다(release-ci). R1 전후에 `lsregister -dump`로 `design.doan.app` 등록을 확인한다.
- POSTMORTEM 2026-10-25 'Calling the Quit menu item's JS click did not quit macOS Electron': 종료와 재실행은 사건(새 프로세스의 버전)으로 확인한다.
- POSTMORTEM 2026-10-25 'A toast's Open was dropped while its project was still loading': 동작은 누를 때 상태를 다시 본다(`installGate`를 클릭 시점에).
- POSTMORTEM 2026-10-25 'A crash during quit teardown lost the debounced ui-state': 설치는 flush 뒤에만 한다(위 '설치 경로').
