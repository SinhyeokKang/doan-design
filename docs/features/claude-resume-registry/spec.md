# claude-resume-registry — spec

`docs/BACKLOG.md` 'Known defects'의 두 항목을 고친다. 원문은 다음과 같다.

> One Claude session registry record Doan cannot accept (below `CLAUDE_REGISTRY_FLOOR` 2.1.284, malformed, or a live non-interactive one) makes the whole profile's resume `unknown`, so every terminal session continue in that profile is hidden while it lives. With a Claude desktop app Code session open (its bundled claude-code 2.1.309 writes records into `~/.claude/sessions/`), no Claude terminal session could be continued; 2.1.309 is above the current floor, so which condition those records fail is unverified. Narrowing the fail-closed rule (for example to the record of the session being resumed) needs a decision.

> The `account_changed` refusal for another workspace (`workspace_mismatch`) says to sign out, then sign in to that account, but the conversation continues only once the same organization or workspace is chosen too (`dockedRules.ts` `OTHER_SIGN_IN`).

## 사용자

- **사람**: 앱에서 터미널 세션 이어가기를 고르는 사람(1)과, 다른 조직으로 로그인한 뒤 거절 안내를 읽는 사람(2)이다.
- **에이전트**: 바뀌는 것이 없다. CLI, 스킬, 가이드는 그대로다.

## 문제

### 1. 레지스트리 기록 하나가 프로필 전체의 재개를 막는다

- 앱은 Claude 세션을 재개하거나 이어 보내기 전에 프로필의 `sessions/<pid>.json` 레지스트리를 모두 읽는다(`io.ts` `claudeOccupancy`). 기록 하나라도 형식이 어긋나거나, `version`이 `CLAUDE_REGISTRY_FLOOR`(2.1.284)보다 낮거나, 살아 있는 프로세스의 `kind`가 `interactive`가 아니면 결과는 `unknown`이다. 이 판정은 재개 대상이 아닌 세션의 기록에도 적용된다.
- `unknown`이면 터미널 세션 이어가기는 `session_unavailable`로 거절되고, 새 대화 상태에서 이어가기 선택지가 나오지 않는다(PRODUCT §3 'Live terminal policy': "a terminal session that cannot be continued is not offered").
- 관찰: Claude 데스크톱 앱에서 Code 세션을 열어 두면 그 앱에 번들된 claude-code(BACKLOG 기록 당시 2.1.309, 이 기기에서는 현재 2.1.321)가 `~/.claude/sessions/`에 기록을 쓰고, 그동안 같은 프로필의 Claude 터미널 세션은 하나도 이어갈 수 없었다. 2.1.309는 floor보다 높으므로, 그 기록이 어느 조건에서 걸리는지는 확인되지 않았다.
- 데스크톱 앱 Code 세션이 열려 있는 한 이 상태가 계속되고, 사람에게는 이유가 보이지 않는다.

### 2. 조직만 다를 때도 "다른 계정"이라고 안내한다

- **대화 거절**: Doan 연결 대화의 소유 계정과 현재 로그인이 같은 계정이지만 조직(workspace)이 다르면 `judgeConnection`이 `workspace_mismatch`로 거절하고, `judgmentCode`가 이를 `account_changed`로 바꾼다. 화면 문구(`dockedRules.ts` `OTHER_SIGN_IN.account_changed`)는 "sign out, then sign in to that account in Settings > Agents"라고만 말한다. 같은 계정으로 다시 로그인해도 다른 조직을 고르면 대화는 계속 거절된다. 이어가려면 같은 조직도 골라야 한다.
- **로그인 직후 알림**: 저장된 연결과 같은 계정으로 다시 로그인했지만 조직이 다르면 `state.ts`가 계정이 다를 때와 같은 `account_mismatch` 오류를 남긴다. Settings > Agents와 첫 실행 Agent 단계의 알림(`agentAuthView.ts`)은 "You signed in with a different … account. Sign in again with the same account, or sign out first."라고 말해, 같은 계정으로 로그인한 사람에게 맞지 않는 안내가 된다.
- 조직(`workspace`) 값을 갖는 공급자는 Claude Code(`organizationUuid`)와 GitHub Copilot(`host`)이다. Codex, Cursor, Antigravity는 `null`이라 조직 차이가 생기지 않는다. 이번 변경은 Claude Code의 조직 차이만 다룬다. Copilot의 `host` 차이는 사실상 다른 로그인이므로 지금 문구를 유지한다.

## 왜 fail closed인가 (유지할 안전 이유)

