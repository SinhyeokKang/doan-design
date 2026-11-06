# agent-cli-terminal — tasks

순서: PoC → 순수 함수 → shell(I/O) → UI → 승격. `/ship` 하나로 진행한다.

## T1. PoC: `.command` 열기, 경로, Cursor·Copilot

- `.scratch/agent-cli-terminal/`에서 확인한다. 실행하는 명령은 무해한 것만 쓴다(`echo doan-poc; command -v codex`). install·update 명령은 실행하지 않는다.
  - `npm --prefix app run package`로 만든 `app/dist/mac-arm64/Doan.app/Contents/MacOS/Doan`을 Playwright `_electron.launch({ executablePath })`로 띄운다. `app/runtime/`의 격리 지원(임시 userData, HOME, 가짜 SHELL, CLAUDE_CONFIG_DIR, CODEX_HOME, real-state fingerprint)을 쓴다. `electronApp.evaluate`로 main 프로세스 안에서 쓰기(임시 이름 → rename, 0700)와 `shell.openPath`를 실행한다. 별도 Node 프로세스로 재현하지 않는다.
  - 격리 속성 조건: 같은 앱을 `<tmp HOME>/Applications/Doan.app`에 복사해 `com.apple.quarantine`을 붙이고 AGENTS 'Commands'의 격리 규칙대로 띄워 한 번 더 확인한다.
  - 관찰: 대화상자 유무, Return 전 미실행, 기다리는 창을 닫을 때 확인 대화상자, Doan 전체 화면일 때 Terminal이 앞으로 나오는지, `openPath` 반환값.
  - 경로: LaunchServices로 연 Terminal은 실제 계정의 shell과 HOME을 쓴다. 스크립트가 출력한 `command -v codex`를 실제 login shell의 읽기 전용 `$SHELL -lic 'command -v codex'` 결과와 비교한다.
  - Cursor: Cursor CLI changelog·문서에서 `update`가 생긴 버전을 찾는다.
  - Copilot: 설치된 패키지의 loader(`@github/copilot/npm-loader.js`)와 문서를 읽기만 해서, `copilot update`가 어디에 쓰고 Doan이 실행하는 환경에서 그 버전이 선택되는지 확인한다.
- 실행 명령: 명령 미정 — 사용자 확인 필요(`node .scratch/agent-cli-terminal/poc.mjs` 예정).
- 검증: 관찰 결과를 design.md 'PoC 의존'에 적는다. 대화상자가 뜨거나 경로가 다르거나 Copilot 위치가 다르면 멈추고 사용자에게 묻는다.
- 커밋: design.md 갱신만 `docs(feature): record agent-cli-terminal PoC`.

## T2. 순수 함수: 명령 선택과 스크립트

