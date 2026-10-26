# agent-conversation — tasks

UI 없는 기반이다. 화면은 `buzz-restyle`의 대화 UI 자식이 이 IPC 위에서 만든다. 실제 에이전트를 쓰는 확인은 AGENTS.md Commands의 'Real-agent MCP check' 방식(일회성 등록, 임시 repo)을 따르고, Codex 호출은 매번 사용자 허락을 받는다(모델 경계).

## P. PoC

### P1. 세션 id 확보 (PoC 9a)
Claude Code의 Bash 자식과 MCP 서버 자식에서 세션 id를 읽고, Codex의 대응 경로를 찾는다.
- 검증: command undecided — needs user confirmation(실험 스크립트는 `.scratch/agent-conversation/`; 결과를 PRODUCT §6에 날짜·버전과 함께 기록).

### P2. 전송 방식 (PoC 9b, 9d, 9e)
직접 CLI 스트리밍과 ACP 어댑터를 같은 시나리오로 비교하고, 터미널 세션과의 겹침과 실행 환경을 확인한다.
- 검증: command undecided — needs user confirmation(같은 기록 방식).

### P3. 수정 반영 지연 (PoC 9c)
- 검증: command undecided — needs user confirmation.

── commit: `docs(product): record agent-conversation PoC` ──

## D. 결정 반영

### D1. PRODUCT §3·§4 고치기
Out of scope 3·4·7과 Loop 4를 새 범위로 고치고, §7에 날짜·근거, PoC로 정한 전송 방식과 세션 기록 경로를 적는다.
- 검증: `grep -n 'Conversation' docs/PRODUCT.md`의 §3 줄이 새 문장이고 §7에 2026-10-26 이후 줄이 있다.

── commit: `docs(product): open live agent conversation` ──

## S. 포맷

### S1. `sessions.v1` 스키마와 픽스처
ARCHITECTURE §11의 공유 포맷 위치에 JSON Schema와 정상·오류 픽스처를 둔다.
- 검증: `go test ./...`와 `npm --prefix app test`의 스키마 픽스처 테스트 green.

── commit: `feat(formats): add the session record schema` ──

## T. 순수 함수

### T1. 테스트 (`/tdd`)
design '순수 함수로 분리할 부분' 1~7의 테스트. 런타임 출력 변환은 PoC에서 얻은 실제 출력 줄을 픽스처로 쓴다.
- 검증: `npm --prefix app test`와 `go test ./...`에서 새 테스트 red.

### T2. 구현 (`/implement`)
- 검증: 같은 명령에서 green, `npm --prefix app run typecheck`와 `go vet ./...` 통과.

── commit: `test(app): pin agent conversation rules` / `feat(app): add agent conversation rules` (Go 쪽은 `test(cli)`/`feat(cli)`) ──

## C. CLI

### C1. `check`가 세션을 기록
`doan check`와 MCP `check`가 끝날 때 세션 기록을 남긴다. 실패는 결과에 영향이 없다.
- 검증: `go test ./...`(임시 userData 디렉터리에 기록, 세션 id가 없으면 기록 없음, 쓰기 실패해도 exit code와 출력 동일).

── commit: `feat(cli): record the agent session a check ran in` ──

## A. 앱 main

### A1. 에이전트 실행기와 대화 저장
P2에서 고른 전송 방식으로 열기(`resume`/`new`/`newDesign`), 보내기, 스트리밍, 권한 답, 중단. 저장과 재시작 복원.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

### A2. IPC와 preload
design 'IPC 계약'을 노출한다.
- 검증: `npm --prefix app test`(IPC 입력 검증 테스트), `npm --prefix app run build`.

### A3. 프로세스 수명과 종료
before-quit 정리, 창 숨김, 실행 중 Quit.
- 검증: 아래 E1의 종료 단계.

── commit: `feat(app): run agent conversations` ──

## E. 검증

### E1. 가짜 에이전트 e2e suite
`app/e2e/`에 새 suite를 두고 `runtime.ts`가 불러온다. 가짜 에이전트(온보딩 suite의 가짜 에이전트처럼 PATH 앞에 둔 스크립트)가 선택한 전송 방식의 출력을 흉내 낸다. 단계: 세션 기록 → resume 열기 → 스트리밍 순서 → 에이전트가 보낸 권한 요청이 이벤트로 올라오고 답이 돌아감 → 캔버스 파일 쓰기와 다시 그리기 → 중단 → 재시작 뒤 대화 복원 → 실행 중 Quit의 정리와 exit 0. 실제 사용자 상태 불변 검사 포함.
- 검증: `npm --prefix app run e2e` 최종 PASS. 단 comments-ui `:566` 기존 실패가 남아 있으면(부모 `buzz-restyle` Z0 전) 새 suite를 `node e2e/<suite>.ts`로 따로 돌린 PASS와 함께 기록한다.

### E2. 실제 에이전트 관찰
임시 repo에서 Claude Code와 Codex가 캔버스를 쓰고 `doan check` → 앱 IPC로 resume 대화 한 턴 → 캔버스 변경 반영. Codex는 사용자 허락 뒤.
- 검증: command undecided — needs user confirmation(관찰 기록을 PRODUCT §6에).

── commit: `test(app): cover agent conversations end to end` ──

## Z. 승격

### Z1. 결론 승격과 삭제
PRODUCT(§5 feature 목록, §7), ARCHITECTURE(§4 세션 기록, §7 대화 실행기·IPC·수명, §11 `sessions.v1`), DIRECTORY에 승격하고 `docs/features/agent-conversation/`를 지운다. 대화 UI 자식이 쓸 IPC 계약을 ARCHITECTURE에 남긴다.
- 검증: `grep -n 'agent-conversation' docs/PRODUCT.md`에 §5·§7 줄, `grep -n 'sessions.v1' docs/ARCHITECTURE.md`에 줄, `test ! -d docs/features/agent-conversation`.

── commit: `docs(product): promote agent conversation` / `docs(architecture): record agent conversation` / `docs(directory): add conversation module` / `docs(feature): remove agent-conversation after promotion` ──
