# agent-cli-terminal — design

## 흐름

1. 사람이 Install이나 Update를 누른다. renderer는 `{ target }`(provider)만 main에 보낸다.
2. main은 자기 ToolFacts로 길을 고른다. `cli: "missing"`이면 install 명령을 고른다. `version: "unsupported"`이고 `installed`가 그 provider의 update 하한 이상이면 update 명령을 고른다. 그 밖의 경우(하한 미만, 버전을 읽지 못함, facts가 아직 없음)에는 설치 페이지로 간다.
3. 명령이 있으면 main은 `<userData>/terminal/` 안의 이전 파일을 지우고, 새 파일 `<provider>-<random>.command`를 임시 이름으로 쓴 뒤 rename한다(0700). 그다음 `shell.openPath`로 `.command`의 기본 앱(보통 Terminal.app)에서 연다. 이미 열린 창은 지운 파일을 계속 읽으므로 영향을 받지 않는다. 덮어쓰지 않으므로 기다리는 창이 바뀐 내용을 실행하는 일도 없다.
4. 스크립트는 제목과 명령을 보여 주고 Return을 기다린다. Return을 누르면 명령을 실행하고, 종료 코드에 따라 끝 문구를 고른다. 창을 닫으면 취소된다.
5. 창이 포커스를 받으면 Doan이 한 번 다시 검사한다(지금 동작). 원인이 남아 있으면 그 행의 버튼이 Check again이 된다.

결과는 `terminal`, `page`, `failed` 셋 중 하나다. `shell.openPath`는 reject하지 않고 오류 문자열을 돌려주므로, 빈 문자열이 아니면 `failed`다. 쓰기나 mkdir가 실패해도 `failed`다.

## 명령 표 (main 고정)

| provider | install (CLI 없음) | update (최소 버전 미만) | update 하한 (출처) |
|---|---|---|---|
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude update` | 2.0.67 (Claude Code CHANGELOG의 `claude update` 수정 기록) |
| Codex | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` | `codex update` | 0.126.0 (`openai/codex` 태그 `rust-v0.126.0`의 `codex-rs/cli/src/main.rs`에 `Update` 하위 명령이 있고 0.125.0에는 없음) |
| Cursor | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent update` | 미확인 (T1). 2026.10.22에는 있음 |
| GitHub Copilot | `curl -fsSL https://gh.io/copilot-install \| bash` | `copilot update` | 0.0.396 (github/copilot-cli changelog "Add `copilot version` and `copilot update` commands") |

- 출처(2026-11-06 확인): install 명령은 각 provider의 현재 `INSTALL_URLS` 페이지에서 가져왔다. Codex 명령은 Codex 소스 `codex-rs/tui/src/update_action.rs`의 `StandaloneUnix`와 같다. Copilot 페이지에는 brew와 npm 명령도 있지만, Node나 Homebrew 없이 동작하는 스크립트를 고른다. Cursor 문서는 `agent update`라고 적지만 Doan이 실행하는 이름(`providers.ts`의 `cursor-agent`)에 맞춘다. 둘은 같은 바이너리다.
- 하한을 두는 이유: 그 하위 명령이 없는 CLI는 `update`를 프롬프트로 받아 대화를 시작할 수 있다. 이는 ARCHITECTURE §7 'Versions'의 "there is no per-version feature gating"에 대한 예외이고, 사용자가 승인했다. 예외의 범위는 대화 실행 표면이 아니라 최소 버전 미만 CLI에 어떤 복구 명령을 보여 줄지 고르는 데까지다. T5에서 §7에 적는다.
- `codex update`는 설치 방식(npm, bun, brew, standalone)을 스스로 판별해 그 방식의 명령을 실행한다(`update_action.rs`). `claude update`도 패키지 관리자로 설치한 경우 그쪽으로 안내한다. 그래서 Doan은 설치 방식을 판별하지 않는다.
- 버전 비교에는 export된 `storedVersionAtLeast(installed, floor)`(`conversation/sessions.ts`)를 쓴다. `0.166.0-alpha.5.1`과 Cursor의 `2026.10.22-27dcf5f`는 앞의 세 숫자로 비교한다. `+build`가 붙은 버전은 `false`가 되어 설치 페이지로 간다. 이쪽이 안전한 방향이다.

## 스크립트

`#!/bin/sh`로 시작하고 명령을 그대로 적는다. Terminal은 `.command`를 사람의 login 대화형 shell 안에서 실행하므로, 스크립트는 그 shell의 `PATH`를 물려받는다. probe(`onboarding/machine.ts`, zsh·bash는 `-lic`)와 같은 CLI를 찾는지는 T1에서 확인한다. 셔뱅이 `/bin/sh`이므로 login shell이 fish여도 스크립트 문법은 sh로 해석된다.

출력 문구(앱 UI와 같이 영어):

```
Update Codex
This command updates Codex:

  codex update

Press Return to run it, or close this window to cancel.
```

