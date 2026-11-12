# claude-resume-registry — design

## 영향 받는 부분

- **앱(main), 레지스트리**: `app/src/main/conversation/io.ts` `claudeOccupancy`. 레거시 외부 경로(터미널 세션 이어가기, `prepare.ts` 55행 부근)와 Doan 연결 경로(`prepare.ts` 252행 부근) 둘 다 이 함수를 쓰므로 판정 변경은 두 경로에 함께 적용된다. Doan 전용 프로필에는 Doan의 SDK 실행만 기록을 쓰므로 실제로 달라지는 것은 사용자 프로필(보통 `~/.claude`)이다.
- **앱(main), 대화 거절**: `prepare.ts` `judgmentCode`와 `ipc.ts`의 오류 코드 목록 `known`에 `workspace_changed`가 더해진다.
- **앱(renderer)**: `dockedRules.ts`.
  - `OTHER_SIGN_IN`에 `workspace_changed` 문구를 더한다. 캔버스 패널(`canvasConversation.ts`)과 Overview가 같은 `dockedRefusal`을 쓴다.
  - `RESUME_REASONS.session_in_use`와 `SEND_ERRORS.session_in_use`의 "another terminal"을 "elsewhere"로 바꾼다. 같은 세션을 쥔 쪽이 터미널이 아니라 데스크톱 앱일 수 있기 때문이다.
- **CLI(Go)**, **스킬**, **가이드**, 로그인 상태(`agentAuth/`), app-socket v2: 바뀌지 않는다.

## 작업 트랙

- **조직 트랙**(§2, 거절 문구): 레지스트리 PoC를 기다리지 않는다. 독립적으로 테스트, 구현, 커밋한다.
- **레지스트리 트랙**(§1): PoC 결과에 달려 있다. PoC가 끝나고 규칙이 맞는지 확인한 뒤에 테스트와 구현을 시작한다.
- "elsewhere" 문구 변경은 레지스트리 판정과 무관하게 맞는 문장이므로 조직 트랙과 함께 둔다.

## 1. 레지스트리 판정

### 현재 판정 (`claudeOccupancy`)

디렉터리의 파일마다 아래 순서로 본다. 어느 한 단계에서 걸리면 그 자리에서 프로필 전체가 `unknown`이다.

1. 이름이 `<pid>.<sha256>.key`이면 건너뛴다. `<pid>.json`이 아닌 다른 이름은 `unknown`.
2. JSON 파싱, `pid`(파일 이름과 일치), `sessionId`, `procStart`(날짜), `cwd`(절대 경로), `version`(floor 이상), `kind`(문자열)를 모두 검사한다. 하나라도 어긋나면 `unknown`. **이 검사는 프로세스 생존 확인보다 먼저 일어난다.** 그래서 이미 끝난 프로세스의 낡은 기록도 형식이 어긋나면 재개를 막는다.
3. `ps`로 `pid`의 시작 시각을 읽어 `procStart`와 같으면 살아 있는 기록이다. 살아 있는데 `kind !== "interactive"`면 `unknown`. 살아 있고 `sessionId`가 대상과 같으면 `occupied`.
4. 그 밖은 `free`. 읽기, 파싱, `ps` 오류는 모두 `unknown`이다(`catch`).

### PoC가 먼저 필요한 가정

데스크톱 앱 Code 세션 기록이 위 어느 단계에서 걸리는지 모른다. BACKLOG가 말하듯 2.1.309는 floor보다 높으므로 버전 비교만으로는 설명되지 않는다. 아래 규칙이 그 기록을 푸는지는 PoC 결과에 달려 있으므로 레지스트리 트랙은 PoC로 시작한다.

#### 후보 (확인되지 않음)

이 기기의 데스크톱 앱 번들 claude-code 2.1.321 실행 파일에서 문자열만 검색해 얻은 단서다. 2.1.309에서도 같은지, 데스크톱 앱이 실제로 어떤 값을 쓰는지는 확인하지 않았다.

