# claude-resume-registry — tasks

## 작업

### 1. PoC: 데스크톱 앱 기록이 걸리는 조건 찾기

- Claude 데스크톱 앱에서 Code 세션을 열어 둔 상태(사람이 연다)로 `.scratch/claude-resume-registry/probe.mjs`를 실행해, `sessions/`의 파일마다 `claudeOccupancy`의 어느 단계에서 걸리는지 출력한다. 세션을 닫은 뒤 한 번 더 실행한다. 읽기 전용이며 값(경로, 세션 ID, 이름, 프롬프트)은 출력하지 않는다(design.md 'PoC 방법').
- 결과(번들 claude-code 버전, 날짜, 걸린 단계와 필드, H1–H4 중 무엇인지)를 design.md 'PoC가 먼저 필요한 가정'에 적는다.
  - H1이거나 낡은 기록이면 새 판정 규칙으로 풀리므로 작업 2로 간다.
  - H2나 H3이면 새 판정 규칙으로 풀리지 않으므로 멈추고 사람에게 규칙을 다시 묻는다.
  - H4이면 확인된 이름 형식 하나만 건너뛰기 목록에 더한다(design.md '새 판정 규칙' 1).
- 검증: command undecided — needs user confirmation (`node .scratch/claude-resume-registry/probe.mjs`는 AGENTS.md 'Commands'에 없다). 출력에 데스크톱 기록마다 걸린 단계가 한 줄씩 나오면 통과.
- **커밋 경계**: `docs(feature): record claude-resume-registry PoC result` (design.md만).

### 2. 테스트: 레지스트리 판정 (`/tdd`)

- `sessions.test.ts`에 `registryIdentity`, `liveRecordVerdict`(가칭) 테스트를 더한다.
  - 끝난 프로세스의 기록은 형식이 어긋나거나 floor 아래여도 건너뛴다.
  - 살아 있는 비대화형 기록은 대상 세션이면 `occupied`, 아니면 건너뛴다.
  - 살아 있는데 floor 아래거나 형식이 어긋난 기록은 `unknown`이다.
  - `pid`나 `procStart`를 읽을 수 없으면 `unknown`이다.
- `io.test.ts`의 "fails the whole profile closed on any other version" 사례를 새 규칙에 맞게 고치고, PoC가 확인한 데스크톱 기록 형태(값은 가짜)를 사례로 더한다.
- 검증: `npm --prefix app test`에서 새 사례가 빨간색(구현 전).

### 3. 구현: `claudeOccupancy` 순서 변경 (`/implement`)

- 순수 함수를 `sessions.ts`에 두고, `io.ts` `claudeOccupancy`는 디렉터리 읽기, 생존 확인, 결과 합치기만 하도록 바꾼다. 레지스트리 디렉터리가 없거나 읽을 수 없으면 `unknown`인 규칙, `.key` 건너뛰기, `procStart` 비교는 그대로 둔다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **커밋 경계**: `fix: judge Claude registry records by the session being resumed`.

### 4. 테스트와 구현: `workspace_changed`

- 테스트 먼저(빨간색 확인):
  - `prepare.test.ts`: Claude의 `workspace_mismatch`는 `workspace_changed`, Copilot의 `workspace_mismatch`와 모든 `account_mismatch`는 `account_changed`.
  - `dockedRules.test.ts`, `canvasConversation.test.ts`: `workspace_changed`는 새 문구와 "Start a new conversation"(`startNew`)을 주고, `account_changed` 문구는 그대로다.
- 구현: `judgmentCode`가 공급자를 받고, `ipc.ts` `known`에 `workspace_changed`를 더하고, `OTHER_SIGN_IN`에 문구를 더한다. 이벤트 JSONL의 `turn.failed`가 이 코드를 담을 수 있는지 확인해 design.md '형식 변경'에 적는다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **커밋 경계**: `fix: refuse a Claude conversation of another organization with workspace_changed`.

### 5. 테스트와 구현: 조직만 다른 재로그인 알림

