# zero-setup-agents — tasks

순서: PoC → draft → 순수 함수 → 셸(I/O)·패키징 → 문구 → 제거·About(UI) → 실제 앱·에이전트 확인 → eval → 문서 승격 → MCP 제거 feature 착수.

## T0. 프로바이더 표 PoC (사용자 허락: 2026-10-31)

- 환경: 임시 HOME(`<tmp>/home`)에 `Library/Keychains`만 실제 폴더로 링크한다(POSTMORTEM 2026-10-30). 실제 HOME의 옛 Connect 항목(복사된 `~/.agents/skills/doan/`, 깨진 `~/.local/bin/doan`)은 건드리지 않는다. 각 CLI가 임시 HOME에서 로그인이 필요하면 그 안에서 로그인하고, 끝난 뒤 그 로그인이 만든 Keychain 항목을 지우고 확인한다.
- 배치: design.md 배치 표를 손으로 만든다. `current`는 `go build -o <tmp>/Resources/bin/doan ./cli/cmd/doan`과 원본 stub을 담은 임시 `Resources`를 가리킨다. 가짜 앱 socket과 `DOAN_RUNTIME`을 쓴다. PATH에는 `<tmp>/home/.local/bin`을 넣는다.
- 측정: 다섯 프로바이더의 외부 CLI(`claude -p`, `codex exec`, `cursor-agent -p`, `copilot -p`, Antigravity CLI)에 (1) 사용 가능한 skill 목록에 `doan`이 몇 번 보이는지, (2) `doan skill`이 실행되는지, (3) `doan active --json --repo <tmp repo>`가 가짜 서버에 닿는지를 시킨다. 각 CLI의 기본 sandbox·승인 설정은 덮어쓰지 않는다. Codex는 `-s workspace-write -c approval_policy="never"`로 사용자 레이어 `doan.rules`가 있을 때와 없을 때를 비교한다.
- 실제 상태 보호: 실행 전후로 실제 HOME의 skill 위치, `~/.local/bin`, `~/.codex/rules`, 각 에이전트 설정 파일의 목록과 해시를 비교한다.
- 기록: 아래 표. 원본 로그는 `.scratch/zero-setup-agents/t0/`.
- 검증: 다섯 행이 모두 채워지고, 배치 표의 링크 집합과 완료 조건 5의 처리가 design.md에 반영된다. Claude·Codex 명령은 AGENTS.md 'Real-agent MCP check'와 같은 일회성 호출이다. Cursor·Copilot·Antigravity 명령은 command undecided — needs user confirmation(T0에서 정해 이 줄을 고친다).

| 프로바이더 | 읽는 skill 위치 | `doan` 보인 횟수 | PATH의 `doan` | 기본 설정에서 `doan active` | 허용 방식 |
|---|---|---|---|---|---|
| Claude Code | | | | | |
| Codex | | | | `workspace-write`에서 막힘(2026-10-31 run1) | 프로젝트 레이어 `.codex/rules` `allow` rule로 성공(run2). 사용자 레이어 미확인 |
| Cursor | | | | | |
| Antigravity | | | | | |
| GitHub Copilot | | | | | |

— commit: `docs(feature): zero-setup-agents provider matrix` (문서만, 지금 브랜치)

## T0b. About 알림과 Agents lead draft (`/design-draft`)

