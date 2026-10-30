# zero-setup-agents — tasks

순서: PoC → 순수 함수 → 셸(I/O)·패키징 → 문구 → 제거(UI) → 실제 앱 확인 → 문서 승격.

## T0. 프로바이더 표 PoC (사용자 허락 필요)

- 임시 HOME 아래에 `~/.local/share/doan/skill`, 후보 skill 링크, `~/.local/bin/doan`을 손으로 만들고, 다섯 프로바이더의 외부 CLI(`claude -p`, `codex exec`, `cursor-agent -p`, `copilot -p`, Antigravity)로 "doan skill을 찾아 `doan skill`을 실행하라"와 가짜 앱 socket에 대한 `doan active`를 시킨다. 각 CLI의 로그인 상태가 필요하면 실제 HOME 설정을 쓰되, 실행 전후로 실제 skill 위치, `~/.codex/rules`, 각 에이전트 설정 파일을 비교한다.
- 기록할 것(이 파일 아래 표에 채운다): 읽는 전역 skill 위치, `doan` skill이 두 번 보이는지, 기본 sandbox에서 `doan active` 결과, 막히면 허용 방식, 절대경로 호출이 Codex rule에 맞는지.
- 검증: 다섯 행이 모두 채워지고, 배치 표의 링크 집합과 완료 조건 4의 처리가 정해져 design.md에 반영된다. 실행 명령은 AGENTS.md 'Real-agent MCP check'와 같은 형식의 일회성 호출이며, Cursor·Copilot·Antigravity 명령은 command undecided — needs user confirmation.

| 프로바이더 | 읽는 skill 위치 | 중복 | 기본 sandbox에서 `doan active` | 허용 방식 |
|---|---|---|---|---|
| Claude Code | | | | |
| Codex | | | `workspace-write`에서 막힘(2026-10-31 run1) | `~/.codex/rules` `allow` rule로 성공(run2) |
| Cursor | | | | |
| Antigravity | | | | |
| GitHub Copilot | | | | |

— commit: `docs(feature): zero-setup-agents provider matrix` (문서만)

## T1. 순수 함수

- `installEligibility`, `classifyTarget`, `plannedTargets`, `plan`, `codexRuleText`, `aboutNotice`(design.md '순수 함수로 뺄 부분').
- `classifyTarget` fixture는 존재하는 대상과 깨진 대상을 모두 두고, legacy-ours 두 꼴(번들 CLI 링크, 상대 Claude 링크)과 Connect가 복사한 디렉터리(foreign)를 포함한다.
- 검증: `npm --prefix app test` green. foreign 분기를 잠시 지우면 해당 테스트가 실패하는 것을 확인한다(POSTMORTEM 2026-10-25).

## T2. 시작 시 설치 실행기와 패키징

- main `whenReady` 뒤 비동기 실행. HOME과 번들 경로를 주입받고, 쓰기 직전 재판정, 배타적 생성, 임시 이름 + rename 교체. 실패는 로그만.
- `app/package.json` `build.extraResources`에 `src/main/onboarding/SKILL.md` → `skills/doan/SKILL.md` 추가. agent-auth의 `?raw` import는 그대로.
- 검증: `npm --prefix app test`(임시 디렉터리를 HOME으로 쓰는 실행기 테스트), `npm --prefix app run typecheck`, `npm --prefix app run package` 후 `app/dist/mac-arm64/Doan.app/Contents/Resources/skills/doan/SKILL.md`가 원본과 같다.

— commit: `feat(app): install CLI and skill links on launch`

## T3. Codex rule 파일

- `~/.codex/rules/doan.rules`를 '소유 판정' 규칙으로 쓴다.
- 검증: `npm --prefix app test`. 생성된 파일로 `codex execpolicy check --rules <file> -- doan active`와 `-- doan init`이 allow(읽기 전용 명령이라 실제 상태를 바꾸지 않는다).

— commit: `feat(app): allow doan outside the Codex sandbox`

## T4. stub, guide, nextSteps 문구

