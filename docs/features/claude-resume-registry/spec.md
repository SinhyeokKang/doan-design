# claude-resume-registry — spec

`docs/BACKLOG.md` 'Known defects'의 두 항목을 고친다. 원문은 다음과 같다.

> One Claude session registry record Doan cannot accept (below `CLAUDE_REGISTRY_FLOOR` 2.1.284, malformed, or a live non-interactive one) makes the whole profile's resume `unknown`, so every terminal session continue in that profile is hidden while it lives. With a Claude desktop app Code session open (its bundled claude-code 2.1.309 writes records into `~/.claude/sessions/`), no Claude terminal session could be continued; 2.1.309 is above the current floor, so which condition those records fail is unverified. Narrowing the fail-closed rule (for example to the record of the session being resumed) needs a decision.

> The `account_changed` refusal for another workspace (`workspace_mismatch`) says to sign out, then sign in to that account, but the conversation continues only once the same organization or workspace is chosen too (`dockedRules.ts` `OTHER_SIGN_IN`).

## 사용자

- **사람**: 앱에서 터미널 세션 이어가기를 고르는 사람(1)과, 다른 조직으로 로그인한 뒤 대화 거절 안내를 읽는 사람(2)이다.
- **에이전트**: 바뀌는 것이 없다. CLI, 스킬, 가이드는 그대로다.

## 문제

### 1. 레지스트리 기록 하나가 프로필 전체의 재개를 막는다

- 앱은 Claude 세션을 재개하거나 이어 보내기 전에 프로필의 `sessions/<pid>.json` 레지스트리를 모두 읽는다(`io.ts` `claudeOccupancy`). 기록 하나라도 형식이 어긋나거나, `version`이 `CLAUDE_REGISTRY_FLOOR`(2.1.284)보다 낮거나, 살아 있는 프로세스의 `kind`가 `interactive`가 아니면 결과는 `unknown`이다. 이 판정은 재개 대상이 아닌 세션의 기록에도 적용된다.
- `unknown`이면 터미널 세션 이어가기는 `session_unavailable`로 거절되고, 새 대화 상태에서 이어가기 선택지가 나오지 않는다(PRODUCT §3 'Live terminal policy': "a terminal session that cannot be continued is not offered").
- 관찰: Claude 데스크톱 앱에서 Code 세션을 열어 두면 그 앱에 번들된 claude-code(BACKLOG 기록 당시 2.1.309, 이 기기에서는 현재 2.1.321)가 `~/.claude/sessions/`에 기록을 쓰고, 그동안 같은 프로필의 Claude 터미널 세션은 하나도 이어갈 수 없었다. 2.1.309는 floor보다 높으므로, 그 기록이 어느 조건에서 걸리는지는 확인되지 않았다.
- 데스크톱 앱 Code 세션이 열려 있는 한 이 상태가 계속되고, 사람에게는 이유가 보이지 않는다.

### 2. 조직만 다를 때도 "다른 계정"이라고 안내한다

- Doan 연결 대화의 소유자와 현재 로그인이 같은 계정(또는 같은 연결)이지만 조직(workspace)이 다르면 `judgeConnection`이 `workspace_mismatch`로 거절하고, `judgmentCode`가 이를 `account_changed`로 바꾼다.
- 화면 문구(`dockedRules.ts` `OTHER_SIGN_IN.account_changed`)는 "sign out, then sign in to that account in Settings > Agents"라고만 말한다. 같은 계정으로 다시 로그인해도 다른 조직을 고르면 대화는 계속 거절된다. 이어가려면 같은 조직도 골라야 한다.
- 조직(`workspace`) 값을 갖는 공급자는 Claude Code(`organizationUuid`)와 GitHub Copilot(`host`)이다. Codex, Cursor, Antigravity는 `null`이라 조직 차이가 생기지 않는다. 이번 변경은 Claude Code의 조직 차이만 다룬다. Copilot의 `host` 차이는 사실상 다른 로그인이므로 지금 코드와 문구("account")를 유지한다.

## 왜 fail closed인가 (유지할 안전 이유)

- Doan은 세션을 포크하거나 빼앗지 않고, 한 세션에 한 번에 한 턴만 돌린다(PRODUCT §3 'Events and ownership', 'Resume and permissions'). 두 프로세스가 같은 세션을 함께 쓰지 않게 하는 것이 목적이다(POSTMORTEM 2026-10-28).
- 터미널에서 열린 세션은 `session_in_use`, 확인할 수 없는 세션은 `session_unavailable`이다(PRODUCT §3 'Live terminal policy'). 레지스트리가 없거나 읽을 수 없으면 "비어 있음"이 아니라 "확인 불가"로 본다(ARCHITECTURE §7 'External occupancy').
- floor 아래 버전이나 모르는 형식의 기록은 그 기록의 `sessionId`가 지금 그 프로세스가 쓰는 세션을 가리킨다고 믿을 근거가 없다. 그런 기록이 사실 재개 대상 세션을 쥐고 있다면, 그 기록을 건너뛴 재개는 이미 쓰이고 있는 세션에 두 번째 작성자를 붙인다. 지금 규칙은 이 위험을 프로필 단위로 막는다.
- 이번 변경은 이 안전 이유를 지키는 범위 안에서만 좁힌다. 재개 대상 세션을 쥐고 있을 수 있는 기록은 계속 `unknown`(또는 `occupied`)으로 판정한다.

## 완료 조건

