# 스레드 편집 줄 수 — spec

## 사용자

- **사람**: 캔버스 패널, Overview, 프로토타입 창의 대화 스레드를 읽는 사람이다. 에이전트가 코드나 캔버스를 고치고 있다는 것과, 편집마다 몇 줄을 추가하고 지웠는지를 스레드에서 바로 알 수 있다.
- **에이전트**: 바뀌는 것이 없다. 프롬프트, CLI, 스킬, `doan check`는 그대로다.

## 문제

PRODUCT §3 In scope 6(Conversation)과 §5 item 3의 activity 행 규칙을 확장한다. 사람은 스레드를 보며 에이전트의 작업을 따라가고 리뷰한다. 이때 편집의 크기는 "이 턴이 캔버스나 코드를 얼마나 바꿨나"를 판단하는 첫 단서다.

- 스레드의 activity 행은 편집 단계를 "Edited <path>"로만 보여준다(`ConversationThread.tsx:546` `Steps`). 편집이 큰지 작은지는 스레드에서 알 수 없다.
- 행은 기본으로 접혀 "N steps"만 보인다. 그래서 펼치기 전에는 그 턴에 편집이 있었는지도 알 수 없다.
- 모든 provider가 편집 내용을 넘겨주지만, 저장되는 `activity` 이벤트에는 `kind`·`path`·`insideDesign`·`summary`만 있다(`app/src/main/conversation/types.ts:52`). 편집 내용은 정규화 단계에서 버려진다.
  - Claude Code: activity를 만드는 `claudeActivity`(`transport.ts:299`)가 입력의 `old_string`/`new_string`/`content`를 읽지 않는다. 결과 프레임(`transport.ts:430`)의 `tool_use_result`(`structuredPatch`·`originalFile`)도 읽지 않는다.
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
- 합계는 줄 수를 아는 편집만 더한다. 일부 편집의 줄 수를 몰라도 합계를 보여준다.
- 숫자는 0이어도 두 쪽을 모두 보여준다(`+12 −0`, `+0 −0`). 알고 있는 0과 모르는 값(숫자 없음)이 구분된다.
- 편집 단계는 지금처럼 편집을 시작할 때 기록하고, 결과는 편집이 끝난 뒤 별도 이벤트 `activity.result`로 붙인다.
  - 롤백 비용: 업그레이드 후 편집이 한 번이라도 있었던 대화는 거의 모두 이전 Doan으로 돌아갔을 때 열리지 않는다. 다운그레이드가 드물어서 이 비용을 받아들인다.
  - 이름을 일반적으로 지은 이유: 나중에 inline diff를 붙일 때 이 이벤트에 선택 필드만 추가하면 되므로, 롤백 호환을 다시 깨지 않는다.

## 완료 조건

1. T0 PoC가 편집 결과를 준다고 확인한 provider에서는, 편집이 적용되면 그 편집 단계에 추가 줄 수와 삭제 줄 수가 저장된다. T0가 끝나면 이 조건을 고정된 목록으로 다시 쓴다. 형식은 "<provider>: `fixtures/`의 녹화 프레임이 이 숫자의 `activity.result`를 낸다"이다. 빠진 provider는 BACKLOG 항목과 함께 적는다.
2. 펼친 activity 행의 편집 단계는 "Edited <path>" 뒤에 `+N −M`을 보여준다. 수정 한 줄은 추가 1과 삭제 1로 센다. 같은 파일을 여러 번 고치면 편집마다 따로 센다. 경로가 없는 단계("Edited a file")도 같은 편집의 결과이면 숫자를 보여준다.
3. 접힌 머리가 단계 수를 보여줄 때, 줄 수가 있는 편집 단계가 하나라도 있으면 그 단계들의 합계 `+N −M`이 뒤에 붙는다. 줄 수가 있는 편집이 없으면 머리는 지금과 같다. 머리가 진행 중 문구("Editing <path>")로 회전하는 동안에는 합계를 붙이지 않는다. 숫자가 늦게 도착해도 따로 알리지 않는다(상태 줄 문구는 그대로다).
4. 줄 수를 모르는 편집에는 숫자가 나오지 않는다. 다음이 여기에 해당한다.
   - 이 기능 이전의 히스토리
   - 거부되거나 실패한 편집
   - Stop을 누른 순간 진행 중이던 편집(턴이 끝난 뒤 도착한 결과는 버려진다)
   - 전후 텍스트를 비교해 세는 provider(ACP)에서, 두 텍스트의 줄 수 합이 20,000줄을 넘거나 편집 거리가 상한을 넘은 편집
   - 편집 결과를 주지 않는 provider
5. 스크린리더 이름이 있다. 단계는 "12 lines added, 3 removed"이고, 단수형은 "1 line added, 1 removed"다. 머리는 "6 steps, 42 lines added, 10 removed"다. 단계 텍스트를 선택해 복사하면, 지금의 복사 결과("Edited⏎a.ts", 동사와 경로 사이 줄바꿈)에 `+12 −3` 한 덩어리가 더해진다. 스크린리더 이름은 섞이지 않는다.
6. 숫자가 늦게 도착해도 단계와 머리는 한 줄을 유지하고, 스레드의 스크롤 높이가 바뀌지 않는다.
7. `activity.result`가 든 히스토리를 이 빌드가 다시 읽으면 같은 숫자가 나온다. 이 이벤트가 없는 기존 히스토리도 그대로 읽힌다.
8. 줄 수를 세는 순수 함수가 unified diff, Claude `structuredPatch`, 전후 텍스트 비교에서 기대값과 같은 숫자를 낸다. 경계 사례는 tasks.md T2에 있다.

## 비목표

- inline diff 본문, 파일 열기, 되돌리기, 스테이징. 다음 feature로 미룬다(BACKLOG 아이디어).
- 턴 끝 "바뀐 파일" 요약 카드(Orca의 헤더 요약). 이번에는 activity 행 머리의 합계만 다룬다.
- 파일 단위의 순 변화(같은 파일을 고쳤다 되돌린 경우 0으로 보여주기). 줄 수만으로는 계산할 수 없다.
- 셸 명령(`sed`, 스크립트)으로 바뀐 파일. provider가 경로를 보고하지 않으므로 지금처럼 "Ran a command"로 남는다.
- Claude Code subagent의 편집. 지금도 그 프레임을 버리고 있다(`transport.ts:336`).
- 거부되거나 실패한 편집이 "Edited"로 남는 현재 동작을 고치는 일. 줄 수만 붙지 않는다.
- 재개한 외부 세션의 과거 턴. Doan 히스토리에 편집 내용이 없다.
- 턴 인디케이터의 문구("Editing <path>")와 진행 중 표시.
