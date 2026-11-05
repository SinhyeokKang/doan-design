# canvas-handoff — spec

사람의 요청(원문): "캔버스 대화 세션에서 새로운 캔버스를 생성 시, 그 캔버스로 이동하고 새로운 세션에 작업한 내역을 핸드오프 하기. 세션이 새로운 세션을 열 수 있는 권한과 입력 권한이 필요할 듯. SendMessage 같은 개념."

캔버스 대화의 agent가 새 캔버스를 만들면, agent가 쓴 인계 메시지로 그 캔버스에 새 대화를 시작하고 화면을 그 캔버스로 옮긴다. agent는 이를 위해 Doan에 새 대화를 열고 첫 메시지를 넣어 달라고 요청하는 수단(SendMessage 같은 것)을 갖는다. 이 문서는 그 요청을 **핸드오프**, 요청한 대화를 **원래 대화**, 새로 시작하는 대화를 **이어받는 대화**, agent가 쓴 첫 메시지를 **인계 메시지**라고 부른다.

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 4 'Autonomous agent wake-up'("Only a human message starts agent work; Doan does not initiate it on its own")에 걸린다. 이어받는 대화의 첫 턴은 사람의 메시지가 아니라 agent의 요청으로 시작한다. 원래 이 항목은 Doan이 스스로 agent 작업을 일으키지 않게 하려고(사람이 시작하지 않은 작업과 사용량을 막으려고) 뺐다.
- **결정(사람)**: 이 경우에 한해 Out of scope 4를 좁게 푼다. PRODUCT는 지금 고치지 않고, 구현 뒤 Z 작업에서 Out of scope 4와 In scope 6 'Conversation'(필요하면 §4 Loop 4단계도)을 이 예외를 담도록 고친다(tasks Z1).
- **결정(사람)**: 핸드오프 권한은 원래 대화의 permission mode만 따른다. 핸드오프나 새 대화를 위한 별도 권한은 없다. 핸드오프 요청은 그 대화에서 agent가 하는 다른 행동과 같은 permission 경로를 지난다. 묻는 mode(Default 등)에서는 그 대화에 일반 permission request로 보이고, 허용하는 mode(Full access 등)에서는 묻지 않고 진행한다. 네 mode와 ACP provider가 각각 어떻게 되는지는 design 결정 1이다. 고르지 않은 것: 항상 자동, 핸드오프 전용 승인 카드.
- **결정(사람)**: 예외를 좁게 지키는 조건(세부는 design 결정 2·3·8·9): 사람의 메시지가 시작한 턴만 핸드오프할 수 있고, 핸드오프로 시작한 턴은 다시 핸드오프하지 못하며, 한 턴에 한 번, 그 턴이 만든 새 캔버스로만 간다.

## 사용자

- **사람(앱 사용자)**: 캔버스 대화에서 agent가 새 캔버스를 만들면, 그 작업이 새 캔버스의 대화에서 이어지는 것을 본다. 원래 대화에는 어디로 넘어갔는지 한 줄이 남고, 이어받는 대화 맨 위에는 무엇을 넘겨받았는지 보인다. 묻는 permission mode에서는 핸드오프를 일반 permission request로 허락하거나 거절한다.
- **agent(Doan 앱 대화 안)**: 새 캔버스를 만든 턴의 마지막에 `doan handoff <canvas path> --message …`를 한 번 실행해 인계 메시지를 남긴다. 이 명령은 Doan 앱 대화에서만 쓸 수 있고, 앱의 턴 prompt만 이를 가르친다(design §5).
- **터미널 agent(Doan 밖)**: 바뀌지 않는다. `doan handoff`를 실행해도 앱 대화가 아니라는 오류를 받는다.

## 문제(관찰한 사실)

1. 캔버스 대화가 새 캔버스를 만들어도 그 대화는 원래 캔버스에 묶인 채로 남는다. 새 캔버스에는 대화가 없고, 사람이 새 캔버스를 열어 New conversation을 누르고 지금까지의 맥락을 직접 다시 써야 한다(PRODUCT §5 item 2 'Conversation panel': 대화는 그 캔버스에만 보인다).
2. 프로젝트 대화에는 promotion이 있어 새 캔버스를 만든 턴이 끝나면 대화가 그 캔버스에 묶이지만(PRODUCT §5 item 1 'Project conversations'), 캔버스 대화에는 그런 길이 없다. promotion도 화면을 옮기지 않는다("A promotion archives the canvas's previous current conversation and moves no screen").
3. agent가 Doan에 새 대화를 열어 달라고 할 수단이 없다. app socket의 명령은 선택 읽기(v1), onboarding(v2), 작업 신호(v3), 이동(v4)뿐이고, `doan open`과 `doan://` 링크는 "only moves"이며 대화를 시작하지 않는다(PRODUCT §5 item 3 'Deep links', ARCHITECTURE §7 'Deep links' 'Security boundary').
4. Doan 연결 대화의 Codex는 sandbox 때문에 app socket에 바로 닿지 못한다. Doan 프로필에는 `~/.codex/rules/doan.rules`가 없고(ARCHITECTURE §7 'Agent authentication' 'Profiles'), sandbox 안의 `doan`은 `connect: operation not permitted`로 `app_not_running`을 받는다(USABILITY-EVAL U-001). Default에서 Codex가 escalation을 요청하는 경우는 실제 앱에서 확인된 적이 없다(BACKLOG 'Permission mode surfaces …: Codex Default with a model that asks to escalate').