- Claude Code 자체의 레지스트리 스키마는 `kind`를 `interactive`, `bg`, `daemon`, `daemon-worker` 중 하나로 두고, `version`과 `cwd`를 선택 필드로 둔다. `pidDomain`이라는 선택 필드도 있다.
- `entrypoint` 값에 `claude-desktop`, `claude-desktop-3p`, `local-agent`가 있고, Claude Code는 `kind`가 `interactive`가 아닌 기록을 "background"로 분류한다.
- Claude Code 자체도 재개 충돌을 판정할 때 `interactive`가 아닌 살아 있는 기록을 `sessionId`로 비교한다("This conversation is already open in another running Claude session").
- 이 기기의 터미널 CLI 2.1.322 기록에도 `pidDomain` 필드가 있다. 그래서 필드가 있다는 것만으로는 호스트가 아닌 PID 영역이라고 할 수 없다.

여기서 나오는 가설은 다음과 같다.

- **H1**: 데스크톱 세션의 기록이 살아 있는 비대화형 `kind`(`bg`, `daemon`, `daemon-worker`)다 → 3단계에서 `unknown`.
- **H2**: `version` 또는 `cwd`가 없다 → 2단계에서 `unknown`.
- **H3**: 기록이 호스트가 아닌 PID 영역(번들의 `pidDomain` 필드, `claude-code-vm` 디렉터리로 미루어 VM 안의 프로세스)에서 왔다. 호스트 `ps`가 그 `pid`를 찾지 못하거나 다른 프로세스를 찾는다. `procStart`가 없으면 2단계, 있으면 생존 판정이 틀린다.
- **H4**: `sessions/`에 `<pid>.json`이나 `.key`가 아닌 파일이 생긴다 → 1단계에서 `unknown`.
- **H5**: `readdir`과 파일 읽기 사이에 기록이 사라진다(`ENOENT`) → `catch`에서 `unknown`. 데스크톱 세션이 기록을 자주 지우고 다시 쓰면 간헐적으로 막힌다.

#### PoC 방법

- 사람이 Claude 데스크톱 앱에서 Code 세션을 하나 열어 둔다(자동화할 수 없다. 사람의 조작이 필요하다).
- `.scratch/claude-resume-registry/probe.mjs`는 `~/.claude/sessions/`와, `CLAUDE_CONFIG_DIR`이 설정되어 있으면 `$CLAUDE_CONFIG_DIR/sessions/`도 **읽기만** 한다. 출력마다 어느 디렉터리인지(기본 프로필 / 설정된 프로필) 밝힌다.
- 파일마다 `claudeOccupancy`와 같은 순서로 검사해 처음 걸린 단계와 이유를 출력한다. 함께 출력하는 것은 다음뿐이다. 경로, 세션 ID, 이름, 프롬프트 같은 값은 출력하지 않는다.
  - 파일 이름 형식(`<pid>.json` 등), 키 이름과 값의 타입, `kind`, `version`, `entrypoint`.
  - PID 영역 필드가 있는지, 그 값이 같은 기기의 터미널 CLI 기록 값과 같은지(참/거짓).
  - 호스트 `ps`가 그 `pid`를 찾는지, 시작 시각이 `procStart`와 같은지.
  - 그 `pid`의 실행 파일이 데스크톱 앱 번들 안에 있는지(참/거짓).
  - 데스크톱 세션의 세션 ID를 환경 변수로 받아(사람이 넣는다), 기록의 `sessionId`와 같은지(참/거짓).
- 기록이 사라지는 경우(H5)를 보려고 여러 번(예: 1초 간격으로 수십 번) 실행한다.
- 데스크톱 앱 Code 세션을 닫은 뒤 한 번 더 실행해 남는 기록(낡은 기록)이 있는지 본다.
- 데스크톱 앱의 번들 claude-code 버전과 실행 날짜를 결과와 함께 이 문서에 적는다.
- **멈추고 묻는 경우**:
  - 데스크톱 세션의 기록이 없다.
  - 기록이 모든 단계를 통과한다(H1–H5 어디에도 해당하지 않는다).
  - H2다.
  - 열려 있는 데스크톱 세션이 살아 있는 것으로 판정되지 않는다(H3에서 호스트 `ps`가 못 찾는 경우 포함).
  - 호스트 PID 영역을 기록에서 가려낼 방법을 찾지 못한다.

