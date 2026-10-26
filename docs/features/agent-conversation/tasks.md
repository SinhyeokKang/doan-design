# agent-conversation — tasks

UI 없는 기반이다. 화면은 `buzz-restyle`의 대화 UI 자식이 이 IPC 위에서 만든다. 실제 에이전트를 쓰는 확인은 AGENTS.md Commands의 'Real-agent MCP check' 방식(일회성 등록, 임시 repo)을 따르고, Codex 호출은 매번 사용자 허락을 받는다(모델 경계). 실제 에이전트가 이어받거나 새로 연 세션은 실제 `~/.claude/projects`나 `$CODEX_HOME/sessions`에 기록을 남긴다. 실험은 격리 HOME과 설정 디렉터리(PoC 7 계약)에서 하고, 실제 디렉터리를 쓸 때는 사용자에게 먼저 묻는다.

e2e 게이트: comments-ui `:566` 기존 실패(부모 `buzz-restyle` Z0까지 미룸)가 남아 있는 동안은 부모 진행 규칙 5의 예외를 따른다. 전체 e2e가 그 지점에서만 멈추면 미충족으로 적고, comments-ui 뒤 suite를 모두 하나씩 돌린 결과를 함께 남긴다.

## P. PoC

### P1. 세션 id 확보 (PoC 9a)
design PoC 표 9a.
- 검증: command undecided — needs user confirmation(실험 스크립트 `.scratch/agent-conversation/`). `grep -n '9a' docs/PRODUCT.md`에 날짜·버전·결과 줄이 있다.

### P2. 전송 방식, 터미널 겹침, 실행 환경 (PoC 9b, 9d, 9e)
design PoC 표 9b·9d·9e. 권한 요청을 앱으로 넘기지 못하는 방식은 고르지 않는다. 9d에서 터미널 세션을 알아챌 수 없으면 멈추고 사용자 결정을 다시 받는다.
- 검증: command undecided — needs user confirmation. PRODUCT §6에 9b·9d·9e 줄과 고른 방식이 있다.

### P3. 수정 반영 지연 (PoC 9c)
"버튼 색을 바꿔라" 한 턴의 전송 → 파일 변경 → 다시 그리기 시간을 런타임마다 5회 잰다.
- 검증: command undecided — needs user confirmation. PRODUCT §6에 9c 줄과 측정값이 있다.

── commit: `docs(product): record agent-conversation PoC` ──

## D. 결정 반영

### D1. PRODUCT 고치기
§3 In scope에 대화 항목을 더하고 Out of scope 3·4·7을 고친다(design '결정 영향'). §7에 날짜·근거, PoC로 정한 전송 방식, 세션 기록 경로, 이어받기 방식, Codex 지원 범위, FirstPrompt가 Send로 바뀔 예정임을 적는다. §4 Loop와 In scope 2·3은 대화 UI 자식이 고친다고 함께 적는다.
- 검증: `grep -n 'Conversation' docs/PRODUCT.md`의 §3 줄이 새 문장이고, §7에 이 feature의 줄이 있다.

### D2. 스킬 변경 판단
PoC 결과를 보고 `doan skill` 본문에 대화 관련 문장이 필요한지 정한다. 바꾸면 그 변경을 C1 커밋에 넣고 `/agent-eval`을 돌린다.
- 검증: 바꾸지 않으면 결정을 PRODUCT §7에 한 줄로 남긴다. 바꾸면 `node eval/run.ts` 라운드 결과가 `docs/USABILITY-EVAL.md`에 있다.

── commit: `docs(product): open live agent conversation` ──

## S. 포맷

### S1. `sessions.v1` 스키마와 픽스처
JSON Schema와 정상·오류 픽스처(design '포맷 변경'의 오류 목록), TS와 Go 등록 목록 갱신.
- 검증: `go test ./...`와 `npm --prefix app test`의 스키마 픽스처 테스트 green, 두 쪽 등록 목록 테스트가 새 파일을 포함한다.

