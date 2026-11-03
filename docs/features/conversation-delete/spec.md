# conversation-delete — spec

대화 제목 메뉴(프로젝트 Overview의 Conversation menu와 캔버스 conversation panel의 Title menu)의 대화 행에서 그 대화를 삭제한다. 삭제는 이 기기에 있는 Doan의 기록만 지운다. 에이전트(Claude Code·Codex 등)가 가진 세션 파일은 건드리지 않는다.

## 사용자

- **사람(앱 사용자)**: 대화 제목 메뉴에서 행에 포인터를 올리면 나타나는 메뉴 버튼으로 Delete를 고르고, 확인 알림에서 삭제를 확정한다.
- **에이전트**: 바뀌는 것이 없다. CLI·guide·skill stub·`doan check` 출력은 그대로다. 에이전트의 세션 파일과 transcript도 그대로 남는다.

## 문제 (관찰된 사실)

- 대화를 지우는 방법이 없다. 대화는 쌓이기만 하고 제목 메뉴는 대화를 최근 활동 순으로 모두 보여 준다(PRODUCT §5 item 2 'Conversation panel', item 3 'Project Overview' Conversation menu).
- 대화 기록은 `<userData>/conversations/<id>.jsonl`과 `index.json` 항목, 되돌아온 queue는 `drafts.json`에 있다(ARCHITECTURE §7 'Device-local storage and limits'). 앱에는 이 기록을 지우는 채널이 없다(`conversationMethods`, `app/src/main/conversation/ipc.ts`).
- 캔버스 행에는 hover 때 나타나는 메뉴 버튼(Export…, Move to Trash)이 있지만(PRODUCT §5 item 1 'Canvas row menu') 대화 행에는 행 단위 동작이 없다.

## 이미 정한 것 (사용자 결정)

1. 삭제는 이 기기에 있는 Doan의 기록(대화 index 항목에 든 세션 연결과 대화 이벤트)만 지운다. 에이전트 자신의 세션 파일(Claude Code·Codex 등)은 그대로 둔다. Doan 연결 프로필(`<userData>/agent-auth/profiles/`) 안의 세션 파일도 에이전트의 세션 파일로 본다.
2. 일하는 중이거나 답을 기다리는 대화는 삭제할 수 없다. 메뉴 항목이 비활성이다.
3. 삭제는 확인 알림을 거친다. 알림은 대화 제목을 보여 주고, 이 기기에 있는 Doan의 기록만 지우며 에이전트의 세션 파일은 지우지 않는다고 말한다. 확정하면 바로 지운다. Undo 토스트와 지연 삭제는 없다. 알림 모양은 캔버스 Move to Trash의 확인 알림(PRODUCT §5 item 1 'Canvas row menu')과 같다.
4. 보이고 있는 대화(또는 캔버스의 현재 대화)를 지우면 새 대화 상태(new conversation state)를 보여 준다.

## 완료 조건