#### PoC 결과 (2026-11-12)

- 환경: Claude 데스크톱 앱 5.1231.2, 번들 claude-code 2.1.321. 같은 기기의 터미널 CLI는 2.1.322다. 사람이 데스크톱 앱에서 Code 세션 하나를 열었고, 지휘자가 probe를 읽기 전용으로 실행했다.
- 디렉터리: 데스크톱 세션의 기록은 기본 프로필 `~/.claude/sessions/`에 생긴다. 세션을 열기 전에는 비어 있었다. 이 기기의 터미널 CLI는 설정된 프로필(`CLAUDE_CONFIG_DIR`)을 쓰므로 두 기록은 다른 디렉터리에 있다.
- 파일: `<pid>.json` 하나와 `<pid>.<sha256>.key` 하나다. 다른 이름의 파일은 없었다(H4 아님).
- 기록 필드: `pid`, `sessionId`, `cwd`, `startedAt`, `procStart`, `version`, `peerProtocol`, `peerFeatures`, `kind`, `entrypoint`, `hostSessionId`, `pidDomain`, `asksForConvertedSkills`(`null`), `messagingSocketPath`, `name`, `nameSource`, `nameSince`, `status`, `updatedAt`, `statusUpdatedAt`. 터미널 CLI 기록과 비교하면 `hostSessionId`가 더 있다. `version`과 `cwd`가 있다(H2 아님).
- 값: `kind`는 `interactive`, `version`은 `2.1.321`, `entrypoint`는 `claude-desktop`이다. 실행 파일은 데스크톱 앱 번들 안에 있다. 호스트 `ps`가 그 `pid`를 찾고 시작 시각이 `procStart`와 같다(살아 있음, H1·H3 아님).
- 세션 ID: 사람이 알려 준 데스크톱 세션 ID(`local_` 접두사가 붙은 형태)는 `sessionId`와 같지 않고 `hostSessionId`와 같다. `sessionId`는 데스크톱 앱이 띄운 claude-code 프로세스의 세션 UUID다.
- 반복: idle 상태에서 1초 간격으로 130번 이상, 사람이 보낸 프롬프트가 도는 동안(백그라운드 Bash 작업과 서브에이전트 포함, `status` `busy` 표본 98번) 다시 실행했다. 기록은 매번 하나였고 모든 단계를 통과했다. 사라지는 기록(H5)이나 비대화형 기록은 없었다.
- 세션을 닫은 뒤: 기록이 지워져 디렉터리가 비었다. 낡은 기록은 남지 않았다.
- PID 영역: 데스크톱 기록과 터미널 CLI 기록 모두 `pidDomain`이 `"darwin"`이다. Claude Code 2.1.322 실행 파일을 보면 macOS에서는 이 고정 문자열을 쓰고, Linux와 WSL에서는 machine-id와 PID 네임스페이스를 붙인 값을 쓴다.
- 결론: 기록이 모든 단계를 통과하므로 '멈추고 묻는 경우'였다. BACKLOG의 결함은 2.1.321에서 재현되지 않는다(2.1.309에서는 달랐을 수 있다). 사람은 새 판정 규칙을 그대로 구현하기로 했다. 이 규칙은 데스크톱과 관계없이 프로필 전체를 막는 경우(Claude Code 자체의 `bg`·`daemon` 기록, 크래시로 남은 형식이 어긋난 낡은 기록, `ENOENT` 경합)를 푼다.
- 호스트 PID 영역 판별(지휘자 판단, 위 관찰 근거): `pidDomain`이 없거나 `"darwin"`이면 호스트 영역이다. 다른 문자열이면 호스트가 아닌 영역이다. 문자열이 아니면 식별자를 읽을 수 없는 것으로 보고 `unknown`이다.