── commit: `feat(formats): add the session record schema` ──

## T. 순수 함수

### T1. 테스트 (`/tdd`)
design '순수 함수로 분리할 부분' 1~8. 다음 경우를 각 함수 테스트에 넣는다.
- `pickSession`: 기록 없음, 같은 캔버스 기록 둘(`at` 순서와 같은 `at`), 시계가 뒤로 간 기록, 삭제되거나 옮겨진 캔버스, 다른 worktree(`root`), root 밖 `cwd`, CLI 없음, Codex 세션 id 없음.
- 변환: 에이전트 비정상 종료, 로그인 안 됨, 권한 요청과 답.
- `foldConversation`: 턴 중간 종료(`crashed`), 답하지 않은 권한 요청(`expired`), 새 대화로 보관, `newDesign` 대화가 첫 캔버스에 묶임.
- `anchorTokens`: 빠진 번호, 남는 앵커, 상한 초과.
- `turnState`: `waitingPermission`에서 중단과 종료, 실행 중 `send`(`busy`).
- `turnPrompt`: 지시문이 담긴 캔버스 글자.
- `agentEnv`: 상속받은 세션 변수 제거, `DOAN_RUNTIME` 전달.
- Go: 세션 변수 없음, 두 런타임 변수가 함께 있음, 잘못된 `DOAN_RUNTIME`, 해시가 같은 캔버스.
- 검증: `npm --prefix app test`와 `go test ./...`에서 새 테스트 red.

### T2. 구현 (`/implement`)
- 검증: 같은 명령에서 green, `npm --prefix app run typecheck`와 `go vet ./...` 통과.

── commit: `test(app): pin agent conversation rules` / `feat(app): add agent conversation rules` (Go 쪽은 `test(cli)`/`feat(cli)`) ──

## C. CLI

### C1. `check`가 세션을 기록
`doan check`와 MCP `check`가 끝날 때 바뀐 캔버스만 기록한다. userData 디렉터리가 없거나 경로 계산·쓰기가 실패하면 건너뛴다.
- 검증: `go test ./...` — 테스트는 세션 환경 변수를 지우거나 고정하고 `DOAN_RUNTIME`을 임시 경로로 둔다. 확인 항목: 임시 디렉터리에 기록, 세션 id 없으면 기록 없음, 디렉터리 없으면 파일을 만들지 않음, 쓰기 실패해도 exit code와 출력 동일, `DOAN_RUNTIME` 없을 때 실제 기본 경로를 건드리지 않음, 프로세스 여러 개가 동시에 append해도 모든 줄이 파싱됨.

── commit: `feat(cli): record the agent session a check ran in` ──

## A. 앱 main

### A1. 실제 상태 감시 확장
`app/e2e/real-state.ts`에 `sessions.jsonl`과 `conversations/`를 더한다. 먼저 일부러 실제 경로에 쓰는 임시 단계로 검사가 실패(red)하는 것을 본 뒤 그 단계를 지운다.
- 검증: `node --test 'app/e2e/*.test.ts'` green, red 확인 기록.

### A2. 에이전트 실행기와 대화 저장
P2에서 고른 방식으로 열기(`resume`/`new`/`newDesign`), 보내기, 스트리밍, 권한 답, 중단, 닫기·다시 열기, 저장(받는 즉시 append)과 재시작 복원. 프로세스 그룹 종료.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

### A3. IPC와 preload
design 'IPC 계약'(main 창 한정, 입력 검증, 오류 코드).
- 검증: `npm --prefix app test`(저장되지 않은 root → `project_not_open`, 목록에 없는 캔버스 → `canvas_not_found`, 크기 상한, 다른 창 발신 거절), `npm --prefix app run build`.

### A4. 프로세스 수명과 종료
before-quit 정리, 창 숨김 뒤 Quit, 실행 중 Quit.
- 검증: 아래 E1의 종료 단계.

── commit: `test(app): watch conversation files in real-state checks` / `feat(app): run agent conversations` ──

