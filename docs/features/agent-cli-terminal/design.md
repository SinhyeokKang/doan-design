# agent-cli-terminal — design

## 흐름

1. 사람이 Install이나 Update를 누른다. renderer는 `{ target, action }`(provider, `install` 또는 `update`)만 main에 보낸다.
2. main은 자기 ToolFacts(`installed`, main 전용 버전 문자열)로 명령을 고른다. 고를 명령이 없으면 지금처럼 설치 페이지를 연다.
3. 명령이 있으면 main은 `<userData>/terminal/<provider>-<action>.command`(0700)에 스크립트를 쓰고, `.command`의 기본 앱(보통 Terminal.app)으로 연다.
4. 스크립트는 명령을 보여 주고 Return을 기다린다. Return을 누르면 login shell에서 명령을 실행하고, 끝나면 "Doan으로 돌아가라"는 줄을 출력한다. 창을 닫으면 취소된다.
5. 창이 포커스를 다시 받으면 Doan이 다시 검사한다. 원인이 풀리지 않았으면 다음 포커스에서도 검사한다.

결과는 `terminal`, `page`, `failed` 셋 중 하나다. `failed`이면 행 아래 오류에 Open install page가 붙는다.

## 명령 표 (main 고정, renderer가 정하지 않음)

| provider | install (CLI 없음) | update (최소 버전 미만) | update 명령이 있다고 확인한 하한 |
|---|---|---|---|
| Claude Code | `curl -fsSL https://claude.ai/install.sh \| bash` | `claude update` | 2.0.67 (Claude Code CHANGELOG에 `claude update` 수정 기록) |
| Codex | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` | `codex update` | 0.126.0 (`openai/codex` 태그 `rust-v0.126.0`의 `codex-rs/cli/src/main.rs`에 `Update` 하위 명령, 0.125.0에는 없음) |
| Cursor | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent update` | 미확인 (T1 PoC). 2026.10.22에는 있음 |
| GitHub Copilot | `curl -fsSL https://gh.io/copilot-install \| bash` | `copilot update` | 0.0.396 (github/copilot-cli changelog "Add `copilot version` and `copilot update` commands") |

- 출처(2026-11-06 확인): install 명령은 각 provider의 현재 `INSTALL_URLS` 페이지에서 가져왔다. Codex 명령은 Codex 소스 `codex-rs/tui/src/update_action.rs`의 `StandaloneUnix`와 같다. Copilot 페이지에는 brew와 npm 명령도 있지만, Node나 Homebrew 없이 동작하는 스크립트를 고른다. Cursor 문서는 `agent update`로 적지만 Doan이 실행하는 이름(`providers.ts`의 `cursor-agent`)에 맞춘다. 둘은 같은 바이너리다.
- 하한보다 낮거나 버전을 읽지 못하면 update 명령을 내지 않는다. 그 하위 명령이 없는 CLI는 `update`를 프롬프트로 받아 대화를 시작할 수 있기 때문이다(구버전 Codex는 위치 인자를 프롬프트로 넘긴다).
- `codex update`는 설치 방식(npm, bun, brew, standalone)을 스스로 판별해 그 방식의 명령을 실행한다(`update_action.rs`). `claude update`도 패키지 관리자 설치이면 그쪽으로 안내한다. 그래서 Doan은 설치 방식을 판별하지 않는다.

## 영향받는 구성 요소

- **app main**: 새 IPC `setup:open-install`(`senderAllowed.ts`에 추가), 명령 표와 스크립트 생성, `.command` 파일 쓰기와 열기. `setup:open-external`은 실패 시 Open install page에서 그대로 쓴다.
- **app preload**: `openInstall(target, action)` 추가. 반환값은 `"terminal" | "page" | "failed"`.
- **app renderer**: `agentStep.ts`의 `install`과 `windowFocused`, `agentAuthView.ts`의 Install·Update helper 문구, 오류 문구. 첫 실행(`Onboarding.tsx`)과 Settings(`SettingsAgents.tsx`)가 같은 경로를 쓴다.
- **CLI (Go), skills, 공유 포맷**: 변경 없음.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `terminalCommand(provider, action, installed?) → string | null`: 명령 표와 하한 판정. install은 provider만 보고, update는 `installed`가 하한 이상일 때만 명령을 낸다. 버전 비교는 `sessions.ts`의 `atLeast`와 같은 규칙(`x.y.z[-suffix]` 앞부분 비교)을 쓴다. Cursor의 날짜형 버전(`2026.10.22-27dcf5f`)도 같은 비교로 다룬다.
- `terminalScript(command, shellRule) → string`: `.command` 파일 내용. 명령을 작은따옴표로 감싸 출력하고 실행한다. login shell 실행 플래그는 `onboarding/machine.ts`의 probe와 같다(zsh·bash는 `-lic`, 나머지는 `-lc`). 그래서 터미널에서 찾는 CLI가 Doan이 검사한 CLI와 같다.
- `recheckTargets(pending, statuses) → Provider[]`: 포커스를 받을 때 다시 검사할 provider. 원인이 `cli_missing`이나 `version_*`인 동안 목록에 남기고, 풀리면 뺀다. Copilot은 이 원인일 때만 검사하므로 요청을 쓰지 않는다(D21, `agentStep.ts`).
- `installView(cause, provider, result)` 문구 결정은 `agentAuthView.ts`의 기존 `readinessView` 안에서 바꾼다.

