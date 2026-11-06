# agent-cli-terminal — tasks

순서: PoC → 순수 함수 → shell(I/O) → UI → 승격. `/ship` 하나로 진행한다.

## T1. PoC: `.command` 열기와 Cursor 하한

- `.scratch/agent-cli-terminal/`에서 확인한다.
  - `npm --prefix app run package`로 만든 `app/dist/mac-arm64/Doan.app`을 임시 `--user-data-dir`로 실행하고, 시험용 IPC 대신 `.scratch` 스크립트로 같은 쓰기·열기 경로(`fs.writeFile` 0700 → `shell.openPath`)를 재현한다. 대화상자가 뜨는지, Return 전에는 실행되지 않는지, 창을 닫으면 아무것도 실행되지 않는지 본다.
  - 스크립트 안에서 `command -v codex`가 probe(`onboarding/machine.ts`)의 결과와 같은지 본다.
  - Cursor CLI changelog·문서에서 `update` 하위 명령이 생긴 버전을 찾는다.
- 검증: 관찰 결과(대화상자 유무, 경로 일치, Cursor 하한)를 design.md 'PoC 의존'에 적는다. 대화상자가 뜨면 멈추고 사용자에게 AppleScript 대안으로 바꿀지 묻는다.
- 커밋 없음(`.scratch`). 결과는 design.md 수정과 함께 T2 커밋에 넣는다.

## T2. 순수 함수: 명령 표와 스크립트

- `terminalCommand`, `terminalScript`를 main에 추가하고 테스트한다. 하한 경계(하한 바로 아래·같음·위, suffix 있는 버전, 날짜형 Cursor 버전, 읽지 못한 버전), 네 provider의 install, Antigravity는 `null`, 작은따옴표 이스케이프, zsh·bash·기타 shell의 플래그를 다룬다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` green.
- 커밋: `feat(app): choose provider CLI terminal commands`

## T3. 순수 함수: 다시 검사할 provider

- `recheckTargets`를 renderer에 추가하고 `agentStep.ts`의 `windowFocused`가 쓰게 한다. 원인이 풀린 provider는 빠지고, 풀리지 않은 provider는 다음 포커스에도 남는다. Copilot은 `cli_missing`·`version_*`일 때만 검사한다.
- 검증: `npm --prefix app test` green(포커스 두 번 연속, 첫 검사 뒤 원인 해소, Copilot 원인 변경 케이스 포함).
- 커밋: `feat(app): recheck an agent until its install or update lands`

## T4. Shell: IPC와 파일 열기

- main에 `setup:open-install`을 추가한다(`senderAllowed.ts`, 입력은 `{ target, action }` exact 검사). ToolFacts의 `installed`로 명령을 고르고, 명령이 있으면 `<userData>/terminal/`에 스크립트를 써서 열고, 없으면 `INSTALL_URLS` 페이지를 연다. preload에 `openInstall`을 추가한다.
- 검증: `npm --prefix app test` green(입력 검사: 알 수 없는 target·action, 여분 키 거부), `npm --prefix app run build` green.
- 커밋: `feat(app): open agent install and update commands in Terminal`

## T5. UI: 첫 실행과 Settings 행

- `agentStep.ts` `install`이 새 API를 쓰고, `installRequests` 소유권을 유지한다(POSTMORTEM 2026-10-25). `agentAuthView.ts`의 helper와 오류 문구를 design.md '문구'대로 바꾸고, 결과가 `failed`이면 Open install page를 붙인다. 네 provider가 같은 helper 틀을 쓴다.
- 문구는 쓰기 전에 `doan design-skill clarify --json`을 다시 확인한다.
- 검증: `npm --prefix app test` green(두 완료 순서, `page` 결과, `failed` 뒤 Open install page), `/runtime-test`로 격리한 앱에서 Codex를 최소 버전 미만으로 만든 가짜 `SHELL` 환경을 쓰고, Update → 터미널 창 → 포커스 복귀 → 다시 검사까지 확인한다. 실제 업데이트 명령은 실행하지 않는다(창을 닫아 취소).
- 커밋: `feat(app): explain Terminal install and update in agent rows`

## T6. 승격과 정리

- `docs/PRODUCT.md` §5 item 0 'Agent step'의 Install·Update 문장과 "returning from an install page"를 현재 규칙으로 다시 쓴다.
- `docs/ARCHITECTURE.md` §7(First-run onboarding 또는 Agent authentication 근처)에 명령 표의 위치(파일 경로), 하한을 두는 이유(구버전이 `update`를 프롬프트로 받음), 스크립트 위치, renderer가 enum만 보낸다는 경계를 적는다. 명령 문자열 자체는 코드에 둔다.
- `docs/DESIGN.md`에 바뀐 helper 문구가 측정값에 영향을 주는지 확인한다. `docs/BACKLOG.md`에 다른 터미널 앱 선택, 업데이트 완료 신호를 남길지 판단한다.
- `docs/features/agent-cli-terminal/`을 삭제한다.
- 검증: `rg -n "installation page|install page" docs/PRODUCT.md docs/ARCHITECTURE.md`로 옛 규칙이 남지 않았는지 확인, `node .agents/skills/verify/scripts/verify.mjs` green.
- 커밋: 문서별로 나눈다. `docs(product): …`, `docs(architecture): …`, `docs(feature): remove agent-cli-terminal`