## E. 검증

### E1. 가짜 에이전트 e2e suite
`app/e2e/`에 새 suite를 두고 `runtime.ts`가 불러온다. 가짜 에이전트는 가짜 SHELL이 내보내는 PATH 안에 두고(온보딩 suite 방식), P2에서 고른 전송 방식의 출력을 흉내 낸다. 단계:
1. 임시 `DOAN_RUNTIME`과 가짜 `CLAUDE_CODE_SESSION_ID`로 CLI `check`를 돌려 세션 기록을 남긴다.
2. `resumeTarget` → resume 열기 → 이벤트 순서.
3. 권한 요청이 이벤트로 올라오고 답이 돌아간다.
4. 가짜 에이전트가 캔버스를 쓰면 다시 그려진다.
5. 스트리밍 중 렌더러를 다시 불러와도 `read`와 `seq`로 빠짐과 중복이 없다.
6. 실행 중 `send` → `busy`.
7. 중단.
8. 가짜 에이전트 비정상 종료 → `turn.failed{process_exited}`.
9. 에이전트를 PATH에서 뺀 상태 → `cli_missing`.
10. 같은 캔버스에서 새 대화 시작 → 이전 대화 보관, 메시지 하나에 앵커 둘.
11. 재시작 뒤 복원.
12. 권한 대기 중 Quit, 창 숨김 뒤 Quit → 정리와 exit 0.

suite 끝 조건에 실제 사용자 상태 불변과 가짜 에이전트 프로세스가 남지 않았음을 넣는다.
- 검증: `npm --prefix app run e2e` 최종 PASS. 위 e2e 게이트 예외에 해당하면 미충족으로 적고 comments-ui 뒤 suite를 모두 하나씩 돌린 결과(단독 실행 명령은 command undecided — needs user confirmation)를 함께 남긴다.

### E2. 실제 에이전트 관찰
임시 repo와 격리 설정에서 Claude Code(그리고 지원되면 Codex)가 캔버스를 쓰고 `doan check` → 앱 IPC로 resume 대화 한 턴 → 캔버스 변경 반영. 통과 기준: 한 턴 안에 `message.done`과 `turn.done`이 오고, 캔버스 파일이 바뀌고, 앱이 다시 그리며, 9d 방식으로 원래 세션 파일을 비교한 결과가 기록된다. Codex는 사용자 허락 뒤.
- 검증: command undecided — needs user confirmation. 관찰을 PRODUCT §6에 날짜·버전과 함께 기록한다.

### E3. 마감 게이트
- 검증: `node .agents/skills/verify/scripts/verify.mjs --runtime`. 위 e2e 게이트 예외를 따른다.

── commit: `test(app): cover agent conversations end to end` ──

## Z. 승격

### Z1. 결론 승격과 삭제
- PRODUCT: §5 feature 목록, §7.
- ARCHITECTURE: §4 세션 기록과 `DOAN_RUNTIME` 범위, §5 `readOnlyHint` 근거, §7 대화 실행기·IPC 계약·수명·실행 환경, §11 `sessions.v1`과 기기 로컬 대화 파일.
- DIRECTORY: 대화 모듈과 새 e2e suite.
- AGENTS.md Commands: `check`의 "read-only" 문구, `real-state` 감시 목록 설명, suite 단독 실행 명령(정해졌다면).
- 그 뒤 `docs/features/agent-conversation/`를 지운다.
- 검증: `grep -n 'agent-conversation' docs/PRODUCT.md`에 §5·§7 줄, `grep -n 'sessions.v1' docs/ARCHITECTURE.md`에 줄, `grep -n 'conversation:start' docs/ARCHITECTURE.md`에 IPC 계약 줄, `test ! -d docs/features/agent-conversation`.

── commit: `docs(product): promote agent conversation` / `docs(architecture): record agent conversation` / `docs(directory): add conversation module` / `docs(agents): note the session record side effect` / `docs(feature): remove agent-conversation after promotion` ──
