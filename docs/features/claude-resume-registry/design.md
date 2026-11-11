# claude-resume-registry — design

## 영향 받는 부분

- **앱(main), 레지스트리**: `app/src/main/conversation/io.ts` `claudeOccupancy`. 레거시 외부 경로(터미널 세션 이어가기, `prepare.ts` 55행 부근)와 Doan 연결 경로(`prepare.ts` 252행 부근) 둘 다 이 함수를 쓰므로 판정 변경은 두 경로에 함께 적용된다. Doan 전용 프로필에는 Doan의 SDK 실행만 기록을 쓰므로 실제로 달라지는 것은 사용자 프로필(보통 `~/.claude`)이다.
- **앱(main), 대화 거절**: `prepare.ts` `judgmentCode`와 `ipc.ts`의 오류 코드 목록 `known`에 `workspace_changed`가 더해진다.
- **앱(main), 로그인 상태**: `agentAuth/state.ts`(조직만 다른 불일치를 구별해 남김), `agentAuth/types.ts`(상태 DTO), `onboarding/service.ts` `agentStatus`(소켓으로 내보낼 때 구별을 지움).
- **앱(renderer)**: `dockedRules.ts` `OTHER_SIGN_IN`(캔버스 패널 `canvasConversation.ts`와 Overview가 같은 `dockedRefusal`을 쓴다), `agentAuthView.ts`의 `account_mismatch` 알림(Settings > Agents와 첫 실행 Agent 단계).
- **CLI(Go)**, **스킬**, **가이드**: 바뀌지 않는다.

## 1. 레지스트리 판정

### 현재 판정 (`claudeOccupancy`)

디렉터리의 파일마다 아래 순서로 본다. 어느 한 단계에서 걸리면 프로필 전체가 `unknown`이다.

1. 이름이 `<pid>.<sha256>.key`이면 건너뛴다. `<pid>.json`이 아닌 다른 이름은 `unknown`.
2. JSON 파싱, `pid`(파일 이름과 일치), `sessionId`, `procStart`(날짜), `cwd`(절대 경로), `version`(floor 이상), `kind`(문자열)를 모두 검사한다. 하나라도 어긋나면 `unknown`. **이 검사는 프로세스 생존 확인보다 먼저 일어난다.** 그래서 이미 끝난 프로세스의 낡은 기록도 형식이 어긋나면 재개를 막는다.
3. `ps`로 `pid`의 시작 시각을 읽어 `procStart`와 같으면 살아 있는 기록이다. 살아 있는데 `kind !== "interactive"`면 `unknown`. 살아 있고 `sessionId`가 대상과 같으면 `occupied`.
4. 그 밖은 `free`.

### PoC가 먼저 필요한 가정

데스크톱 앱 Code 세션 기록이 위 어느 단계에서 걸리는지 모른다. BACKLOG가 말하듯 2.1.309는 floor보다 높으므로 버전 비교만으로는 설명되지 않는다. 아래 규칙이 그 기록을 푸는지는 PoC 결과에 달려 있으므로 PoC를 첫 작업으로 둔다.

#### 후보 (확인되지 않음)

이 기기의 데스크톱 앱 번들 claude-code 2.1.321 실행 파일에서 문자열만 검색해 얻은 단서다. 2.1.309에서도 같은지, 데스크톱 앱이 실제로 어떤 값을 쓰는지는 확인하지 않았다.

- Claude Code 자체의 레지스트리 스키마는 `kind`를 `interactive`, `bg`, `daemon`, `daemon-worker` 중 하나로 두고, `version`과 `cwd`를 선택 필드로 둔다.
- `entrypoint` 값에 `claude-desktop`, `claude-desktop-3p`, `local-agent`가 있고, Claude Code는 `kind`가 `interactive`가 아닌 기록을 "background"로 분류한다.
- Claude Code 자체도 재개 충돌을 판정할 때 `interactive`가 아닌 살아 있는 기록을 `sessionId`로 비교한다("This conversation is already open in another running Claude session").

여기서 나오는 가설은 다음과 같다.