### 새 판정 규칙

원칙: **재개 대상 세션을 쥐고 있을 수 있는 기록만 재개를 막는다.** spec.md '왜 fail closed인가'의 안전 이유는 그대로 지킨다.

기록마다 다음 순서로 판정하고, 결과를 합친다.

1. **파일 이름**: `.key`는 지금처럼 건너뛰고, 그 밖의 모르는 이름은 `unknown`이다. PoC가 H4를 보이면 PoC에서 확인된 이름 형식 하나만 건너뛰기 목록에 더한다. 새 기록 형식을 놓치면 두 번째 작성자를 붙일 수 있으므로 모르는 이름을 모두 건너뛰지는 않는다.
2. **읽기**: `readdir` 뒤에 파일이 사라졌으면(`ENOENT`) 건너뛴다. Claude Code는 프로세스가 끝날 때 기록을 지우므로, 사라진 기록은 끝난 프로세스의 것이다. 확인 도중에 새로 생긴 기록은 보지 못하며, 지금과 같이 받아들인다. 그 밖의 읽기 오류(`EACCES` 등)와 깨진 JSON은 `unknown`이다.
3. **생존 먼저**: 파일 이름의 `pid`, 기록의 `pid`, `procStart`를 먼저 읽는다. 셋 중 하나라도 읽을 수 없거나, 파일 이름의 `pid`와 기록의 `pid`가 다르면 `unknown`이다. 살아 있는지조차 모르기 때문이다.
4. **PID 영역**: 기록이 호스트가 아닌 PID 영역에서 왔으면 생존을 알 수 없다. 온전하고(5단계 검사 통과) `sessionId`가 대상과 다르면 건너뛰고, 그 밖에는 `unknown`이다. 호스트 영역을 가려내는 방법은 PoC가 정한다.
5. **호스트 영역**: `ps`로 시작 시각을 읽는다.
   - `ps` 오류는 `unknown`이다.
   - 프로세스가 없거나 시작 시각이 `procStart`와 다르면(PID 재사용) 끝난 프로세스의 낡은 기록이다. 나머지 필드와 관계없이 건너뛴다.
   - 살아 있는 기록은 지금처럼 전체를 검사한다. floor 아래 버전이거나 형식이 어긋나면 그 기록의 `sessionId`를 믿을 수 없으므로 `unknown`이다.
   - 살아 있고 온전한 기록에서 `sessionId`가 대상과 같으면 `kind`와 관계없이 `occupied`다.
   - 살아 있고 온전한 기록에서 `sessionId`가 대상과 다르면 `kind`와 관계없이 건너뛴다. 지금은 비대화형 `kind`면 `unknown`이다.
6. **합치기**: `occupied` > `unknown` > `free` 순으로 이긴다. 지금처럼 첫 `unknown`에서 멈추지 않고 모든 기록을 본 뒤 합친다. 하나라도 대상 세션을 쥐었으면 "열려 있음"이 더 정확한 안내이기 때문이다. 둘 다 재개를 거절하므로 안전에는 차이가 없다. `sessions/`가 비어 있으면 `free`, 디렉터리가 없거나 읽을 수 없으면 지금처럼 `unknown`이다.

이 규칙은 H1, H3(온전한 기록인 경우), H4, H5, 낡은 기록 문제를 푼다. **PoC 결과가 H2이면**(살아 있는 기록에 `version`이나 `cwd`가 없음) 이 규칙으로는 데스크톱 앱 기록이 계속 막힌다. 그때는 "살아 있지만 필드가 빠진 기록을 어떻게 판정할지"를 사람이 다시 정하고, 이 문서를 고친 뒤 구현한다.

## 2. 대화 거절: `workspace_changed`

