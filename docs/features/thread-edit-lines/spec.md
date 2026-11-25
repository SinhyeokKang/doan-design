# 스레드 편집 줄 수 — spec

## 사용자

- **사람**: 캔버스 패널, Overview, 프로토타입 창의 대화 스레드를 읽는 사람이다. 에이전트가 코드나 캔버스를 고치고 있다는 것과, 편집마다 몇 줄을 추가하고 지웠는지를 스레드에서 바로 알 수 있다.
- **에이전트**: 바뀌는 것이 없다. 프롬프트, CLI, 스킬, `doan check`는 그대로다.

## 문제

- 스레드의 activity 행은 편집 단계를 "Edited <path>"로만 보여준다(`ConversationThread.tsx` `Steps`). 편집이 큰지 작은지, 무엇을 지웠는지는 스레드에서 알 수 없다.
- 행은 기본으로 접혀 "N steps"만 보인다. 그래서 펼치기 전에는 그 턴에 편집이 있었는지도 알 수 없다.
- 모든 provider가 편집 내용을 넘겨주지만, 저장되는 `activity` 이벤트에는 `kind`·`path`·`insideDesign`·`summary`만 있다(`app/src/main/conversation/types.ts:52`). 편집 내용은 정규화 단계에서 버려진다.
  - Claude Code: 입력의 `old_string`/`new_string`/`content`, 결과 프레임(`tool_use_result`)의 `structuredPatch`·`originalFile`을 읽지 않는다(`transport.ts:269`, `:430`).
  - Codex: fileChange 항목 `changes[]`의 `diff`와 `kind`를 읽지 않는다(`transport.ts:316`).
  - ACP(Cursor, Copilot, Antigravity): 완료된 tool call의 `content`(`type: "diff"`, `oldText`/`newText`)와 `rawOutput`을 읽지 않는다(`acp.ts:231`).

## 레퍼런스 (확인한 출처)

- Orca 구조화 채팅: 턴이 끝나면 헤더가 바뀐 파일과 추가·삭제 줄 수를 요약하고, 펼치면 파일별 inline diff 카드가 나온다. "its header can summarize the unique files changed and their additions/deletions. Expand it to reveal the existing diff cards." — https://orca.dev/docs/agents/native-chat (2026-11-25 확인. 카드 색과 아이콘, 줄 수 제한은 문서에 없다. changelog 1-4-198은 404).
- Cursor 편집 카드: 처음에는 "minimal (and correct) line edit count"를 보여주고 "Show Diff"로 펼친다. 큰 파일에서 `+7 -1130`처럼 전체가 지워진 것으로 셀 수 있다는 버그 보고가 있다 — https://forum.cursor.com/t/file-edit-card-is-pretty-broken/136229 (사용자 보고이며 공식 사양이 아니다).
- Claude Code Desktop: 줄 수(`+12 -1`)를 대화 안이 아니라 세션 패널의 Changes 카드에 보여준다 — https://code.claude.com/docs/en/desktop.
- Codex app: 리뷰 패널이 대화와 따로 있다. 스레드 안의 줄 수 요약은 문서에서 찾지 못했다 — https://learn.chatgpt.com/docs/code-review?surface=app.
- 공통 패턴: 편집 옆에 `+N −M`을 붙이고, diff 본문은 펼쳐야 보인다. 이번 범위는 그중 줄 수만 다룬다.

## 확정한 결정 (사용자)

- 캔버스 HTML(`.doan/canvases/`)을 포함해 모든 편집에 같은 규칙을 적용한다.
- 이번 범위는 줄 수만 다룬다. inline diff 본문은 보여주지도 저장하지도 않는다.
- 접힌 activity 행의 머리에도 그 행의 편집 줄 수 합계를 붙인다(예: "6 steps · +42 −10").
- 편집 단계는 지금처럼 편집을 시작할 때 기록하고, 줄 수는 편집이 끝난 뒤 별도 이벤트로 붙인다. 그래서 이 이벤트가 든 히스토리는 이전 Doan이 읽지 못한다(ARCHITECTURE 'Device-local storage and limits'의 기존 선례와 같은 비용이다).

## 완료 조건

1. Claude Code, Codex, Cursor, Copilot, Antigravity의 편집이 적용되면, 그 편집 단계에 추가 줄 수와 삭제 줄 수가 저장된다. 단, 실기 PoC에서 해당 provider가 편집 내용을 준다는 것이 확인된 경우에 한한다. 확인되지 않은 provider는 줄 수 없이 지금처럼 보이고, BACKLOG에 남는다.
2. 펼친 activity 행의 편집 단계는 "Edited <path>" 뒤에 `+N −M`을 보여준다. 수정 한 줄은 추가 1과 삭제 1로 센다.
3. 접힌 머리가 단계 수를 보여줄 때, 그 행에 줄 수가 있는 편집 단계가 하나라도 있으면 합계 `+N −M`이 뒤에 붙는다. 줄 수가 있는 편집이 없으면 머리는 지금과 같다.
4. 줄 수를 모르는 편집에는 숫자가 나오지 않는다. "+0 −0"으로 표시하지 않는다. 이 기능 이전의 히스토리, 거부되거나 실패한 편집, 아래 크기 한도를 넘은 편집, 편집 내용을 주지 않는 provider가 여기에 해당한다.
5. 숫자 표시에는 스크린리더용 이름이 있다(예: "12 lines added, 3 removed").
6. 줄 수 이벤트가 든 히스토리를 이 빌드가 다시 읽으면 같은 숫자가 나온다. 이벤트가 없는 기존 히스토리도 그대로 읽힌다.
7. 줄 수를 세는 순수 함수가 unified diff, Claude `structuredPatch`, 전후 텍스트 비교(새 파일, 삭제, 빈 파일, 줄바꿈 없는 마지막 줄 포함)에서 기대값과 같은 숫자를 낸다.

## 비목표

- inline diff 본문, 파일 열기, 되돌리기, 스테이징. 다음 feature로 미룬다(BACKLOG 후보).
- 턴 끝 "바뀐 파일" 요약 카드(Orca의 헤더 요약). 이번에는 activity 행 머리의 합계만 다룬다.
- 셸 명령(`sed`, 스크립트)으로 바뀐 파일. provider가 경로를 보고하지 않으므로 지금처럼 "Ran a command"로 남는다.
- Claude Code subagent의 편집. 지금도 그 프레임을 버리고 있다(`transport.ts:336`).
- 거부되거나 실패한 편집이 "Edited"로 남는 현재 동작을 고치는 일. 줄 수만 붙지 않는다.
- 재개한 외부 세션의 과거 턴. Doan 히스토리에 편집 내용이 없다.
- 턴 인디케이터의 문구("Editing <path>")와 진행 중 표시.