1. Overview의 Conversation menu와 캔버스 panel의 Title menu에서 각 대화 행(New conversation 행 제외)에 `<대화 제목> menu`라는 이름의 메뉴 버튼이 있다. 버튼은 포인터가 행 위에 있을 때, 키보드 하이라이트가 행이나 버튼에 있을 때, 버튼의 메뉴가 열려 있을 때 보이고, 그 동안 행의 시간 자리를 차지한다. 숨은 동안에도 시간의 읽기 라벨은 남는다.
2. 메뉴 버튼은 Delete 한 항목짜리 메뉴를 연다. 메뉴는 클릭이나 키보드로만 열리고, 포인터를 올리기만 해서는 열리지 않는다. 행을 클릭하면 지금처럼 그 대화로 바뀌고, 버튼을 클릭해도 대화가 바뀌지 않는다. 방향키는 행 다음에 그 행의 버튼에 멈추고, 그 동안 행도 하이라이트 채움을 유지한다. 버튼에서 → 또는 Enter·Space가 메뉴를 열고, ←가 메뉴를 닫고 하이라이트를 버튼으로 돌린다. Esc는 제목 메뉴까지 모두 닫고 포커스를 제목 메뉴 trigger로 보낸다(Radix 기본 동작). ⌫·⌘⌫ 단축키와 행 우클릭 메뉴는 없다(캔버스 행 메뉴와 같다).
3. 대화가 일하는 중이거나(main의 `working`, 또는 `phase === "running"`) 답을 기다리면(`phase === "waiting"`) Delete는 사용할 수 없다. 항목은 방향키로 닿고, 이유 줄을 읽는다(DESIGN 'Canvas row menu and export viewer' 'Unavailable item' 규칙). 프로젝트 대화가 턴을 끝낸 뒤 승격 판정을 기다리는 동안과 queue가 나갈 차례인 동안도 `working`이라 비활성이다.
4. Delete를 고르면 메뉴가 닫히고 확인 알림(`alertdialog`, compact)이 열린다. 제목은 `Delete “<대화 제목>”?`이고, 본문은 Doan이 이 기기에서 대화와 기록을 지운다는 것, 그 provider의 세션 파일은 그대로라는 것, 되돌릴 수 없다는 것을 말한다. 지울 대화에 보내지 않은 초안이나 되돌아온 queue가 있으면 본문에 그 글도 버려진다는 한 줄이 붙는다. 버튼은 Cancel(먼저, 포커스)과 Delete다. Esc와 Cancel은 아무것도 지우지 않는다.
5. 확정하면 main이 다시 판단한다. 대화가 그 사이 일을 시작했거나 이미 없으면 아무것도 지우지 않고 토스트로 이유를 알린다. 앱이 종료 중이면 아무것도 지우지 않는다. 통과하면 그 대화의 `index.json` 항목, `<id>.jsonl`, `drafts.json`의 queue·되돌아온 초안, main이 들고 있는 그 대화의 알림을 지우고 `conversation:listChanged`를 보낸다. 성공 토스트는 없다.
6. 지운 대화는 이후 모든 곳에서 사라진다. 제목 메뉴, Canvas conversations 행, 사이드바 slot(unseen ending 포함), 임시 conversation strip, Edit on Home이다. 다시 읽기(reload)와 재시작 뒤에도 돌아오지 않는다. 재시작 전에 보낸 OS 알림은 main이 더 이상 들고 있지 않아 닫을 수 없다. 그 알림을 클릭하면 찾지 못하는 대화의 기존 규칙대로 프로젝트 Overview가 열린다(PRODUCT §5 item 0 'Notifications').
7. 보이고 있던 대화를 지우면 그 화면(Overview의 main column 또는 캔버스 panel)은 새 대화 상태로 바뀐다. 캔버스의 현재 대화를 지우면 그 캔버스는 현재 대화가 없는 상태가 되고, 보관된(archived) 대화가 자동으로 현재 대화가 되지 않는다. 지운 대화가 이 기기에서 마지막으로 보인 프로젝트 대화(ui-state)였으면 그 기억도 지운다. 보이지 않던 대화를 지우면 보이는 화면은 그대로다. 지운 대화가 승격된 대화이면 Overview와 캔버스에 떠 있던 'moved to … · Open' 줄도 사라진다. 마지막 대화를 지우면 제목 메뉴에는 New conversation 행만 남는다(지금의 빈 목록 표시 그대로).
8. 보이던 대화를 지웠으면 확정 뒤 포커스는 그 화면의 composer로 간다. 보이지 않던 대화를 지웠거나 거절됐으면, 그리고 Cancel·Esc 뒤에는 제목 메뉴 trigger로 간다. 확정 뒤 성공 토스트는 없다.
9. 에이전트 쪽 파일은 그대로다. Claude Code·Codex 등의 세션·transcript 파일, Doan 연결 프로필(`<userData>/agent-auth/profiles/`) 안의 세션 파일, 셸 `doan check`가 쓴 `sessions.jsonl` 연결이다.
10. index 저장 뒤 로그 파일이나 초안을 지우기 전에 앱이 죽어 남은 `<id>.jsonl`(index에 없는 기록)과 `drafts.json` 항목은 다음 실행 때 복구(recover) 뒤에 지워진다. index를 읽을 수 없거나 index.json이 없으면 아무것도 지우지 않는다.