1. PoC로 데스크톱 앱 Code 세션의 레지스트리 기록이 `claudeOccupancy`의 어느 조건에서 걸리는지 기록 단위로 밝혀 design.md에 적는다. 적는 것은 필드 이름, `kind`, `version`, `entrypoint`, 파일 이름 형식, PID 영역 유무, 생존 판정 결과, 대상 세션 일치 여부(참/거짓)뿐이다. 경로, 프롬프트, 세션 ID 값은 적지 않는다.
2. PoC 결과가 H1(살아 있는 비대화형 `kind`), H3(호스트가 아닌 PID 영역), H4(모르는 파일 이름), 낡은 기록 중 하나이면, 격리한 프로필에 PoC가 확인한 형태의 기록(대상이 아닌 세션)을 둔 상태에서 같은 프로필의 Claude 터미널 세션 이어가기가 제안되고 재개된다. 이것은 실제 앱에서 확인한다. 실제 데스크톱 앱 Code 세션을 연 상태의 확인은 별도 항목이다. 하지 못하면 확인하지 못한 것으로 보고한다.
3. 재개 대상 세션을 쥔 살아 있는 기록이 있으면, 그 기록의 `kind`와 관계없이 `session_in_use`로 거절된다. 문구는 "another terminal" 대신 "elsewhere"다.
   - 터미널 세션: "Couldn’t continue the terminal session: it’s open elsewhere."
   - 보내기: "<Provider> is using this session elsewhere. Try again when it finishes there."
4. 살아 있는 기록이 floor 아래이거나 형식이 어긋나면, 그 기록의 `sessionId`를 믿을 수 없으므로 지금처럼 `session_unavailable`이다.
   - 살아 있고 온전한 기록은 `kind`와 관계없이 `sessionId`로만 판정한다.
   - 호스트가 아닌 PID 영역의 기록은 생존을 알 수 없다. 온전하고 `sessionId`가 대상과 다르면 건너뛰고, 그 밖에는 `unknown`이다.
   - PoC 결과가 H2(살아 있는 기록에 `version`이나 `cwd`가 없음)이면 이 규칙으로는 데스크톱 기록이 계속 막히므로, 그때 규칙을 다시 정한다(design.md).
5. 프로세스가 없는 기록(`pid`/`procStart`가 살아 있는 프로세스와 맞지 않음)은 다른 필드가 어긋나도 재개를 막지 않는다.
6. Claude Code 대화의 소유자와 현재 로그인의 조직 값이 둘 다 `null`이 아니고 서로 다르면, main이 새 오류 코드 `workspace_changed`를 돌려준다. 안내 문구는 대화를 시작한 조직으로 다시 로그인해야 이어갈 수 있다고 말한다(문장은 design.md §2, 조직 선택 화면 확인 결과에 따름). Retry 대신 "Start a new conversation" 하나를 주는 동작은 `account_changed`와 같다(PRODUCT §5 item 3).
   - 조직 값 중 하나라도 `null`이면 지금처럼 `account_changed`와 지금 문구다.
   - 계정이 다르면 지금처럼 `account_changed`와 지금 문구다.
   - Copilot의 `host`가 다르면 지금처럼 `account_changed`와 지금 문구다.
7. 로그인 상태가 `account_mismatch` 오류를 가진 채 보내면 오늘의 코드와 문구가 그대로이고, `workspace_changed`가 나오지 않는다. 이 경우를 테스트로 고정한다. 코드를 읽으면 오늘의 코드는 `account_changed`가 아니라 `not_logged_in`으로 보인다. lease를 얻는 단계에서 `accountCode`가 바꾸고(`prepare.ts` 90–92행), 다시 확인할 때도 그렇다(`recheck`, 226행). 테스트는 실제 오늘 동작을 확인해 고정한다.
8. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `go test ./...`가 통과한다.

## 비목표

- `CLAUDE_REGISTRY_FLOOR`나 `MINIMUM_VERSIONS`를 올리거나 내리지 않는다(ARCHITECTURE §7: floor를 올리는 것은 별도 결정이다).
- Codex의 writer lock 판정(`codexOccupancy`)은 바꾸지 않는다.
- 데스크톱 앱 Code 세션 자체를 Doan에서 이어가는 기능은 만들지 않는다. 연관 기록은 셸 `doan check`만 남긴다(PRODUCT §3 'Association recording').
- 거절 안내에 조직 이름을 보여 주지 않는다. Doan은 조직 ID만 저장하고 이름은 저장하지 않는다.
- GitHub Copilot의 `host` 차이 코드와 문구는 바꾸지 않는다.
- app-socket v2 스키마, Go CLI의 오류 코드 목록, fixture는 바꾸지 않는다.
- 로그인 직후 알림(`agentAuthView.ts` `account_mismatch`, "You signed in with a different … account")은 바꾸지 않는다. Doan의 Sign in again은 연결을 바꾸고 오류를 지우므로(`state.ts` 52–53행), 조직만 다른 `account_mismatch`는 전용 프로필의 로그인이 Doan 밖에서 바뀌었을 때만 생긴다(상태 확인 61행, `runConfirmed` 90행, `checkVerdict` 106행). 마지막 작업에서 BACKLOG에 남긴다.
- 판정 결과가 여전히 `unknown`인 프로필(살아 있는데 믿을 수 없는 기록이 있는 경우)에서 이어가기 선택지가 이유 없이 사라지는 것은 그대로다. 연관을 방문당 한 번 묻는 동작도 그대로다. 마지막 작업에서 BACKLOG에 남긴다.
- 확인하는 도중에 새로 생긴 기록은 보지 못한다. 지금 규칙과 같으며 받아들인다(최선의 노력 확인이지 잠금이 아니다, PRODUCT §3 'Live terminal policy').