## 문구 (clarify 프리셋 기준 초안, 앱 UI는 영어)

- Install helper: "Opens Terminal with the install command. Press Return there, then come back to Doan."
- Update helper: "Opens Terminal with the update command. Press Return there, then come back to Doan."
- 설치 페이지로 열린 경우(하한 미만): 지금 helper 그대로("After you update it, Doan checks again when you return.").
- 터미널을 열지 못함: "Couldn’t open Terminal." + 버튼 "Open install page". 페이지도 열지 못하면 지금 문구 "Couldn’t open the <name> install page."
- 터미널 스크립트 출력: "Doan will run this command:" / 명령 / "Press Return to run it, or close this window to cancel." / 실행 뒤 "Done. Return to Doan to continue."

## 포맷 변경

없음. JSON Schema, `v`, 공유 fixture 모두 그대로다. IPC 채널 하나와 preload 함수 하나가 늘어난다.

## 컨벤션 영향

없음. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **"Doan installs no provider CLI except the Antigravity server"** (ARCHITECTURE §7 'Versions'): 유지한다. Doan은 명령을 담은 창만 열고, 실행은 사람이 Return으로 한다.
- **renderer는 enum만 보낸다** (`settings.ts` `parseExternalTarget`): 유지한다. 명령 문자열은 main의 고정 표에서만 나오고, renderer는 provider와 action만 보낸다. 스크립트 경로도 main이 정한다.
- **PRODUCT §5 item 0 'Agent step'**: "Install and Update open the provider's official installation page"가 바뀌므로 승격 task에서 다시 쓴다. "returning from an install page"도 터미널을 포함하도록 고친다.
- **Launch environment** (PRODUCT §3): 터미널은 Doan의 환경을 물려받지 않는다. Terminal.app이 사람의 login shell을 새로 띄우므로 probe와 같은 설정을 읽는다.

## POSTMORTEM 관련 함정

- 2026-10-25 "An older install failure replaced newer feedback": 결과 표시는 마지막 요청에만 묶는다(`installRequests`). 새 결과값 `terminal`, `page`, `failed`에서도 두 완료 순서(새 요청 실패 뒤 옛 요청 성공, 그 반대)를 테스트한다. 검색: `rg -n 'installs.current|installRequests' app/src/renderer`.
- 같은 항목의 Recurrence(UX K): Settings 테스트는 클릭 핸들러의 then/catch 끝을 기다려야 하고, 고정 시간 대기로 오류가 없음을 확인하지 않는다.

## PoC 의존

- **T1**: 패키징한 Doan(ad-hoc 서명)이 userData에 쓴 `.command`를 `shell.openPath`로 열 때 Gatekeeper나 격리(quarantine) 대화상자 없이 Terminal에서 실행되는가. 실행 권한이 없거나 격리 속성이 붙으면 대화상자가 뜨는데, 이 대화상자는 사용자가 이번에 겪은 "악성 코드" 경고와 같은 종류다. 대화상자가 뜨면 이 방식을 버리고 AppleScript 방식(아래 대안)으로 바꾼다.
- **T1**: 스크립트의 login shell이 probe와 같은 `PATH`를 보는가(`command -v codex`가 같은 경로).
- **T1**: Cursor `cursor-agent update`가 생긴 버전. Cursor CLI changelog나 문서 기록으로 확인한다. 확인하지 못하면 Cursor의 하한을 현재 최소 버전 2026.10.22로 둔다. 그러면 최소 버전 미만인 Cursor는 항상 설치 페이지로 가므로 Cursor Update는 사실상 지금과 같다.

## 검토한 대안

- **AppleScript로 Terminal에 미리 입력**: `tell application "Terminal" to do script "print -z '<cmd>'"`. zsh에서만 편집 버퍼에 들어가고, 처음에 macOS 자동화 권한 대화상자("Doan이 Terminal을 제어하려고 함")가 뜨며, electron-builder 설정에 `NSAppleEventsUsageDescription`이 필요하다. `.command`는 권한 대화상자 없이 사람이 쓰는 기본 터미널 앱으로 열린다.
- **Doan이 명령을 직접 실행**: 결정 "Doan installs no provider CLI"와 충돌하고, sudo나 대화형 프롬프트를 처리할 표면이 없다.
- **Codex 앱 번들 CLI 사용**: spec 비목표 참조.