## 비목표

- Canvas conversations 행, 임시 conversation strip, 사이드바 slot, 알림에서 삭제하기. 삭제 위치는 두 제목 메뉴뿐이다. 그래서 캔버스가 프로젝트를 떠난 캔버스 대화(제목 메뉴에 나오지 않음)는 이번에 지울 수 없다.
- 여러 대화를 한 번에 지우기, 보관된 대화만 모두 지우기, 기간이 지난 대화 자동 정리(retention).
- Undo, 휴지통, 내보내기.
- 에이전트 세션 파일 삭제, `sessions.jsonl` 연결 정리. 그래서 셸 연결이 있는 캔버스의 새 대화 상태는 지운 뒤에도 그 터미널 세션 이어가기를 계속 제안한다(지금 규칙 그대로).
- 붙여넣은 이미지 사본(`<userData>/attachments/<id>/`) 정리(결정 7).
- 대화 이름 바꾸기 같은 다른 행 동작.

## 결정 (확인 완료)

5. **지운 대화의 composer 초안은 버린다.** 새 대화 초안은 그대로 둔다. 지금 Overview는 보이던 대화가 사라지면(`overviewAfterListChange`의 `gone`) 그 초안을 새 대화 상태로 옮기지만, 삭제에서는 옮기지 않는다. 옮기면 따로 써 둔 새 대화 초안을 덮어 잃는다.
6. **셸 `doan check` 세션 연결(`sessions.jsonl`)은 건드리지 않는다.** 결정 1의 "세션 연결"은 대화 index 항목의 `session` 필드다. `sessions.jsonl`은 CLI가 앱과 따로 append하는 파일이라 줄을 지우려면 다시 써야 하고 동시 쓰기와 부딪친다. 그 연결은 Doan 대화가 아니라 터미널 세션의 기록이다.
7. **붙여넣은 이미지 사본(`<userData>/attachments/<id>/`)은 남긴다.** 같은 사본을 다른 대화가 다시 붙였을 수 있어(`attachments:fromPaths`) 지우려면 모든 대화 기록을 읽어 참조를 세야 한다. 승격 task에서 BACKLOG에 적는다(ARCHITECTURE §7 'Model lists and attachments').
8. **행 동작은 캔버스 행처럼 "…" 메뉴 버튼이고, 그 메뉴에 Delete 한 항목이 있다.**
9. **확인 알림의 Delete 버튼은 Move to Trash와 같은 prominent(검은 채움)다.**

`/feature-review`에서 정한 것:

10. **행 메뉴 버튼은 클릭·키보드로만 열린다.** Radix `SubTrigger`의 hover 열기를 막는다. 행 오른쪽을 지나기만 해도 Delete가 튀어나오면 캔버스 행 버튼과 다르게 동작하기 때문이다. Esc는 Radix 기본대로 제목 메뉴까지 닫는다(macOS 메뉴에서도 흔하다).
11. **성공 토스트는 없다.** 프로젝트 Remove from Doan과 같다. 알림에서 직접 확인했고, 메뉴를 다시 열면 목록에서 빠진 것이 보인다.
12. **승격된 대화를 지우면 'moved to … · Open' 줄도 지운다.** 가리킬 대화가 없기 때문이다.
13. **초안이나 되돌아온 queue가 있을 때만 알림 본문에 그 글도 버려진다고 적는다.**
14. **index commit 뒤 정리 전에 앱이 죽어 남은 초안은 다음 시작 때 고아 기록과 함께 정리한다.**
15. **기록 쓰기에 실패한 대화(`failedPersistence`)는 재시작 전까지 `working`이라 지울 수 없다.** 드문 경우라 한계로 두고 BACKLOG에 적는다.