- **H1**: 데스크톱 세션의 기록이 살아 있는 비대화형 `kind`(`bg`, `daemon`, `daemon-worker`)다 → 3단계에서 `unknown`.
- **H2**: `version` 또는 `cwd`가 없다 → 2단계에서 `unknown`.
- **H3**: `procStart`가 없거나 날짜로 읽히지 않는다(번들의 `pidDomain` 필드, `claude-code-vm` 디렉터리로 미루어 다른 PID 영역에서 돈 프로세스의 기록일 수 있다) → 2단계에서 `unknown`.
- **H4**: `sessions/`에 `<pid>.json`이나 `.key`가 아닌 파일이 생긴다 → 1단계에서 `unknown`.

#### PoC 방법

- 사람이 Claude 데스크톱 앱에서 Code 세션을 하나 열어 둔다(자동화할 수 없다. 사람의 조작이 필요하다).
- `.scratch/claude-resume-registry/probe.mjs`가 `<CLAUDE_CONFIG_DIR 또는 ~/.claude>/sessions/`를 **읽기만** 하고, 파일마다 `claudeOccupancy`와 같은 순서로 검사해 처음 걸린 단계와 이유를 출력한다. 출력에는 파일 이름 형식(`<pid>.json` 등), 키 이름과 값의 타입, `kind`, `version`, `entrypoint`, 생존 여부만 남긴다. 경로, 세션 ID, 이름, 프롬프트 같은 값은 출력하지 않는다.
- 데스크톱 앱 Code 세션을 닫은 뒤 한 번 더 실행해 남는 기록(낡은 기록)이 있는지 본다.
- 데스크톱 앱의 번들 claude-code 버전과 실행 날짜를 결과와 함께 이 문서에 적는다.

### 새 판정 규칙

원칙: **재개 대상 세션을 쥐고 있을 수 있는 기록만 재개를 막는다.** spec.md '왜 fail closed인가'의 안전 이유는 그대로 지킨다.

기록마다 순서를 다음처럼 바꾼다.

1. 파일 이름: `.key`는 지금처럼 건너뛰고, 그 밖의 모르는 이름은 `unknown`이다. PoC가 H4를 보이면 PoC에서 확인된 이름 형식 하나만 건너뛰기 목록에 더한다. 새 기록 형식을 놓치면 두 번째 작성자를 붙일 수 있으므로 모르는 이름을 모두 건너뛰지는 않는다.
2. **생존 먼저**: 파일 이름의 `pid`와 기록의 `pid`, `procStart`만 먼저 읽는다. 이 셋을 읽을 수 없으면 `unknown`(살아 있는지조차 모르므로). 읽었는데 `ps`의 시작 시각과 맞지 않으면 끝난 프로세스의 낡은 기록이므로 나머지 필드와 관계없이 건너뛴다.
3. 살아 있는 기록은 지금처럼 전체를 검사한다. floor 아래 버전이거나 형식이 어긋나면 그 기록의 `sessionId`를 믿을 수 없으므로 `unknown`.
4. 살아 있고 온전한 기록에서 `sessionId`가 대상과 같으면 `kind`와 관계없이 `occupied`.
5. 살아 있고 온전한 기록에서 `sessionId`가 대상과 다르면 `kind`와 관계없이 건너뛴다. 지금은 비대화형 `kind`면 `unknown`이다.

이 규칙은 H1(비대화형 `kind`)과 낡은 기록 문제를 푼다. **PoC 결과가 H2나 H3이면**(살아 있는 기록인데 필드가 없음) 이 규칙으로는 데스크톱 앱 기록이 계속 막힌다. 그때는 "살아 있지만 `version`이나 `procStart`가 없는 기록을 어떻게 판정할지"를 사람이 다시 정하고, 이 문서를 고친 뒤 구현한다.

`procStart`를 비교하는 이유(PID 재사용 방지)와 레지스트리 디렉터리가 없거나 읽을 수 없으면 `unknown`인 규칙은 그대로다.

## 2. 대화 거절: `workspace_changed`