- 성공(종료 코드 0): `Finished. Go back to Doan to continue.`
- 실패: `The command failed. See the output above.` / `To update Codex another way, open <INSTALL_URLS의 주소>`
- install은 제목이 `Install Codex`, 설명이 `This command installs Codex:`이고, 실패 줄이 `To install Codex another way, open …`이다.
- 명령, 이름, 주소는 모두 고정 표에서 나온다. 출력은 `printf '%s\n'`에 작은따옴표로 감싼 리터럴을 넘기고, 작은따옴표는 이스케이프한다.
- T1에서 Return을 기다리는 창을 닫을 때 Terminal이 "Terminate running processes?"를 묻는다면, 안내를 `Press Return to run it, or press Control-C to cancel.`로 바꾼다.

## 영향받는 구성 요소

- **app main**
  - 새 파일 `app/src/main/installCommand.ts`(명령 표, 경로 선택, 스크립트 생성).
  - 새 IPC `setup:open-install`(`senderAllowed.ts`에 추가, 입력은 `{ target }` exact 검사, `parseExternalTarget` 재사용). facts는 모듈 수준 `authIpc`의 `toolFacts(provider)`(`agentAuth/ipc.ts`)에서 읽는다. `authIpc`가 없거나 facts가 `null`이면 설치 페이지로 간다.
  - `agentAuth/ipc.ts` `check`: 지금은 원인이 `version_*`일 때만 계정 검사를 건너뛴다. 여기에 `cli_missing`을 더한다. 이 원인도 tool facts를 새로 읽어야만 풀리므로 계정 검사가 필요 없다. 이 변경이 없으면 설치 직후의 Copilot 검사가 요청 1회를 쓴다.
  - `setup:open-external`은 Open install page에서 그대로 쓴다.
- **app preload**: `openInstallPage`를 `openInstall(target): Promise<"terminal" | "page" | "failed">`로 바꾼다. Open install page용 페이지 열기 함수는 그대로 남긴다.
- **app renderer**
  - `agentStep.ts`: `installError` 문자열을 행 단위 상태 `install: { provider, result: "terminal" | "page" | "failed" | "pageFailed", checked: boolean } | null`로 바꾼다. 소유권은 지금처럼 마지막 요청(`installRequests`)에 묶는다. 포커스 복귀 검사가 끝나면 `checked`를 켠다. 원인이 풀리거나, 단계나 Settings를 떠나면 지운다. Check again은 그 provider를 `signIn.check`로 다시 검사한다.
  - `agentAuthView.ts`: 행 view가 이 상태를 받아 helper, 버튼, 알림을 정한다.
  - `Onboarding.tsx`, `SettingsAgents.tsx`: 목록 위의 `installError` 알림을 지우고 행 알림으로 옮긴다. boolean을 돌려주는 래퍼 두 개를 새 API로 바꾼다.
- **CLI (Go), skills, 공유 포맷**: 변경 없음.

## 행 상태와 문구

| 상태 | 버튼 | helper / 알림 |
|---|---|---|
| 클릭 전 | Install / Update | 지금 문구: "After you install it, Doan checks again when you return." / "After you update it, …" |
| `terminal`, 검사 전 | Install / Update | "Terminal is open with the install command. Press Return there, then come back to Doan." (update는 "update command") |
| `page`, 검사 전 | Install / Update | 클릭 전 문구 그대로 |
| `terminal`·`page`, 검사 뒤에도 원인이 남음 | Check again | 직전 helper 그대로 |
| `failed` | Install / Update | 행 알림(role=alert): "Couldn’t open Terminal to update Codex. Open the install page to update it yourself." + 버튼 Open install page (install은 "to install Codex", "to install it yourself") |
| `pageFailed` | Install / Update | 행 알림: 지금 문구 "Couldn’t open the Codex install page." |
| 원인이 풀림 | 다음 상태(Sign in, Connected) | 알림 없이 announcement 한 번: "Codex is installed." / "Codex is updated." |

- 알림이 뜰 때 포커스는 옮기지 않는다. role=alert가 읽어 준다. Tab 순서는 같은 행의 주 버튼 다음이다.
- Open install page를 누르면 알림이 사라진다. 그 뒤 포커스는 같은 행의 주 버튼으로 간다. 그 클릭도 `installRequests`의 새 요청으로 센다.
- 원인이 풀렸을 때 첫 실행은 `canAdvance`이면 지금처럼 Continue로 포커스를 옮긴다. 그 밖의 경우에는 포커스를 옮기지 않는다.
- Install을 두 번 누르면 창이 두 개 열린다. 이를 허용하고, 결과 표시는 마지막 요청을 따른다.
- 문구는 clarify 프리셋 기준 초안이다. T4 전에 다시 확인한다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `installChoice(provider, facts) → { kind: "terminal"; action: "install" | "update"; command; title; url } | { kind: "page" }` (`installCommand.ts`): 명령 표와 하한 판정.
- `terminalScript(choice, name) → string` (`installCommand.ts`): `.command` 내용. 문구, 이스케이프, 종료 코드 분기를 담는다.
- `installRowView(readiness, install, name) → { button, helper, notice }` (`agentAuthView.ts`): 위 표.