- 새 파일 `.doan/canvases/zero-setup-agents.html`에 About 화면을 옮겨 그리고, 알림 상태(없음, foreign 1개, 여러 항목, `admin-cancelled`와 PATH 줄, `not-eligible` 세 가지)를 그린다. 새 줄에는 '코드에 없음' 표시를 단다. Agents lead의 새 문장도 그린다. 기존 `buzz-settings.html`은 고치지 않는다.
- 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`가 오류 없음. 사용자가 앱에서 draft를 확인한다.

— commit: `docs(design): zero-setup-agents About notice draft`

## T1. 순수 함수 (`/tdd` → `/implement`)

- `installEligibility`, `needsSystemLink`, `classifyTarget`, `plannedTargets`, `plan`, `codexRuleText`, `aboutNotice`(design.md '순수 함수로 뺄 부분'). `/tdd`로 먼저 red를 확인한다.
- `classifyTarget` fixture: 존재하는 대상과 깨진 대상을 모두 둔다. legacy-ours 두 꼴, Connect가 복사한 디렉터리(foreign), 상대경로 링크(foreign), `~/.local/share/doan/` 안의 이름이 다른 번들(`Doan 2.app`)을 가리키는 `current`(ours), 디렉터리로 풀리는 상위 링크, 깨진 상위 링크, `~/.claude/skills`가 `~/.agents/skills`로 풀리는 경우.
- `plan` fixture: 두 번째 실행은 `keep`만, 앱 이동은 `current`만 `replace`, foreign `current`면 의존 항목 모두 `skip`, 없는 프로바이더 폴더는 항목 없음.
- `aboutNotice` fixture: 항목 없음, 한 개, 여러 개(고정 순서), `admin-cancelled`, `not-eligible` 세 종류.
- 검증: `npm --prefix app test` green. foreign 분기와 의존 건너뛰기를 잠시 지우면 해당 테스트가 실패하는 것을 확인한다(POSTMORTEM 2026-10-25).

— commit: `feat(app): agent setup planning functions`

## T2. 시작 시 설치 실행기, `/usr/local/bin`, 패키징, 실제 상태 보호

- main `whenReady` 뒤 비동기 실행. HOME, 번들 경로, 로그인 셸 PATH를 주입받는다. 쓰기 직전 재판정, 배타적 생성, 임시 이름 + rename 교체, EEXIST는 건너뜀. 결과는 메모리에 두고 로그를 남긴다.
- `/usr/local/bin`: `needsSystemLink`일 때만 osascript 관리자 권한 실행. 취소를 userData에 기록하고 다시 묻지 않는다. osascript 실행기는 주입해 테스트에서 가짜로 바꾼다.
- `app/package.json` `build.extraResources`에 `src/main/onboarding/SKILL.md` → `skills/doan/SKILL.md` 추가. agent-auth의 `?raw` import는 그대로.
- `app/runtime/real-state.ts` 지문에 새 대상 추가(design.md '영향 받는 구성 요소').
- 검증: `npm --prefix app test` — 임시 디렉터리를 HOME으로 쓰는 실행기 테스트: `~/.local`이 없는 HOME, 프로바이더 폴더 없음/있음, 읽기 전용 부모(쓰기 실패가 결과에 기록됨), 재판정 사이에 대상이 생김(EEXIST → skip), 두 번째 실행은 아무것도 쓰지 않음, 앱 이동으로 `current` 교체, 깨진 `current`, `needsSystemLink` 참/거짓, osascript 취소 후 재실행 시 다시 묻지 않음. `node --test 'app/runtime/*.test.ts'`. `npm --prefix app run typecheck`. `npm --prefix app run package` 후 `app/dist/mac-arm64/Doan.app/Contents/Resources/skills/doan/SKILL.md`가 원본과 같고 `Contents/Resources/bin/doan`이 있다.

— commit: `feat(app): install CLI and skill links on launch`

## T3. Codex rule 파일

- `~/.codex/rules/doan.rules`를 '소유 판정' 규칙으로 쓴다(`~/.codex`가 있을 때만).
- 검증: `npm --prefix app test` — 내용이 같으면 keep, 다르면 foreign, 없으면 생성, `~/.codex`가 없으면 항목 없음. 생성된 파일로 `codex execpolicy check --rules <file> -- doan active`와 `-- doan init`이 allow(command undecided — needs user confirmation: AGENTS.md 'Commands'에 없음. 읽기 전용이라 실제 상태를 바꾸지 않는다).

— commit: `feat(app): allow doan outside the Codex sandbox`

## T4. 에이전트가 읽는 문구

- stub(`app/src/main/onboarding/SKILL.md`): "Settings… > Connections"를 "Applications에서 Doan을 열고 Settings… > About을 보라고 사람에게 안내"로 바꾼다. "다른 Doan 바이너리를 찾거나 실행하지 말라"는 그대로.
- `cli/internal/cli/active.go`, `onboarding.go`의 `app_not_running` `nextSteps`: 첫 단계 "Ask the user to open Doan"은 남기고, MCP·Settings 안내를 sandbox 안내와 Settings… > About 안내로 바꾼다(T0 결과 반영).
- `cli/internal/cli/skill.md`의 해당 문장, `app/src/main/conversation/prompt.ts`의 `PRESET_GUIDANCE`.
- 문구를 단언하는 테스트: `active_test.go`, `design_skill_test.go`, `skill_test.go`.
- eval: `eval/scenarios/D4/rubric.md`, `D4b/rubric.md`의 기대 문구.
- 검증: `go test ./...`(출력 예산 테스트 포함, `rg -n 'skillOutputBudget' cli/internal/cli`로 범위 확인), `npm --prefix app test`, `rg -n -i 'connections|Settings…' app/src/main cli/internal/cli eval/scenarios`의 결과를 하나씩 판정해 Connections를 가리키는 것이 없다.

— commit: `feat(cli): point agents to Settings… > About instead of Connections`

## T5. Connections와 MCP 등록 제거

- design.md '지우는 것' 목록. 남기는 함수와 `setup:open-external`은 그대로. Agents lead 문장(`SettingsPage.tsx`)을 T0b draft대로 바꾼다.
- 검증: `npm --prefix app run typecheck`, `npm --prefix app test`(저장된 `"connections"`가 About으로 열리는 `uiState` 테스트, Agents `stop_required` 잠금과 `SettingsTargetQueue` 유지 테스트 포함), `go vet ./...`, `rg -n 'setup:(read|run|answer|check-again|status)' app/src`가 결과 없음, `node .agents/skills/verify/scripts/verify.mjs`.

— commit: `refactor(app): remove Settings > Connections and MCP registration`

## T5b. About 알림 (`/design-sync` 포함)

- `AboutRead`에 설치 결과 필드 추가, `about:read`가 설치 promise를 기다림, Copy details에 알림 줄 포함, About 렌더링(정적 텍스트, `aria-hidden` 아이콘, `<code>` 경로).
- `/design-sync`로 T0b draft와 computed style을 맞추고 DESIGN.md에 측정값을 남긴다.
- 검증: `npm --prefix app test`(설치가 끝나기 전 `about:read`가 기다림, 알림 있음·없음·조건 불충족, Copy details 내용), `npm --prefix app run typecheck`, `node .scratch/design-sync/zero-setup-agents/measure.mjs`(AGENTS.md 'Commands'의 focused measurement 형식).

— commit: `feat(app): show skipped agent setup in About`

## T6. 실제 앱 확인 (`/runtime-test`)

- `npm --prefix app run package` 후, 임시 HOME 아래 `Applications/Doan.app`에 복사본을 두고 `<tmp HOME>/Applications/Doan.app/Contents/MacOS/Doan --user-data-dir=<tmp>`를 `app/runtime/` `isolatedEnv`(임시 HOME/SHELL/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`)로 실행한다. 가짜 SHELL은 PATH에 `~/.local/bin`을 포함해 관리자 권한 경로를 타지 않는다.
- 확인: 링크와 rule 파일이 생김, 두 번째 실행은 아무것도 바꾸지 않음, 번들을 다른 빌드로 바꿨을 때 `doan --version`과 stub이 새 것이 됨, 다른 이름의 복사본으로 옮긴 뒤 실행하면 `current`가 바뀜, foreign 대상을 둔 실행에서 About 알림이 보임, `app/dist/…`에서 실행한 복사본은 아무것도 쓰지 않고 About에 조건 불충족이 보임, Settings에 Connections가 없음.
- 실제 상태 보호: 갱신한 `real-state.ts`로 전후 비교. 임시 복사본은 `lsregister -dump`로 전후 비교 후 `lsregister -u`로 해제(POSTMORTEM 2026-10-30).
- 미검증 범위로 적는 것: translocation(단위 테스트만), 관리자 권한 대화상자(아래 1회 확인 전까지).
- 관리자 권한 경로 1회 확인: 사람이 지켜보는 가운데, PATH에 `~/.local/bin`이 없는 가짜 SHELL로 실행해 대화상자가 뜨고, 승인하면 `/usr/local/bin/doan`이 생기고, 취소하면 About에 PATH 줄이 보이는지 확인한다. 실제 `/usr/local/bin`에 쓰므로 실행 전에 사용자 승인을 받고, 끝난 뒤 링크를 지운다.
- 검증: 스크린샷과 파일 목록을 `.scratch/runtime-test/zero-setup-agents/`에 남긴다.