- stub: Settings > Connections 안내를 지우고, `doan`이 없으면 `~/.local/bin/doan`을 쓰라는 줄을 넣는다.
- `cli/internal/cli/active.go`, `onboarding.go`의 `app_not_running` `nextSteps`: MCP·Settings 안내를 sandbox가 막을 때의 안내로 바꾼다(T0 결과 반영).
- `cli/internal/cli/skill.md`의 해당 문장.
- 검증: `go test ./...`(출력 예산 테스트 포함, `rg -n 'skillOutputBudget' cli/internal/cli`로 범위 확인), `npm --prefix app test`.

— commit: `feat(cli): drop Settings > Connections from agent guidance`

## T5. Connections와 MCP 등록 제거

- design.md '지우는 것' 목록. 남기는 함수와 `setup:open-external`은 그대로.
- 검증: `npm --prefix app run typecheck`, `npm --prefix app test`, `go vet ./...`, `node .agents/skills/verify/scripts/verify.mjs`.

— commit: `refactor(app): remove Settings > Connections and MCP registration`

## T5b. About 알림

- `/design-draft`로 About 알림 줄의 draft를 먼저 그리고 사용자가 앱에서 확인한다.
- main의 마지막 설치 결과 보관, main 전용 invoke 채널, preload 메서드, About 렌더링, `aboutNotice` 순수 함수(T1에 포함).
- 검증: `npm --prefix app test`(채널 sender 검사, 알림 있음·없음·조건 불충족), `npm --prefix app run typecheck`.

— commit: `feat(app): show skipped agent setup in About`

## T6. 실제 앱 확인 (`/runtime-test`)

- 임시 HOME 아래 `Applications/Doan.app`에 패키지 복사본을 두고 실행해, 링크와 rule 파일이 생기는지, 두 번째 실행이 아무것도 바꾸지 않는지, 번들을 다른 빌드로 바꿨을 때 `doan --version`과 stub이 새 것이 되는지, foreign 대상을 건너뛰는지, `app/dist/…`에서 실행한 복사본은 아무것도 쓰지 않는지 확인한다. 실제 HOME의 링크와 `~/.codex/rules`는 전후 비교로 변하지 않았음을 확인한다.
- Settings에 Connections가 없는지, foreign 대상을 둔 실행과 `app/dist/…` 실행에서 About 알림이 보이고 정상 실행에서는 보이지 않는지 확인한다.
- 검증: `npm --prefix app run package` 후 AGENTS.md의 packaged-app 실행 명령을 임시 HOME/SHELL/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`으로 실행, 스크린샷과 파일 목록을 `.scratch/runtime-test/zero-setup-agents/`에 남긴다.

## T7. `/agent-eval`

- 바뀐 stub·guide·nextSteps로 라운드를 돌린다.
- 검증: `npm --prefix app run package` 후 `node eval/run.ts --self-test` PASS, `node eval/run.ts --round zero-setup-agents`, 결과를 `docs/USABILITY-EVAL.md`에 기록.

— commit: `docs(eval): zero-setup-agents round`

## T8. 문서 승격과 정리

- PRODUCT: §2 직전 문단, §3 In scope 3, §5 item 0(첫 실행, Settings 카테고리, Connections 항목, 'Not included'), 8번 `doan init` 문장, 'Open questions'의 sandbox Codex 첫 실행·오래된 전역 stub 항목.
- ARCHITECTURE: §6 'Stub', §7 'Machine setup'을 새 배치·소유 판정·허용 위치 규칙으로 교체, 'Settings, setup status and first-prompt IPC'에서 setup 채널 제거, "never edits … agent config files" 문장 수정, §9 Distribution에 번들 skill 경로.
- DESIGN.md의 Connections 행, DIRECTORY.md의 지운 파일, AGENTS.md 'Commands'의 packaged-app 실행 주의(실행만으로 HOME에 쓴다).
- `docs/features/zero-setup-agents/` 삭제.
- 검증: `/doc-check` 대상 문서에서 `Connections`, `setup:read`, `Connect` 검색 결과가 남지 않는다(`rg -n 'Settings > Connections|setup:read|ConnectionRows' docs app/src cli`).

— commit: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(directory): …`, `docs(feature): complete zero-setup-agents`).