## 포맷 변경

없음. JSON Schema, `v`, 공유 fixture 모두 그대로다. `AuthStatusDto`도 바뀌지 않는다. IPC 채널 하나가 늘고, preload 함수 하나의 반환형이 바뀐다.

## 컨벤션 영향

없음. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **"Doan installs no provider CLI except the Antigravity server"** (ARCHITECTURE §7 'Versions'): 유지한다. Doan은 명령을 담은 창만 열고, 실행은 사람이 Return으로 한다.
- **"no per-version feature gating"** (같은 절): update 하한을 예외로 둔다(사용자 승인). 위 '명령 표' 참조.
- **renderer는 enum만 보낸다**: 유지하고 좁힌다. renderer는 provider만 보낸다. 명령, action, 경로는 main이 정한다.
- **'Links'** (ARCHITECTURE §7): 지금은 "main's fixed URLs"만 연다고 적혀 있다. 승격할 때 "main이 고정 표로 쓴 스크립트"를 같은 경계 문장에 더한다.
- **PRODUCT §5 item 0 'Agent step'**: "Install and Update open the provider's official installation page"와 "on returning from an install page"를 승격 task에서 다시 쓴다.
- **Launch environment** (PRODUCT §3): 터미널은 Doan의 환경을 물려받지 않는다. Terminal.app이 사람의 login shell을 새로 띄운다.

## POSTMORTEM 관련 함정

- 2026-10-25 "An older install failure replaced newer feedback": 결과 표시는 마지막 요청에만 묶는다(`installRequests`). `terminal`·`page`·`failed`·`pageFailed`에서 두 완료 순서(새 요청 실패 뒤 옛 요청 성공, 그 반대)를 테스트한다. Open install page 클릭도 같은 순서 규칙을 따른다. 검색: `rg -n 'installs.current|installRequests' app/src/renderer`.
- 같은 항목의 Recurrence(UX K): Settings 테스트는 클릭 핸들러의 then/catch 끝을 기다린다. 오류가 없다는 것을 고정 시간 대기로 확인하지 않는다.
- 2026-10-30 "Packaged-app probes … focus": Playwright는 focus emulation을 켠다. 포커스 복귀 검사를 보려면 `Emulation.setFocusEmulationEnabled {enabled:false}`를 쓴다.

## PoC 의존 (T1)

- 패키징한 Doan이 userData에 쓴 `.command`를 `shell.openPath`로 열 때 Gatekeeper나 격리(quarantine) 대화상자가 뜨지 않는가. `app/package.json`에 `LSFileQuarantineEnabled`가 없으므로 Doan이 쓴 파일에는 격리 속성이 붙지 않을 가능성이 높다. 다운로드한 tester dmg와 같은 조건(앱에 격리 속성)에서도 확인한다.
- Return 전에는 실행되지 않는가. 기다리는 창을 닫을 때 Terminal이 확인 대화상자를 띄우는가. Doan이 전체 화면일 때 Terminal이 앞으로 나오는가.
- 스크립트 안의 `command -v codex`가 probe의 결과와 같은가.
- `.command`의 기본 앱이 Terminal이 아니면 무엇이 열리는가(기록만 한다).
- Cursor `cursor-agent update`가 생긴 버전. 확인하지 못하면 Cursor의 하한을 현재 최소 버전 2026.10.22로 둔다. 그러면 최소 버전 미만인 Cursor는 항상 설치 페이지로 간다.
- `copilot update`가 갱신하는 위치가 Doan이 실행하는 Copilot(`providers.ts`의 환경)과 같은가. 다르면 업데이트 뒤에도 Doan이 옛 버전을 볼 수 있다. 그 경우 Copilot update는 설치 페이지로 둔다.
- 대화상자가 뜨거나 경로가 다르면 멈추고 사용자에게 묻는다. AppleScript 대안도 자동화 권한 대화상자를 띄우므로, 자동으로 그쪽으로 바꾸지 않는다.

## 검토한 대안

- **AppleScript로 Terminal에 미리 입력**: `tell application "Terminal" to do script "print -z '<cmd>'"`. zsh에서만 편집 버퍼에 들어가고, 처음에 macOS 자동화 권한 대화상자("Doan이 Terminal을 제어하려고 함")가 뜨며, electron-builder 설정에 `NSAppleEventsUsageDescription`이 필요하다.
- **DTO에 경로 enum(`terminal`/`page`)을 실어 클릭 전 문구를 바꾸는 방식**: IPC 계약이 늘어난다. 클릭 뒤 상태로 같은 안내를 줄 수 있으므로 쓰지 않는다.
- **포커스마다 원인이 풀릴 때까지 다시 검사**: 설치가 `PATH` 밖에 깔리면 끝나지 않고 포커스마다 login shell probe가 돈다. Check again으로 대신한다.
- **Doan이 명령을 직접 실행**: 결정 "Doan installs no provider CLI"와 충돌하고, sudo나 대화형 프롬프트를 처리할 표면이 없다.
- **Codex 앱 번들 CLI 사용**: spec 비목표 참조.