- `app/src/main/installCommand.ts`에 `installChoice`, `terminalScript`를 추가하고 테스트한다.
  - `installChoice`: 네 provider의 install. update 하한 바로 아래·같음·위. suffix가 붙은 버전(`0.166.0-alpha.5.1`), 날짜형 Cursor 버전, `+build`가 붙은 버전(page), `installed`가 없는 경우(page), 버전을 읽지 못한 경우(page). facts가 `null`이면 page, Antigravity면 page.
  - `terminalScript`: 셔뱅 `#!/bin/sh`, install·update 제목과 설명, 종료 코드 0과 그 밖의 분기 문구, 실패 줄의 주소가 `INSTALL_URLS`와 같은지, 작은따옴표 이스케이프.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` green.
- 커밋: `feat(app): choose provider CLI terminal commands`

## T3. Shell: IPC, 파일, Copilot 검사

- main에 `setup:open-install`을 추가한다(`senderAllowed.ts`, 입력은 `{ target }` exact 검사). `authIpc.toolFacts`로 `installChoice`를 부르고, 터미널이면 `<userData>/terminal/`의 이전 파일을 지운 뒤 새 파일을 임시 이름으로 써서 rename하고 연다. page면 `INSTALL_URLS`를 연다.
- `agentAuth/ipc.ts` `check`가 원인 `cli_missing`일 때도 계정 검사를 건너뛰게 한다.
- preload의 `openInstallPage`를 `openInstall(target)`으로 바꾼다.
- 테스트:
  - 입력 검사: 알 수 없는 target, `antigravity`, 여분 키(`action` 포함)를 거부한다.
  - 결과: mkdir·쓰기 실패는 `failed`, `openPath`가 빈 문자열이 아닌 값을 돌려주면 `failed`, 이전 파일이 있으면 지우고 새 이름으로 쓴다.
  - Copilot `cli_missing` check는 backend check를 부르지 않는다.
- 검증: `npm --prefix app test` green, `npm --prefix app run build` green.
- 커밋: `feat(app): open agent install and update commands in Terminal`

## T4. UI: 첫 실행과 Settings 행

- `agentStep.ts`: `installError`를 행 단위 `install` 상태로 바꾼다. `installRequests` 소유권을 유지하고(POSTMORTEM 2026-10-25), 포커스 복귀 검사 뒤 `checked`를 켜며, 원인이 풀리거나 단계를 떠나면 지운다. 원인이 풀리면 announcement를 낸다.
- `agentAuthView.ts`에 `installRowView`를 추가한다(design.md '행 상태와 문구'). Check again, Open install page 동작을 연결한다.
- `Onboarding.tsx`, `SettingsAgents.tsx`: 목록 위 `installError` 알림을 지우고, 래퍼 두 개를 새 API로 바꾼다.
- 문구를 쓰기 전에 `doan design-skill clarify --json`을 다시 확인한다.
- 테스트(`npm --prefix app test`):
  - `installRowView`의 표 전체.
  - 두 완료 순서(새 요청 실패 뒤 옛 요청 성공, 그 반대), `page` 결과, `failed` 뒤 Open install page 성공·실패, Open install page 클릭이 새 요청으로 세어지는지.
  - 포커스 복귀 뒤 원인이 남으면 Check again, 풀리면 announcement 한 번.
  - Settings에서도 같은 결과. UX K 규칙대로 클릭 핸들러의 then/catch 끝을 기다린다.
- `/runtime-test`:
  - 가짜 `SHELL`이 0.126.0 이상 0.158.0 미만인 가짜 `codex`(예: 0.150.0)를 보고하게 해서 터미널 경로를 타게 한다.
  - `Emulation.setFocusEmulationEnabled {enabled:false}`를 쓴다.
  - 첫 실행과 Settings에서 Update → 터미널 창 → 포커스 복귀 → Check again을 확인한다.
  - 실제 상태 보호: LaunchServices로 연 Terminal은 실제 HOME과 shell을 쓰므로 Return을 누르지 않고 창을 닫아 취소한다. 실제 `codex --version`이 바뀌지 않았는지 확인한다.
- 커밋: `feat(app): show Terminal install and update states in agent rows`

## T5. 승격과 정리

- `docs/PRODUCT.md` §5 item 0 'Agent step': "Install and Update open the provider's official installation page"와 "on returning from an install page"를 현재 규칙으로 다시 쓴다. Check again과 설치 페이지 대체 경로를 넣는다.
- `docs/ARCHITECTURE.md` §7: 'Versions'에 update 하한 예외와 그 이유(구버전은 `update`를 프롬프트로 받는다)를 적는다. 'Links' 경계 문장에 main이 고정 표로 쓴 스크립트를 더한다. 명령 표 위치(`installCommand.ts`), 스크립트 위치(`<userData>/terminal/`), renderer가 provider만 보낸다는 경계, Copilot `cli_missing` 검사 생략을 적는다. 명령 문자열은 코드에 둔다.
- `docs/DESIGN.md`: 'Copy outside the measured draft'(현재 317행 근처)의 install 실패 문구 문장을 새 행 알림 문구로 바꾼다.
- `docs/BACKLOG.md`: `.command`의 기본 앱이 Terminal이 아닌 경우를 실제 앱에서 보지 못했다면 남긴다. T1에서 Cursor 하한을 확인하지 못했으면 그것도 남긴다.
- `docs/features/agent-cli-terminal/`을 삭제한다.
- 검증:
  - `rg -n "open the provider's official installation page|returning from an install page" docs/PRODUCT.md`가 아무것도 찾지 않는다.
  - `rg -n "Couldn’t open the .* install page" docs/DESIGN.md`가 새 문구와 같다.
  - `node .agents/skills/verify/scripts/verify.mjs` green.
- 커밋: 문서별로 나눈다. `docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(backlog): …`(필요할 때), `docs(feature): remove agent-cli-terminal`