## 완료 조건

1. **명령.** `doan handoff <canvas path> --message <text> [--json]`가 있다. `--message -`는 표준 입력에서 읽는다. 이 명령은 Doan 연결의 캔버스 대화에서 실행할 때만 앱에 닿고, 그 밖(터미널 agent, legacy external 대화, 프로젝트 대화, 앱이 꺼진 경우)에서는 정해진 오류 코드와 `nextSteps`로 실패한다(design §2·§3).
2. **permission.** 핸드오프 명령은 그 대화의 permission mode가 셸 명령에 적용하는 경로를 그대로 지난다. Doan은 별도 승인 카드를 띄우지 않는다. Plan에서는 Doan이 `plan_mode`로 거절한다(design 결정 1). PoC P2가 mode별 실제 동작을 기록한다.
3. **언제 시작하나.** 앱이 요청을 받으면 원래 대화 thread에 "이 턴이 끝나면 <canvas>로 넘긴다"는 줄이 보인다. 원래 턴이 done으로 끝나면 이어받는 대화를 시작하고, failed·stopped·interrupted로 끝나면 핸드오프를 취소하고 그 줄이 취소를 말한다(design 결정 4).
4. **대상.** 대상 캔버스는 원래 대화와 같은 root에서 정확히 하나로 나열되고, 원래 대화의 캔버스가 아니며, 원래 턴이 받아들여진 뒤 새로 생겼고, 현재 대화가 없어야 한다(design 결정 3). 조건이 시작 시점에 맞지 않으면 시작하지 않고 원래 대화에 이유가 남는다.
5. **이어받는 대화.** 원래 대화와 같은 provider, model, effort, permission mode로 대상 캔버스에 묶인 새 대화가 시작되고(design 결정 6), 그 캔버스의 현재 대화가 된다. 첫 메시지는 인계 메시지이고, thread 맨 위에 사람의 메시지와 구별되는 인계 카드로 보이며 원래 캔버스를 여는 Open이 있다(design 결정 10).
6. **원래 대화.** 원래 대화는 원래 캔버스의 현재 대화로 남고, thread에 "Handed off to <canvas>" 줄과 Open이 남는다(design 결정 7). 거절·취소도 같은 자리에 이유와 함께 남는다. 재시작 뒤에도 이 줄들은 남는다.
7. **화면 이동.** 이어받는 대화가 시작될 때 사람이 원래 캔버스를 보고 있으면 대상 캔버스로 옮기고 패널을 펼쳐 이어받는 대화를 보인다(Back은 원래 캔버스로 돌아간다). 그 밖의 화면이면 옮기지 않고 toast로 Open을 준다(design 결정 5).
8. **고리 막기.** 핸드오프로 시작한 턴에서 `doan handoff`는 거절된다. 그 대화에 사람이 메시지를 보낸 뒤의 턴은 다시 핸드오프할 수 있다. 한 턴에 핸드오프는 한 번만 받아들여진다(design 결정 8).
9. **가르침.** 앱의 턴 prompt가 핸드오프할 수 있는 턴에만 사용법을 싣는다. `doan skill` guide는 바뀌지 않는다(design 결정 11). 새 `/agent-eval` 시나리오가 Claude Code와 Codex로 핸드오프 요청을 확인하고, 턴 prompt가 바뀌어 R8c·R9를 대체할 시나리오가 생긴다(tasks E2).
10. **기존 규칙 유지.** `doan open`과 `doan://` 링크는 여전히 이동만 한다. 다른 경로(링크, 터미널 `doan work`, `doan open`)로는 대화가 시작되지 않는다.

## 비목표

- 사람이 핸드오프를 수동으로 하는 버튼, 기존 대화를 다른 캔버스로 옮기는 기능.
- 원래 대화의 transcript나 history를 이어받는 대화에 붙이는 것. 인계 메시지는 agent가 쓴 요약뿐이다.
- 다른 provider·model로 넘기는 선택, 여러 캔버스로 동시에 넘기기, 한 턴에 여러 번 넘기기.
- 프로젝트 대화의 핸드오프(promotion이 이미 대화를 새 캔버스에 묶는다), legacy external(터미널 세션) 대화의 핸드오프, 터미널 agent의 핸드오프.
- 핸드오프 전용 승인 카드나 설정. 핸드오프를 끄는 설정.
- 다른 worktree나 다른 프로젝트의 캔버스로 넘기기.