## T6b. 앱이 만든 배치로 실제 에이전트 확인 (실행 시 사용자 허락 필요)

- T6과 같은 임시 HOME에서 앱이 만든 링크와 rule로 T0의 측정을 다시 한다. 앱 대화 Codex의 skill 중복이 Codex를 헷갈리게 하지 않는지도 본다.
- 검증: T0 표와 같은 열로 결과를 이 파일에 남기고, 링크 집합이 T0에서 정한 집합과 같다.

## T7. `/agent-eval`

- 바뀐 stub·guide·nextSteps로 라운드를 돌린다. `/agent-eval`은 두 모델 계열을 쓰는 상시 예외라 따로 허락받지 않는다(AGENTS.md 'Runtime differences').
- eval은 실제 HOME에 rule을 쓰지 않으므로, U-006 해소 여부는 이 라운드가 아니라 T6b로 판정한다.
- 검증: `npm --prefix app run package` 후 `node eval/run.ts --self-test`가 `self-test PASS`를 출력하고 exit 0. `node eval/run.ts --round zero-setup-agents` 결과를 `docs/USABILITY-EVAL.md`에 기록하고, 바뀐 문구에서 비롯된 새 issue 행이 없다.

— commit: `docs(eval): zero-setup-agents round`

## T8. 문서 승격