- Doan은 세션을 포크하거나 빼앗지 않고, 한 세션에 한 번에 한 턴만 돌린다(PRODUCT §3 'Events and ownership', 'Resume and permissions'). 두 프로세스가 같은 세션을 함께 쓰지 않게 하는 것이 목적이다(POSTMORTEM 2026-10-28).
- 터미널에서 열린 세션은 `session_in_use`, 확인할 수 없는 세션은 `session_unavailable`이다(PRODUCT §3 'Live terminal policy'). 레지스트리가 없거나 읽을 수 없으면 "비어 있음"이 아니라 "확인 불가"로 본다(ARCHITECTURE §7 'External occupancy').
- floor 아래 버전이나 모르는 형식의 기록은 그 기록의 `sessionId`가 지금 그 프로세스가 쓰는 세션을 가리킨다고 믿을 근거가 없다. 그런 기록이 사실 재개 대상 세션을 쥐고 있다면, 그 기록을 건너뛴 재개는 터미널이 쓰는 세션에 두 번째 작성자를 붙인다. 지금 규칙은 이 위험을 프로필 단위로 막는다.
- 이번 변경은 이 안전 이유를 지키는 범위 안에서만 좁힌다. 재개 대상 세션을 쥐고 있을 수 있는 기록은 계속 `unknown`(또는 `occupied`)으로 판정한다.

## 완료 조건

1. PoC로 데스크톱 앱 Code 세션의 레지스트리 기록이 `claudeOccupancy`의 어느 조건에서 걸리는지 기록 단위로 밝혀 design.md에 적는다(필드 이름, `kind`, `version`, `entrypoint`, 파일 이름 형식만. 경로, 프롬프트, 세션 ID 값은 적지 않는다).
2. 데스크톱 앱 Code 세션 기록이 PoC에서 확인된 형태로 있어도, 그 기록이 재개 대상 세션이 아니면 같은 프로필의 Claude 터미널 세션 이어가기가 제안되고 재개된다(앱에서 확인).
3. 재개 대상 세션을 쥔 살아 있는 기록이 있으면, 그 기록의 `kind`와 관계없이 지금처럼 `session_in_use`로 거절된다.
4. 살아 있는 기록이 floor 아래이거나 형식이 어긋나면, 그 기록의 `sessionId`를 믿을 수 없으므로 지금처럼 `session_unavailable`이다.
   - 살아 있고 온전한 기록은 `kind`와 관계없이 `sessionId`로만 판정한다.
   - PoC 결과가 H2나 H3(살아 있는 데스크톱 기록에 필드가 없음)이면 이 규칙으로는 데스크톱 기록이 계속 막히므로, 그때 규칙을 다시 정한다(design.md).
5. 프로세스가 없는 기록(`pid`/`procStart`가 살아 있는 프로세스와 맞지 않음)은 다른 필드가 어긋나도 재개를 막지 않는다.
6. Claude Code 대화가 계정은 같고 조직만 달라 거절되면 main이 새 오류 코드 `workspace_changed`를 돌려주고, 안내 문구는 같은 조직을 골라 다시 로그인해야 이어갈 수 있다고 말한다. Retry 대신 "Start a new conversation" 하나를 주는 동작은 `account_changed`와 같다(PRODUCT §5 item 3). 계정이 다르거나 Copilot의 `host`가 다르면 지금처럼 `account_changed`와 지금 문구다.
7. Claude Code에 저장된 연결과 같은 계정(두 계정 ID가 모두 있고 같음)으로 다시 로그인했는데 조직만 다르면, Settings > Agents와 첫 실행 Agent 단계의 알림이 다른 계정이 아니라 다른 조직으로 로그인했다고 말하고 같은 조직을 고르라고 안내한다. 계정 ID가 없어 같은 계정인지 증명할 수 없으면 지금 문구다. 복구 버튼(Sign in again, Sign out)은 그대로다.
8. `doan onboarding`이 받는 app-socket v2 응답은 바뀌지 않는다. 조직만 다른 경우에도 `account_mismatch`다.
9. `npm --prefix app test`, `npm --prefix app run typecheck`가 통과한다.

## 비목표

- `CLAUDE_REGISTRY_FLOOR`나 `MINIMUM_VERSIONS`를 올리거나 내리지 않는다(ARCHITECTURE §7: floor를 올리는 것은 별도 결정이다).
- Codex의 writer lock 판정(`codexOccupancy`)은 바꾸지 않는다.
- 데스크톱 앱 Code 세션 자체를 Doan에서 이어가는 기능은 만들지 않는다. 연관 기록은 셸 `doan check`만 남긴다(PRODUCT §3 'Association recording').
- 거절 안내와 알림에 조직 이름을 보여 주지 않는다. Doan은 조직 ID만 저장하고 이름은 저장하지 않는다.
- GitHub Copilot의 `host` 차이 문구는 바꾸지 않는다.
- app-socket v2 스키마와 Go CLI의 오류 코드 목록, `doan onboarding`의 오류 문구(`operations.ts` "A different account is signed in. Sign in again.")는 바꾸지 않는다.
