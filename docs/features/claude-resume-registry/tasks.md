# claude-resume-registry — tasks

조직 트랙(작업 1–3)은 레지스트리 PoC를 기다리지 않는다. 레지스트리 트랙(작업 4–7)만 PoC 결과를 기다린다(design.md '작업 트랙'). 두 트랙은 따로 커밋하고, 작업 8은 둘 다 끝난 뒤에 한다.

## 조직 트랙

### 1. Claude 로그인의 조직 선택 화면 확인

- 조직이 여러 개인 Claude 계정으로, 격리한 프로필에서 Claude Code 로그인을 진행해 조직을 고르는 화면이 나오는지 본다. 사람의 계정과 조작이 필요하다.
- 결과(날짜, Claude Code 버전, 보인 화면 설명)를 design.md §2에 적고, 두 문구 중 하나를 고른다. 확인할 수 없으면 방법을 단정하지 않는 문구로 정하고, 확인하지 못한 것으로 적는다.
- 검증: command undecided — needs user confirmation (사람이 하는 확인이다). design.md §2에 근거와 고른 문구가 있으면 통과.
- **커밋 경계**: 문서만 바뀌므로 작업 3과 함께 커밋해도 된다.

### 2. 테스트: `workspace_changed`와 "elsewhere" 문구 (`/tdd`)

- `prepare.test.ts`(`judgmentCode`):
  - Claude, `workspace_mismatch`, 두 조직 값이 `null`이 아님 → `workspace_changed`.
  - Claude, `workspace_mismatch`, 조직 값 중 하나가 `null` → `account_changed`.
  - Copilot, `workspace_mismatch` → `account_changed`.
  - 모든 `account_mismatch` → `account_changed`.
  - 계정 ID가 `null`이고 같은 연결이며 조직만 다름(`connection.ts` 14–18행이 `workspace_mismatch`에 이르는 경로) → `workspace_changed`.
  - 로그인 상태가 `account_mismatch` 오류를 가진 채 보냄 → 오늘의 코드(읽기로는 `not_logged_in`)가 그대로, `workspace_changed`가 아님.
- `dockedRules.test.ts`, `canvasConversation.test.ts`:
  - `workspace_changed`는 작업 1에서 고른 문구와 "Start a new conversation"(`startNew`)을 준다.
  - `account_changed` 문구는 그대로다.
  - `session_in_use`: "Couldn’t continue the terminal session: it’s open elsewhere."와 "<Provider> is using this session elsewhere. Try again when it finishes there.".
- `drafts.test.ts`: `reason: "workspace_changed"`인 돌려준 초안이 저장 뒤 그대로 읽힌다.
- 검증: `npm --prefix app test`에서 새 사례가 빨간색(구현 전, 초안 왕복 사례는 이미 초록일 수 있다).

### 3. 구현: `workspace_changed`와 "elsewhere" 문구 (`/implement`)

- `judgmentCode`가 공급자와 조직 값의 `null` 여부를 받게 한다(design.md §2). `ipc.ts` `known`에 `workspace_changed`를 더하고, `OTHER_SIGN_IN`, `RESUME_REASONS`, `SEND_ERRORS` 문구를 고친다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **커밋 경계**: `fix: refuse a Claude conversation of another organization with workspace_changed` (필요하면 "elsewhere" 문구는 `fix: say a session in use is open elsewhere`로 따로).

## 레지스트리 트랙

### 4. PoC: 데스크톱 앱 기록이 걸리는 조건 찾기

- Claude 데스크톱 앱에서 Code 세션을 열어 둔다(사람이 연다). 그 상태로 `.scratch/claude-resume-registry/probe.mjs`를 1초 간격으로 수십 번 실행하고, 세션을 닫은 뒤 한 번 더 실행한다. 읽기 전용이며 출력 항목은 design.md 'PoC 방법'을 따른다.
- 결과(번들 claude-code 버전, 날짜, 디렉터리, 걸린 단계와 필드, H1–H5 중 무엇인지)를 design.md 'PoC가 먼저 필요한 가정'에 적는다.
  - H1, H3(온전한 기록), H4, H5, 낡은 기록이면 새 판정 규칙으로 풀리므로 작업 5로 간다. H4이면 확인된 이름 형식 하나만 건너뛰기 목록에 더한다.
  - design.md '멈추고 묻는 경우'에 해당하면 멈추고 사람에게 묻는다. 해당하는 경우는 데스크톱 기록 없음, 모든 단계 통과, H2, 열린 세션이 살아 있는 것으로 판정되지 않음, 호스트 PID 영역을 가려낼 수 없음이다.
- 검증: command undecided — needs user confirmation (`node .scratch/claude-resume-registry/probe.mjs`는 AGENTS.md 'Commands'에 없다). 출력에 데스크톱 기록마다 걸린 단계가 한 줄씩 나오면 통과.
- **커밋 경계**: `docs(feature): record claude-resume-registry PoC result` (design.md만).

### 5. 테스트: 레지스트리 판정 (`/tdd`)

- `sessions.test.ts`(순수 함수 `registryIdentity`, `registryRecordVerdict`, `mergeOccupancy`, 가칭):
  - 끝난 프로세스의 기록은 형식이 어긋나거나 floor 아래여도 건너뛴다.
  - PID 재사용: 프로세스는 있지만 시작 시각이 `procStart`와 다르면 끝난 기록으로 건너뛴다.
  - 살아 있는 비대화형 기록은 대상 세션이면 `occupied`, 아니면 건너뛴다.
  - 살아 있는데 floor 아래거나 형식이 어긋난 기록은 `unknown`이다.
  - `pid`나 `procStart`를 읽을 수 없으면 `unknown`, 파일 이름의 `pid`와 기록의 `pid`가 다르면 `unknown`이다.
  - 호스트가 아닌 PID 영역의 기록: 온전하고 대상이 아니면 건너뛰고, 대상이거나 온전하지 않으면 `unknown`이다.
  - 합치기는 `occupied` > `unknown` > `free` 순이다.
