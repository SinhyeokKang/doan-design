# terminal-agent-activity — tasks

착수 조건: canvas-viewport-units 배치 G가 main에 merge돼 있다(design.md 첫 줄). 아래 P1·P2는 `/tdd` 전에 끝낸다.

## P. 문구와 초안

- [ ] P1. clarify 프리셋(`go run ./cli/cmd/doan design-skill clarify --json`)으로 터미널 notice, 터미널 슬롯 접근 이름(provider별·익명), 'Terminal session' 비활성 이유, deep link 거절 안내를 정한다. design.md '표시'의 후보를 결정으로 바꾼다.
  - 검증: design.md '표시'에 확정 문구가 있다.
- [ ] P2. `/design-draft`: 버튼 없는 notice(안쪽 여백 포함), 사이드바 터미널 슬롯, 비활성 'Terminal session' 선택지와 이유 줄, deep link 거절 안내. 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`, `go run ./cli/cmd/doan ls --repo .`, 사용자 확인.

── commit: `docs(feature): terminal-agent-activity copy` / `docs(design): terminal agent activity draft` ──

## S. 형식

- [ ] T1. `schema/app-socket.v3.schema.json`(`work` 요청·응답, `v:3`, `token`, `path` pattern)과 `schema/fixtures/app-socket-v3/` valid·invalid fixture. `app/src/formats/validate.ts`·`cli/internal/formats/validate.go`에 v3 검증기. TS·Go 양쪽 fixture 테스트. 결과 `{delivered}`는 스키마에 두지 않는다.
  - 검증: `go test ./...`, `npm --prefix app test` green.
- [ ] T1b. 공유 fixture `schema/fixtures/open-link/cases.json`: 만들 경우(root, path, 기대 URL; 공백·한글·`%`·`&`가 든 경로 포함)와 거절할 URL(모르는 host·매개변수, 중복·누락, 상대 root, `.doan/canvases|ds/*.html` 밖, 빈 frame, 길이 초과).
  - 검증: T4c의 두 언어 테스트가 이 파일을 읽는다.

── commit: `feat(schema): app-socket v3 work request` / `test(schema): open-link cases` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T2. Go `workTarget`: 캔버스·ds 경로, 아직 없는 파일 허용, root 밖·심볼릭 링크·`.html` 아님·다른 디렉터리 거부, `/` 구분 상대 경로. `workSession`: sessions.go와 같은 입력 표, 모호하면 익명, `sessionSettings`와 별도 함수. 응답 해석: design.md '오류 대응' 표의 각 경우 → `delivered`.
  - 검증: `go test ./...`.
- [ ] T3. TS `applyWork`·`expireWork(state, now, lastChange)`: 시작·끝·만료(`start`와 파일 변경 중 늦은 것, 시간 제한 주입), 익명 세션과 그 `done`, 두 세션이 같은 캔버스, 목록에 없는 경로, 세션·경로 상한, 등록되지 않은 root 버림, 프로젝트 제거.
  - 검증: `npm --prefix app test`.
- [ ] T4. TS 표시 합성: `Slot` 출처(`app` | `terminal`), 우선순위(권한 > 작업 중 > 안 본 것), 같은 행에서 앱 대화 우선, 터미널 슬롯이 여는 캔버스(여럿이면 가장 최근에 바뀐 것). `canvasAgent`의 터미널 변형(앱 대화 우선, Stop 없음, 앱 turn이 끝난 뒤 전환). 같은 경로를 가진 두 worktree 사이를 오가는 테스트. 'Terminal session' 선택지 판정(세션 `provider:id`가 작업 중이면 비활성).
  - 검증: `npm --prefix app test`.
- [ ] T4b. TS `mergeClaudeAllow(text)`: 기존 키·allow 항목 보존, 없는 규칙만 더함, 다시 적용해도 같음, 읽을 수 없음·깨진 JSON·다른 형태는 쓰지 않음.
  - 검증: `npm --prefix app test`.
- [ ] T4c. Go `canvasLink(root, path)`, TS `parseOpenLink(url)`: 둘 다 `open-link/cases.json`을 읽는다. TS 링크 대기(시작 중 마지막 링크만 남김, 준비된 뒤 한 번 처리).
  - 검증: `go test ./...`, `npm --prefix app test`.

── commit: `feat(cli): doan work rules` / `feat(app): open link parsing` / `feat(app): terminal work state` / `feat(agent-setup): merge the Claude Code allow rule` ──

## U. 셸·UI

- [ ] T5. `doan work start|done` 명령: `done`의 경로 인자와 결과 `{delivered, links}`(앱이 없어도 링크), `DOAN_APP_CONVERSATION=1`이면 보내지 않음, socket 전송(2초 `activeTimeout` 계약), design.md '오류 대응' 표대로 `delivered:false`·exit 0, `usage_error`·`repo_not_found`는 exit 2, 앱을 띄우지 않음.
  - 검증: `go test ./...`. 앱 없이, 표의 각 경우를 흉내 낸 socket으로 exit 0과 `delivered`를 테스트한다.
- [ ] T6. app main: `runtime.ts` `answerLine`의 v3 분기(schema → token → 등록된 root, `path` 재확인), 활동 상태 모듈, 폴더 갱신 `{root, changed}`에서 변경 신호, 만료 타이머, 주 창 전용 `get`·`changed` IPC(`{session, provider, root, path}` 목록), 프로젝트 제거 시 정리. `agentEnv`·`providerEnv`에 `DOAN_APP_CONVERSATION=1`, `providerEnv` `RESERVED`에 추가.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] T7. Agent setup: `~/.claude/settings.json`에 허용 규칙 쓰기(`~/.claude`가 있을 때, 쓰기 직전 다시 읽기, Codex rule과 같은 의존), 실패·건너뜀을 About 결과에 보이기. 규칙 문자열은 설치된 Claude Code 문서로 확인해 근거를 커밋 메시지에 남긴다.
  - 검증: `npm --prefix app test`(`runner.test.ts`), `npm --prefix app run typecheck`.
- [ ] T8. 사이드바 터미널 스피너와 클릭, Agent indicator의 터미널 변형과 버튼 없는 notice(P1 문구), 'Terminal session' 선택지 비활성과 이유 줄.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] T8b. Deep link: `app/package.json` `build.protocols`에 `doan`, `ready` 전에 `open-url` 등록, 시작 복원 뒤 처리, 등록된 root·목록에 있는 캔버스만 이동(Quick Open 경로, frame은 선택을 바꾸지 않는 프레임 이동), 거절 안내, 창 보이기. 개발 실행은 등록하지 않음.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run package` 뒤 `Doan.app/Contents/Info.plist`에 `CFBundleURLTypes` `doan`이 있다.
- [ ] T9. 가이드(`cli/internal/cli/skill.md`)에 두 명령과 부르는 때: 편집 전 `start`, 응답을 끝내기 전에 `done`(사람에게 질문하려고 멈출 때도), 긴 작업 중에는 `start` 다시, `done`에 고친 캔버스 경로를 넘기고 결과의 링크를 마지막 답에 보이기, 프레임을 가리킬 때 `&frame=`.
  - 검증: `go test ./...`(스킬 테스트가 `doan work start`·`doan work done`을 확인).

── commit: `feat(cli): doan work` / `feat(app): app-socket v3 work` / `feat(agent-setup): allow doan work in Claude Code` / `feat(sidebar): terminal agent working spinner` / `feat(canvas): agent indicator for terminal sessions` / `feat(canvas-panel): hold terminal continue while it works` / `feat(app): doan:// deep links` / `docs(skill): doan work` ──

## R. 확인

- [ ] T10. `/agent-eval`: eval runner 변경과 새 시나리오.
  - fake 앱(`eval/lib/socket.ts`)이 v3 `work`를 받고 요청마다 받은 시점의 대상 캔버스 내용 해시를 기록한다. `CheckContext`(`eval/lib/types.ts`)에 `work()` 접근자.
  - check: `start_before_edit`(그 경로의 첫 `start` 시점에 파일이 seed와 같거나 없음), `done_at_end`(마지막 `done` 시점에 파일이 최종 내용), `start_path`(`start` 경로가 바뀐 캔버스).
  - fail fixture: 편집 뒤 `start`, `done` 빠뜨림.
  - 마지막 답의 링크는 check가 아니라 `rubric.md`에 적어 judge가 본다.
  - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` `self-test PASS`·exit 0. `npm --prefix app run package` 뒤 실제 라운드에서 Claude Code와 Codex가 모두 통과한다. 아니면 가이드(T9)를 고쳐 다시 돈다. 결과를 `docs/USABILITY-EVAL.md`에 기록한다.
- [ ] T11. `/design-sync`: 버튼 없는 notice, 터미널 슬롯, 비활성 'Terminal session' 선택지를 P2 초안과 실제 앱에서 잰다.
  - 검증: 측정값이 초안과 맞고 `docs/DESIGN.md`에 기록된다.
- [ ] T12. `/runtime-test`: 격리된 HOME·userData에서 앱을 켜고 `doan work start|done`을 직접 불러 스피너·indicator가 뜨고 사라지는지, 만료, 아직 없는 경로가 생길 때, 같은 경로의 두 worktree, 'Terminal session' 비활성과 복귀, 앱이 꺼졌을 때 명령이 바로 끝나는지 본다. 패키지된 `app/dist` 사본으로 `open "doan://…"`을 불러 꺼진 앱과 켜진 앱에서 캔버스·프레임이 열리는지, 등록되지 않은 root와 목록에 없는 캔버스의 안내를 본다. macOS Terminal, iTerm2, Orca가 `doan://` 링크를 눌러지게 그리는지 기록한다. scheme을 어느 사본이 받는지는 macOS Launch Services가 정하므로, 링크를 받은 앱 경로도 기록한다(실제 `/Applications` 사본이 받으면 그 실행을 멈추고 사용자에게 묻는다).
  - 검증: runtime-test 스크린샷과 상태 로그.
- [ ] T13. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

── commit: `feat(eval): doan work scenario and fake app v3` / `docs(usability-eval): doan work round` / `docs(design): terminal agent activity measurements` ──

## Z. 정리

- [ ] Z1. 현재 규칙으로 고친다.
  - PRODUCT §5 item 0 'Agent setup'(Claude 허용 규칙), item 1 사이드바 row slot(터미널 작업 중), item 2 'Agent indicator'(터미널, Stop 없음, 앱 대화 우선)와 'Terminal session'(작업 중이면 비활성), item 3 'Design navigation'에 'Deep links'(이동만, 등록된 root·목록에 있는 캔버스, 개발 실행 미등록).
  - ARCHITECTURE §1 'Agent rules'(`doan work`), §4 머리말(`work`가 앱을 쓰는 명령)과 v3 Dispatch 분기, §7 'Shell activity'(새 출처), 'Agent setup'(Claude 허용 규칙, "never edits … existing agent config files" 문장), 'Agent conversation runtime and IPC'(`DOAN_APP_CONVERSATION`), §7 새 deep link 절(scheme 등록, `open-url` 대기, IPC, 보안 경계), §11 스키마 목록(`app-socket.v3`)과 `open-link` fixture, §12 명령 목록·결과 `{delivered}`·`{delivered, links}`·exit 예외, §14 eval(fake 앱 v3, `work()`).
  - BACKLOG 'Showing where the agent is working…'에서 이 feature가 다룬 부분을 고친다. README 'What works today'(터미널 작업 표시, deep link).
  - `docs/features/terminal-agent-activity/`를 지운다.
  - 검증: `/doc-check`로 고친 문서와 코드가 맞는지 확인한다.

── commit: `docs(product): terminal agent activity` / `docs(architecture): doan work and app-socket v3` / `docs(backlog): …` / `docs(readme): terminal agent activity` / `docs(feature): remove terminal-agent-activity` ──