- PRODUCT: §2 둘째 문단, §3 In scope 3, §5 item 0(첫 실행, Settings 카테고리, Connections 항목, 확인 후 교체 규칙, 'Not included'의 `/usr/local/bin`·관리자 권한·앱 이동 후 복구), item 8 `doan init` 문장, item 13, 'Open questions'의 sandbox Codex 첫 실행·오래된 전역 stub 항목(T6b 근거). MCP 제거 항목은 지우지 않고 T0 결과를 덧붙인다.
- ARCHITECTURE: §5 승인 원칙과 셸 경로의 차이, §6 'Stub'(두 복사본 구조), §7 'Machine setup'을 새 배치·소유 판정·허용 위치·`/usr/local/bin` 규칙으로 교체, 'Settings, setup status and first-prompt IPC'에서 setup 채널 제거와 `AboutRead` 필드, "never edits … agent config files" 문장, §9 Distribution에 번들 skill 경로.
- DESIGN.md 'Settings': Reference window 목록, 사이드바 네 행 → 세 행, Header의 Check Again, Connections 행, Lock ink, About 알림 측정값(T5b).
- DIRECTORY.md의 지운 파일과 새 모듈. AGENTS.md 'Commands'의 packaged-app 실행 주의(실행만으로 HOME과 `/usr/local/bin`에 쓴다).
- 검증: `rg -n -i 'Settings(…)? > Connections|setup:read|ConnectionRows' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md AGENTS.md app/src cli eval`가 결과 없음. POSTMORTEM, USABILITY-EVAL, `docs/features/`는 이력이라 검색에서 뺀다.

— commit: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(directory): …`, `docs(agents): …`).

## T9. MCP 제거 feature 착수와 정리

- 구현 PR이 main에 merge된 뒤 main에서 하는 문서 변경이다. `/feature`로 MCP 제거 feature를 시작한다. 입력은 PRODUCT 'Open questions'의 MCP 제거 항목과 T0·T6b 표다. sandbox를 비켜 갈 방법이 없어 MCP가 필요한 프로바이더가 있으면, 그 사실을 첫 결정 질문으로 올린다.
- 그 feature의 `docs/features/<slug>/`가 커밋되면 PRODUCT 'Open questions'의 MCP 제거 항목을 지운다.
- T0·T6b 표를 새 feature 문서로 옮긴 뒤 `docs/features/zero-setup-agents/`를 삭제한다.
- 검증: 새 feature의 spec·design·tasks 커밋이 있고, `rg -n 'zero-setup-agents' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/DIRECTORY.md AGENTS.md`가 결과 없음.

— commit: `docs(product): move MCP removal into its feature`, `docs(feature): complete zero-setup-agents`