- `io.test.ts`(`claudeOccupancy`):
  - "fails the whole profile closed on any other version" 사례를 새 규칙에 맞게 고친다.
  - PoC가 확인한 데스크톱 기록 형태(값은 가짜)를 사례로 더한다.
  - 섞인 경우: 끝난 낡은 기록 + 대상 세션을 쥔 살아 있는 데스크톱형 기록 → `occupied`. 믿을 수 없는 살아 있는 기록 + 대상을 쥔 기록 → `occupied`.
  - 빈 `sessions/` → `free`.
  - 읽기 권한 없음(`EACCES`) → `unknown`.
  - 깨진 JSON → `unknown`.
  - `ps` 오류 → `unknown`.
  - `readdir` 뒤 파일이 사라짐(`ENOENT`) → 건너뜀.
- 검증: `npm --prefix app test`에서 새 사례가 빨간색(구현 전).

### 6. 구현: `claudeOccupancy` 순서 변경 (`/implement`)

- 순수 함수를 `sessions.ts`에 두고, `io.ts` `claudeOccupancy`는 디렉터리 읽기, `ENOENT` 건너뛰기, 생존 확인, 결과 합치기만 하도록 바꾼다. 레지스트리 디렉터리가 없거나 읽을 수 없으면 `unknown`인 규칙, `.key` 건너뛰기, `procStart` 비교는 그대로 둔다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **커밋 경계**: `fix: judge Claude registry records by the session being resumed`.

### 7. 실제 앱 확인 (`/runtime-test`)

- 준비:
  - 격리한 HOME, `CLAUDE_CONFIG_DIR`, userData, `DOAN_RUNTIME`으로 앱을 띄운다.
  - 이어갈 세션의 JSONL을 임시 `CLAUDE_CONFIG_DIR`에 둔다.
  - 셸 `doan check`는 격리한 `DOAN_RUNTIME`으로 실행해 연관을 기록한다.
  - 살아 있는 기록은 실제 `sleep` 프로세스를 띄워 만든다. 그 `pid`와 `TZ=UTC ps -o lstart= -p <pid>`의 값을 `procStart`로 써서 PoC가 확인한 형태로 `sessions/<pid>.json`을 쓴다.
- 통과 기준:
  - 대상이 아닌 살아 있는 기록이 있을 때, 새 대화 상태에 이어가기 선택지가 나오고 재개가 성공한다.
  - 대상 세션을 쥔 살아 있는 기록이 있을 때, "Couldn’t continue the terminal session: it’s open elsewhere."가 나온다.
- 별도 항목: 실제 데스크톱 앱 Code 세션을 연 상태에서 한 번 더 본다. 사람의 실제 프로필을 쓰므로 먼저 묻고, 하지 못하면 확인하지 못한 것으로 보고한다.
- 조직 문구는 단위 테스트로 고정한다. 실제 앱 확인에는 Claude 조직이 둘인 계정이 필요하며, 하지 못하면 확인하지 못한 것으로 보고한다.
- 검증: `/runtime-test` 보고서와 스크린샷.

## 마무리

### 8. 승격과 정리

- ARCHITECTURE §7을 고쳐 쓴다. 문서는 영어로 쓰고 근거는 커밋 메시지에 둔다.
  - 'Transport and environment'와 'External occupancy'의 레지스트리 규칙을 새 현재 규칙으로 바꾼다. 끝난 프로세스의 기록 건너뛰기, `ENOENT` 건너뛰기, PID 영역, 합치기 순서를 적고, fail closed의 안전 이유는 남긴다.
  - 'Errors'와 'Sign-out and replacement'에 `workspace_changed`를 더한다.
- PRODUCT를 고쳐 쓴다. Claude 관련 문구는 "organization", Copilot은 "account"를 쓴다.
  - §3 'Live terminal policy'의 "one open in a terminal is `session_in_use`"를 다른 Claude 프로세스(데스크톱 앱 등)에서 열린 세션도 포함하도록 바꾼다.
  - §5 item 3의 "Another account or workspace of the provider" 문구를 계정이 다를 때(Copilot의 `host` 포함)와 Claude 조직만 다를 때로 나눈다.
- `docs/BACKLOG.md`를 고친다.
  - 'Known defects'의 두 항목을 지운다.
  - 새 줄을 더한다: "The `account_mismatch` notice does not say when only the organization differs; it arises only when the login changed outside Doan."
  - 새 줄을 더한다: a profile whose registry still judges `unknown` hides the terminal session continue without a reason, and the association is still asked for once per visit.
- `docs/features/claude-resume-registry/`를 지운다.
- 검증: 문서만 바뀌므로 대상만 확인한다.
  - `grep -n "workspace_mismatch\|CLAUDE_REGISTRY_FLOOR 2.1.284, malformed" docs/BACKLOG.md`가 아무것도 출력하지 않는다.
  - `grep -n -i "ended process" docs/ARCHITECTURE.md`가 끝난 프로세스의 기록을 건너뛴다는 영어 문장을 출력한다.
  - `grep -n "workspace_changed" docs/ARCHITECTURE.md`와 `grep -n "elsewhere\|organization" docs/PRODUCT.md`가 바뀐 문장을 출력한다.
- **커밋 경계**: 문서마다 따로 (`docs(architecture): …`, `docs(product): …`, `docs(backlog): …`, `docs(feature): remove claude-resume-registry`).