- `judgmentCode`가 공급자를 함께 받는다. 공급자가 Claude Code이고 원인이 `workspace_mismatch`이면 `workspace_changed`를 돌려준다. `judgeConnection`은 계정 ID가 같을 때만 `workspace_mismatch`에 이르므로(계정이 다르면 그 전에 `account_mismatch`), 이 코드는 "같은 계정, 다른 조직"을 뜻한다.
- Copilot의 `workspace_mismatch`(`host` 차이)와 모든 `account_mismatch`는 지금처럼 `account_changed`다.
- `ipc.ts` `known`에 `workspace_changed`를 더한다. 목록에 없는 코드는 `unknown`으로 바뀌므로 빠뜨리면 renderer가 일반 오류로 보여 준다.
- renderer `OTHER_SIGN_IN`에 `workspace_changed`를 더한다. `account_changed`와 같이 Retry 대신 "Start a new conversation" 하나를 준다. 문구 예: "This conversation’s session belongs to another organization of your Claude Code account, so it can’t continue here. To continue it, sign out, then sign in again and choose that organization in Settings > Agents." 정확한 문장은 구현 때 PRODUCT §5 item 3의 문구 규칙에 맞춰 정한다.
- 레거시 외부 경로(터미널 세션)는 계정 판정을 하지 않으므로 이 코드를 내지 않는다.

## 3. 로그인 직후 알림: 조직만 다를 때

- 지금 `state.ts`는 세 곳(로그인 결과 61행, 실행 중 계정 기록 90행, `checkVerdict` 106행)에서 `stored.id !== id || stored.workspace !== workspace`를 한 조건으로 보고 `account_mismatch`를 남긴다.
- 조직만 다른 경우를 "두 계정 ID가 모두 `null`이 아니고 같으며, `workspace`만 다름"으로 정한다. 계정 ID가 없으면 같은 계정인지 증명할 수 없으므로(`connection.ts`의 "email is never evidence" 원칙) 지금처럼 다른 계정으로 본다. 공급자는 Claude Code로 한정한다(Copilot의 `host` 차이는 다른 로그인으로 본다).
- **구현**: 오류 코드는 `account_mismatch` 그대로 두고, 상태의 오류에 선택 필드 하나(가칭 `organizationOnly: true`)를 더한다. 그러면 준비 상태(`readiness`), 복구 버튼, 대화 거절(`not_logged_in`), MCP 연결 처리 등 `account_mismatch`를 보는 열다섯 곳 남짓이 그대로 동작한다. renderer `agentAuthView.ts`만 이 필드를 보고 문구를 바꾼다. 문구 예: "You signed in to another organization of your Claude Code account. Sign in again and choose the same organization, or sign out first."
- `onboarding/service.ts` `agentStatus`는 지금 `dto.error`를 통째로 복사해 app-socket v2로 내보낸다. 새 필드가 소켓으로 나가지 않도록 `{ code, retryable }`만 복사하게 바꾼다. 소켓의 `account_mismatch`와 `doan onboarding`의 문구("A different account is signed in. Sign in again.")는 그대로다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

- `registryIdentity(name, raw)`와 `liveRecordVerdict(raw, target)` (가칭, `sessions.ts`): 파일 이름과 파싱한 값에서 생존 확인에 쓸 식별자(`pid`, `procStart`)를 꺼내고, 살아 있는 기록을 `"skip" | "occupied" | "unknown"`으로 판정한다. `claudeOccupancy`는 디렉터리 읽기, `ps` 호출, 결과 합치기만 맡는다.
- `judgmentCode(judgment, provider)` (`prepare.ts`, 이미 순수): Claude `workspace_mismatch` → `workspace_changed`, Copilot `workspace_mismatch`와 `account_mismatch` → `account_changed`.
- `accountMismatch(stored, current, provider)` (가칭, `state.ts`): `"ok" | "account" | "organization"`. 세 곳의 비교를 이 함수 하나로 모은다.
- `agentStatus(dto)` (`onboarding/service.ts`, 이미 순수): 새 필드를 내보내지 않음을 고정한다.
- `dockedRefusal`(`dockedRules.ts`)과 `providerView`(`agentAuthView.ts`): 조직만 다를 때의 문구를 고정한다.

## 형식 변경