- `judgeConnection`(`connection.ts` 14–18행)은 계정 ID가 같을 때, 또는 계정 ID가 없어도 같은 연결(`connectionId`)일 때 `workspace_mismatch`에 이른다. 같은 연결의 조직은 상태 확인이 바뀌지 않게 지킨다(바뀌면 `account_mismatch` 오류 상태가 된다). 그래서 이 원인은 "같은 계정 또는 같은 연결, 다른 조직"을 뜻한다.
- `judgmentCode`가 공급자를 함께 받는다. 다음 셋이 모두 참일 때만 `workspace_changed`를 돌려준다.
  - 공급자가 Claude Code다.
  - 원인이 `workspace_mismatch`다.
  - 소유자와 현재 로그인의 조직 값이 둘 다 `null`이 아니다.
- 그 밖(조직 값 `null`, Copilot의 `host` 차이, 모든 `account_mismatch`)은 지금처럼 `account_changed`와 지금 문구다. `judgmentCode`가 조직 값을 보려면 `judgeConnection`의 결과에 두 값이 `null`이 아닌지가 실려야 한다. 원인을 하나 더 두는 방식(예: Claude 조직 차이를 따로 표시)과 결과에 값을 싣는 방식 중 무엇을 쓸지는 `/tdd`에서 정한다. 외부 동작은 같다.
- `ipc.ts` `known`에 `workspace_changed`를 더한다. 목록에 없는 코드는 `unknown`으로 바뀌므로 빠뜨리면 renderer가 일반 오류로 보여 준다.
- renderer `OTHER_SIGN_IN`에 `workspace_changed`를 더한다. `account_changed`와 같이 Retry 대신 "Start a new conversation" 하나를 준다.
- 문구는 Claude 로그인이 조직 선택 화면을 보여 주는지에 따라 정한다. 조직이 여러 개인 계정으로 확인한 결과(날짜, Claude Code 버전, 보인 화면)를 이 절에 적는다.
  - 선택 화면이 있으면: "This conversation’s session belongs to another organization of your Claude Code account, so it can’t continue here. To continue it, sign out in Settings > Agents, then sign in and choose the organization this conversation started in."
  - 확인할 수 없으면 방법을 단정하지 않는다: "This conversation’s session belongs to another organization of your Claude Code account, so it can’t continue here. To continue it, sign in to the organization this conversation started in."
- **확인 결과(2026-11-12)**: 확인하지 못했다. 조직이 여러 개인 Claude 계정으로 로그인 화면을 볼 수 없었다(터미널 CLI 2.1.322). 그래서 방법을 단정하지 않는 두 번째 문구를 쓴다.
- 용어: Claude 관련 문구와 PRODUCT에서는 어디서나 "organization"을 쓴다. Copilot은 "account"를 유지한다.
- 레거시 외부 경로(터미널 세션)는 계정 판정을 하지 않으므로 이 코드를 내지 않는다.
- 로그인 상태가 `account_mismatch` 오류를 가진 채 보내면 이 코드가 나오지 않는다. lease를 얻는 단계(`accountCode`)와 다시 확인하는 단계(`recheck`)가 먼저 `not_logged_in`으로 거절하는 것으로 읽힌다. 테스트로 오늘 동작을 확인해 고정한다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

- `registryIdentity(name, raw)`와 `registryRecordVerdict(raw, target, liveness)` (가칭, `sessions.ts`).
  - `registryIdentity`는 파일 이름과 파싱한 값에서 생존 확인에 쓸 식별자(`pid`, `procStart`, PID 영역)를 꺼낸다.
  - `registryRecordVerdict`는 생존 결과(`live` / `dead` / `foreign`)와 함께 기록을 `"skip" | "occupied" | "unknown"`으로 판정한다.
- `mergeOccupancy(verdicts)` (가칭): `occupied` > `unknown` > `free`.
- `claudeOccupancy`는 디렉터리 읽기, `ENOENT` 처리, `ps` 호출, 결과 합치기만 맡는다.
- `judgmentCode(judgment, provider)` (`prepare.ts`, 이미 순수): 위 §2의 조건.
- `dockedRefusal`, `resumeRefusalText`(`dockedRules.ts`): `workspace_changed` 문구와 "elsewhere" 문구를 고정한다.

## 형식 변경

