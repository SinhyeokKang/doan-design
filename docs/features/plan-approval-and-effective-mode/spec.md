# plan 승인과 실제 권한 모드 — spec

## 사용자

- **사람**: composer의 권한 trigger를 보고 agent가 무엇을 묻고 무엇을 묻지 않을지 판단한다. 이번 기능으로 Claude Code 턴이 실제로 돈 모드를 trigger에서 본다. Antigravity 대화에서는 `/plan`을 보내고, 계획을 본 뒤 다음 메시지로 "Proceed"를 보내 실행한다.
- **agent**: 바뀌는 것이 없다. CLI·skill·`doan check`는 그대로다.

## 문제 (관찰된 사실)

1. **Claude Ask first 턴의 실제 모드가 trigger와 다를 수 있다.** Ask first는 Claude에 모드를 넘기지 않는다(`claudePermission`, `permissionMode.ts`). 그래서 Doan 연결 profile과 프로젝트의 `.claude/settings.json`·`settings.local.json`에 있는 `defaultMode`가 그대로 적용된다(이전 permission-mode 기능의 PoC, commit 94edc6157). 이 값이 `auto`나 `dontAsk`면 Claude는 묻지 않는다. 그래도 trigger는 Ask first를 보이고, menu 설명도 "Asks before edits and commands unless allowed"라고 말한다.
2. **plan 승인 뒤에도 같은 어긋남이 생긴다.** plan을 승인하면 Claude가 `system/status`로 다음 모드를 알린다. Doan은 `auto`·`dontAsk`·`bypassPermissions`를 Ask first로 읽어 저장한다(`claudeModeAfterPlan`, ARCHITECTURE §7 'Permission modes'). 저장 값 자체는 맞다. PRODUCT §3 'Resume and permissions'가 "Ask first applies the user's own permission and sandbox settings"라고 정해 두었기 때문이다. 하지만 Claude가 그 모드로 계속 묻지 않는다는 사실이 화면에 없다. PoC P1에서는 설정에 `defaultMode`가 있어도(`auto`·`dontAsk`·`acceptEdits`·`plan`) 승인 뒤 `default`만 왔다(design.md 'PoC 의존' P1).
3. **Antigravity `/plan`은 보내지 않는다.** 계획을 쓴 뒤 'Proceed' 승인을 기다리는데, Doan에는 그 승인 UI가 없다. 그래서 지금은 "/plan doesn't run in Doan" 카드로 막는다(PRODUCT §5 item 1 'Built-in commands', BACKLOG 'Undecided'). PoC P2에서 그 승인은 protocol 요청이 아니라 다음 사람 메시지를 기다리는 것으로 확인했다(design.md 'PoC 의존' P2).

## 완료 조건

- Doan 연결 profile의 `settings.json`에 `defaultMode: "auto"`가 있을 때 Claude Ask first로 턴을 보내면, 그 턴의 최상위 `system/init`이 온 뒤 trigger가 "Ask first · Auto"로 바뀐다. aria-label은 "Permission: Ask first, Claude Code settings run Auto mode"이고, menu의 Ask first 설명은 "Your Claude Code settings run Auto mode"이다.
  - 프로젝트 `.claude/settings.json`·`settings.local.json`의 `auto`는 Claude가 무시하고 `default`로 시작하므로 아무것도 붙지 않는다(PoC P1).