- **대화 오류 코드**: `workspace_changed`가 더해진다. 대화 오류 코드는 Electron IPC 안에서만 오가며 원본은 `ipc.ts` `known`이다(ARCHITECTURE §7 'Errors'). JSON Schema(ARCHITECTURE §11 'Shared formats')에도, Go CLI에도 이 목록이 없으므로 스키마 파일, 형식 버전 `v`, TS와 Go가 함께 읽는 fixture는 바뀌지 않는다. 기기에 남는 곳은 하나 확인했다. 대기열 메시지가 거절되면 돌려준 초안(`drafts.ts` `ReturnedDraft.reason`)에 그 코드가 저장되는데, 읽는 쪽은 `^[a-z_]{1,64}$`만 검사하므로 더 오래된 Doan도 새 코드를 읽는다. 이벤트 JSONL의 `turn.failed`가 이 코드를 담을 수 있는지(admission 거절은 `user.message`보다 먼저 일어난다, ARCHITECTURE §7 'App-local ownership')는 구현 단계에서 확인한다.
- **로그인 상태 DTO**: 상태 오류의 선택 필드(가칭 `organizationOnly`)는 main과 renderer 사이의 내부 DTO에만 있다. app-socket v2(`schema/app-socket.v2.schema.json`의 `account_mismatch` 열거값), Go `cli/internal/cli/envelope.go`, `schema/fixtures/cli-envelope/onboarding/mapping.json`은 바뀌지 않고, v2의 `v`도 그대로다.
- 레지스트리는 Claude Code의 파일이며 Doan의 형식이 아니다.

## 규약 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE §7 'Transport and environment'의 "one Claude registry record below its floor or malformed makes that profile's resume `unknown` (fail closed)"와 'External occupancy'의 "a missing, unreadable or malformed registry is unavailable"가 바뀐다. 사람이 승인했으므로 마지막 작업에서 "끝난 프로세스의 기록은 건너뛰고, 살아 있는 기록은 `sessionId`로 판정하며, 살아 있는데 믿을 수 없는 기록만 프로필을 `unknown`으로 만든다"는 현재 규칙으로 고쳐 쓴다. fail closed의 안전 이유는 남긴다.
- ARCHITECTURE §7 'Errors'와 'Sign-out and replacement'에 `workspace_changed`를 더한다.
- PRODUCT §3 'Live terminal policy'("one it cannot verify is `session_unavailable`")는 문장 자체는 그대로 맞다. "확인할 수 없는" 범위가 대상 세션으로 좁아질 뿐이다.
- PRODUCT §5 item 3의 "Another account or workspace of the provider: …"를 계정이 다를 때와 Claude 조직만 다를 때로 나눠 고쳐 쓴다. PRODUCT §5 item 0(첫 실행 Agent 단계)과 Settings > Agents 규칙에 조직만 다른 재로그인 알림을 더한다.
- 세션을 포크하거나 빼앗지 않는다는 결정, 한 세션에 한 턴, 프로필 불일치 시 다른 프로필로 넘어가지 않는다는 결정, 이메일을 신원 증거로 쓰지 않는다는 결정은 그대로다.

## POSTMORTEM에서 가져온 함정

- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone**: "a per-turn process keeps the conversation's reservation until `process_exited` (group gone), by design, so that two processes never share a session". 레지스트리 판정을 좁혀도 이 목표를 깨면 안 된다. 그래서 대상 세션을 쥐었을 수 있는 살아 있는 기록은 계속 막는다.
- **2026-11-02 — Evaluation unit checks inherited the real session-recording runtime**: "A temporary repository alone does not isolate device-local session state." PoC는 실제 `~/.claude/sessions/`를 읽기만 하고 쓰지 않는다. `/runtime-test`는 실제 프로필이 아니라 임시 `CLAUDE_CONFIG_DIR`에 PoC가 확인한 형태의 기록을 만들어 확인한다.
- **2026-11-06 — The Codex model list stayed the previous account's after an account replacement**: 계정에 묶인 창 쪽 값은 인증 `generation`으로 키를 잡아야 한다. 로그인 알림 문구는 상태 DTO에서 바로 그리므로 새 캐시를 만들지 않는다. 구현이 창 쪽에 조직 정보를 따로 보관하게 되면 이 규칙을 따른다.

## 디자인 프리셋

UI 흐름이나 화면 구성이 바뀌지 않고 기존 알림의 문장만 바뀌므로 디자인 프리셋은 읽지 않았다.