- **대화 오류 코드**: `workspace_changed`가 더해진다. 대화 오류 코드는 Electron IPC 안에서만 오가며 원본은 `ipc.ts` `known`이다(ARCHITECTURE §7 'Errors'). JSON Schema(ARCHITECTURE §11 'Shared formats')에도, Go CLI에도 이 목록이 없으므로 스키마 파일, 형식 버전 `v`, TS와 Go가 함께 읽는 fixture는 바뀌지 않는다.
- **기기에 남는 곳**:
  - 이벤트 JSONL의 `turn.failed`는 이 코드를 담을 수 없다. `store.ts` 103행이 `turn.failed`의 `code`를 닫힌 목록으로 검사하고, 그 목록에 `account_changed`도 없다. 거절은 IPC 응답으로 돌아간다.
  - 대기열 메시지가 거절되면 `giveBack(…, reason(error))`가 그 코드를 돌려준 초안의 `reason`에 저장한다(`service.ts`). 읽는 쪽(`drafts.ts`)은 `^[a-z_]{1,64}$`만 검사하므로 더 오래된 Doan도 `workspace_changed`를 읽는다. `drafts.test.ts`에 이 왕복을 고정한다.
- 레지스트리는 Claude Code의 파일이며 Doan의 형식이 아니다.
- app-socket v2, 로그인 상태 DTO는 바뀌지 않는다.

## 규약 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- ARCHITECTURE §7 'Transport and environment'의 "one Claude registry record below its floor or malformed makes that profile's resume `unknown` (fail closed)"와 'External occupancy'의 "a missing, unreadable or malformed registry is unavailable"가 바뀐다. 사람이 승인했다.
  - 마지막 작업에서 현재 규칙으로 고쳐 쓴다. 끝난 프로세스의 기록은 건너뛰고, 살아 있는 기록은 `sessionId`로 판정한다. 살아 있는데 믿을 수 없는 기록만 프로필을 `unknown`으로 만든다.
  - fail closed의 안전 이유는 남긴다.
- ARCHITECTURE §7 'Errors'와 'Sign-out and replacement'에 `workspace_changed`를 더한다.
- PRODUCT §3 'Live terminal policy'의 "one open in a terminal is `session_in_use`"를 터미널뿐 아니라 다른 Claude 프로세스(데스크톱 앱 등)에서 열린 세션도 포함하도록 고쳐 쓴다. "one it cannot verify is `session_unavailable`"는 문장 자체는 그대로 맞다. "확인할 수 없는" 범위가 대상 세션으로 좁아질 뿐이다.
- PRODUCT §5 item 3의 "Another account or workspace of the provider: …"를 계정이 다를 때(Copilot의 `host` 포함)와 Claude 조직만 다를 때로 나눠 고쳐 쓴다.
- 세션을 포크하거나 빼앗지 않는다는 결정, 한 세션에 한 턴, 프로필 불일치 시 다른 프로필로 넘어가지 않는다는 결정, 이메일을 신원 증거로 쓰지 않는다는 결정은 그대로다.

## POSTMORTEM에서 가져온 함정

- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone**: "a per-turn process keeps the conversation's reservation until `process_exited` (group gone), by design, so that two processes never share a session". 레지스트리 판정을 좁혀도 이 목표를 깨면 안 된다. 그래서 대상 세션을 쥐었을 수 있는 살아 있는 기록은 계속 막는다.
- **2026-11-02 — Evaluation unit checks inherited the real session-recording runtime**: "A temporary repository alone does not isolate device-local session state." PoC는 실제 레지스트리를 읽기만 하고 쓰지 않는다. `/runtime-test`는 실제 프로필이 아니라 임시 `CLAUDE_CONFIG_DIR`에 PoC가 확인한 형태의 기록을 만들어 확인하고, 셸 `doan check`에는 격리한 `DOAN_RUNTIME`을 쓴다.

## 디자인 프리셋

UI 흐름이나 화면 구성이 바뀌지 않고 기존 알림의 문장만 바뀌므로 디자인 프리셋은 읽지 않았다.