- 프로젝트 `.claude/settings.json`에 `defaultMode: "dontAsk"`가 있는 폴더에서도 같은 규칙으로 "Don’t ask"를 붙이고, 설명은 "Your Claude Code settings run Don’t ask mode"이다. profile 설정의 `dontAsk`도 같다.
- `acceptEdits`는 "Accept edits", `plan`은 "Plan (read-only)"를 같은 규칙으로 붙인다. 둘 다 프로젝트 설정과 profile 설정 어느 쪽에서든 init이 그 값을 알린다.
- `bypassPermissions`는 Doan 연결 profile의 `settings.json`에 있을 때만 "Full access"를 붙이고, trigger에 Full access 경고(`shield-alert`, ", no approval requests")를 보인다. 프로젝트 설정의 `bypassPermissions`는 Claude가 무시하고 `default`로 시작한다(PoC P1).
- 턴의 실제 모드가 `default`면 아무것도 붙이지 않는다. 지금 화면과 같다.
- plan 승인 뒤 Claude는 설정과 상관없이 `default`를 알린다(PoC P1). 그래서 승인하면 저장 모드는 지금처럼 Ask first가 되고 `claudeRunMode` 키는 지워진다. trigger는 덧붙인 값 없이 "Ask first"가 된다.
- 실제 모드는 대화 metadata에 저장된다. 앱을 다시 열어도 마지막 턴의 값이 보이고, 다음 Ask first 턴의 `system/init`이 오면 새 값으로 바뀐다. 그 사이 설정이 바뀌었으면 다음 턴까지 이전 값이 보인다(받아들인 한계).
- 저장 모드가 Ask first가 아닐 때(picker로 고르거나 그 모드로 보냈을 때)는 덧붙인 값이 보이지 않는다. 값은 지우지 않으므로, 다시 Ask first를 고르면 마지막 관찰값이 곧바로 다시 보인다.
- 턴이 `system/init` 전에 실패하거나 멈추면 이전 값이 그대로 남는다.
- 값이 바뀌면 composer가 스크린리더에 한 번 알린다("Claude Code settings run Auto mode"). 같은 값이 다시 관찰되면 알리지 않는다.
- Antigravity 대화에서 `/plan <할 일>`을 보내면 카드 없이 명령 메시지로 간다. "/plan doesn't run in Doan" 카드는 더 이상 나오지 않는다. `/plan`은 실제 앱 확인을 거친 명령으로 `COMMAND_ALLOWLIST`에 들어가므로, 서버가 목록에 올린 대화에서는 다른 확인된 명령처럼 명령 목록에 서버 설명과 함께 나온다.
- Ask first에서 `/plan` 턴은 계획 파일을 쓰기 전에 지금의 권한 카드로 묻는다. 허용하면 계획이 답으로 오고 턴이 끝난다.
- 사람이 다음 메시지로 "Proceed"를 보내면 agent가 계획을 실행한다. 실행 중 도구는 모드대로 지금의 권한 카드로 묻는다.
- 그 밖에 새로 생기는 UI는 없다. 답의 "click **Proceed**" 문구와 Doan profile 안을 가리키는 계획 파일의 `file://` 링크는 그대로 보인다.

## 비목표

- Codex와 ACP provider에는 덧붙이지 않는다. 둘 다 Ask first 값을 명시해서 보내므로(ARCHITECTURE §7 'Permission modes') 설정으로 바뀌지 않는다.
- 폴더 설정이 Full access를 막아 Claude가 Ask first로 시작하는 경우는 다루지 않는다. PRODUCT §5 item 1 'Permission picker'는 "Doan does not mark it"으로 정해 두었다.
- 새 대화 composer(Home, Overview·canvas의 새 대화)에는 실제 모드를 보이지 않는다. 실제 모드는 턴이 시작될 때 Claude가 알려 주므로, 턴이 없는 대화에는 값이 없다.
- 첫 턴에서 실제 모드를 thread에 따로 알리지 않는다. 표시는 trigger로만 한다(사용자 결정).
- 프로젝트별로 값을 모아 두는 캐시는 만들지 않는다. 값은 대화마다 저장한다.
- plan 승인이 context를 비우고 세션을 옮기는 경우(`session_unavailable`, BACKLOG 'Undecided')는 다루지 않는다.
- Claude의 `auto`·`dontAsk`를 picker에서 고를 수 있는 모드로 더하지 않는다. 공통 모드 네 개는 그대로다.
- Antigravity `/plan` 승인 UI(Proceed 버튼 등)는 만들지 않는다. "Proceed"는 사람이 다음 메시지로 직접 보낸다(사용자 결정).