- 오류 코드는 `account_mismatch` 그대로 두고, 상태 오류에 앱 내부 선택 필드(가칭 `organizationOnly`)를 더한다. 소켓으로는 `{ code, retryable }`만 내보낸다.
- 테스트 먼저(빨간색 확인):
  - `state.test.ts`: 로그인 결과, 실행 중 계정 기록, `checkVerdict` 세 곳에서 Claude 계정 ID가 같고 조직만 다르면 조직만 다르다는 표시가 남는다. 계정 ID가 없거나 다르면, 또는 Copilot이면 지금과 같다.
  - `agentAuthView.test.ts`: 조직만 다를 때 알림 문구가 바뀌고 버튼(Sign in again, Sign out)은 그대로다.
  - 온보딩 서비스 테스트: `agentStatus`가 새 필드를 내보내지 않는다(v2 스키마 검증 통과).
- 구현: `state.ts`의 세 비교를 `accountMismatch`(가칭) 하나로 모으고, 상태 오류에 필드를 더하고, `agentAuthView.ts`와 `agentStatus`를 고친다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `go test ./...`(v2 스키마와 fixture가 그대로인지) 통과.
- **커밋 경계**: `fix: say when a Claude sign-in chose another organization`.

### 6. 실제 앱 확인 (`/runtime-test`)

- 레지스트리 판정은 격리해서 확인한다.
  - 격리한 HOME, `CLAUDE_CONFIG_DIR`, userData로 앱을 띄운다.
  - 임시 프로필의 `sessions/`에 PoC가 확인한 형태의 살아 있는 기록(대상이 아닌 세션)을 둔다.
  - 셸 `doan check`로 연관을 기록한 터미널 세션의 이어가기가 제안되고 재개되는지 본다.
  - 같은 세션을 쥔 살아 있는 기록을 두면 `session_in_use`로 거절되는지도 본다.
- 가능하면 실제 데스크톱 앱 Code 세션을 연 상태에서 한 번 더 본다. 사람의 실제 프로필을 쓰므로 먼저 묻는다.
- 조직 관련 문구는 단위 테스트로 고정한다. 실제 앱 확인에는 Claude 조직이 둘인 계정이 필요하다. 그런 계정이 없으면 확인하지 못한 것으로 보고한다.
- 검증: `/runtime-test` 보고서와 스크린샷.

### 7. 승격과 정리

- ARCHITECTURE §7을 고쳐 쓴다. 문서는 영어로 쓰고 근거는 커밋 메시지에 둔다.
  - 'Transport and environment'와 'External occupancy'의 레지스트리 규칙을 새 현재 규칙으로 바꾼다. fail closed의 안전 이유는 남긴다.
  - 'Errors'와 'Sign-out and replacement'에 `workspace_changed`를 더한다.
  - 조직만 다른 재로그인 표시를 'Agent authentication'에 적는다. 그 표시가 app-socket v2로 나가지 않는다는 점도 함께 적는다.
- PRODUCT를 고쳐 쓴다.
  - §5 item 3의 "Another account or workspace of the provider" 문구를 계정이 다를 때와 Claude 조직만 다를 때로 나눈다.
  - §5 item 0(첫 실행 Agent 단계)과 Settings > Agents 규칙에 조직만 다른 재로그인 알림을 더한다.
- `docs/BACKLOG.md` 'Known defects'의 두 항목을 지운다.
- `docs/features/claude-resume-registry/`를 지운다.
- 검증: 문서만 바뀌므로 대상만 확인한다. `grep -n "registry\|workspace_changed" docs/ARCHITECTURE.md`, `grep -n "organization" docs/PRODUCT.md`, `grep -n "workspace_mismatch\|CLAUDE_REGISTRY_FLOOR" docs/BACKLOG.md`로 바뀐 문장과 지운 항목을 확인한다.
- **커밋 경계**: 문서마다 따로 (`docs(architecture): …`, `docs(product): …`, `docs(backlog): …`, `docs(feature): remove claude-resume-registry`).
