# 프로젝트 대화의 handoff — spec

## 사용자

- **사람**: Home이나 Overview에서 프로젝트 대화로 일을 시킨다. 대화는 Overview에 남고, 에이전트가 만든 새 캔버스마다 그 캔버스의 대화가 따로 시작된다.
- **에이전트**(Doan 연결 대화 안의 Claude Code, Codex 등): 프로젝트 대화의 턴에서도 새로 만든 캔버스마다 `doan handoff <path> --message '<message>'`를 실행하라는 안내를 받는다. 캔버스 대화가 이미 받는 안내와 같다.

## 문제

- 지금 프로젝트 대화는 턴이 새 캔버스 하나를 만들거나, 편집 근거가 있는 기존 캔버스 하나를 고치면 그 캔버스에 묶인다(promotion, PRODUCT §5 item 1 'Project conversations'). 묶이면 대화가 Overview를 떠나 캔버스 대화가 된다.
- 판정 규칙이 복잡하다: 판정 시점(첫 폴더 새로고침, 약 5.6초, 최대 10초), 후보가 정확히 하나일 때만 승격, 같은 루트의 판정 안 된 다른 턴과 겹치면 양쪽 다 승격하지 않음, 편집 근거는 Claude Code와 Codex만 확인됨.
- 한 턴이 새 캔버스를 둘 이상 만들면 아무 데도 묶이지 않는다.
- 캔버스 대화는 이미 새 캔버스마다 handoff로 새 대화를 넘기는데(PRODUCT §5 item 2 'Handoff'), 프로젝트 대화는 `doan handoff`를 거부당한다(`not_canvas_conversation`, "Project conversations hand off through promotion instead").
- Overview 대화 목록(overview-conversation-list)이 들어오면 프로젝트 대화를 Overview에서 계속 볼 곳이 생긴다. 대화를 캔버스로 옮길 이유가 줄어든다.

## 완료 기준

- 프로젝트 대화는 어떤 턴 뒤에도 캔버스에 묶이지 않는다. promotion 판정, `conversation.bound` 쓰기, Overview의 moved 줄과 초안 이동, 승격으로 인한 seen 처리가 없다.
- Doan 연결 프로젝트 대화의 턴은 Plan이 아니면 `HANDOFF_GUIDANCE`를 받는다. `doan handoff`는 그 턴에서 새로 만든 캔버스마다 받아들여지고, 턴이 done으로 끝나면 캔버스 대화의 handoff와 같은 규칙으로 판정해 새 대화를 시작한다(provider, 모델, effort, Fast, 현재 권한 모드 복사, Last used 변경 없음).
- 새 대화의 첫 카드는 "Handed off from Overview"이고, Open은 그 프로젝트의 Overview에서 원본 대화를 연다. 원본 대화가 지워졌으면 Open이 Overview의 대화 선택 규칙을 따른다.
- 원본 스레드의 캔버스 카드는 캔버스 대화와 같이 "Hands off when this turn ends", 이어서 "Handed off" 또는 "Didn’t hand off." 사유를 보여준다.
- handoff가 새 대화 하나를 시작하고, 사람이 원본 대화를 보여주는 Overview에 있고, 페이지 잠금·대화상자·first run이 없고, 원본 composer에 입력 중이 아니면, 앱이 새 캔버스를 열고 패널을 새 대화로 펼친다. 아니면 토스트 "Overview handed off to <target file>"가 Open을 준다. 둘 이상이면 화면이 움직이지 않고, Overview 밖에서는 토스트 "Overview handed off to <n> canvases"가 원본 대화로 가는 Open을 준다.
- Home에서 보낸 대화가 새 캔버스를 그렸을 때 앱이 그 캔버스를 바로 여는 동작은 없어지고, 위 handoff 규칙이 대신한다.
- 기존 캔버스만 고친 턴, handoff를 실행하지 않은 턴은 대화가 Overview에 그대로 남고 아무 대화도 시작되지 않는다. 안내를 받은 턴이 handoff 없이 새 캔버스를 남기면 캔버스 대화와 같이 missed 줄이 나온다.
- 프로젝트 대화가 새 캔버스를 그리는 동안 그 캔버스 패널이 그 대화를 미리 보여주는 Drawing 미리보기가 없다. 캔버스 → 캔버스 handoff와 같이, 대상 캔버스 패널은 handoff로 대화가 생길 때까지 지금 규칙대로 새 대화 상태를 보여준다.
- 예전에 promotion으로 캔버스에 묶인 대화는 그대로 캔버스 대화다. 기존 기록의 "Moved here from <project> Overview" 같은 표시는 지금처럼 읽힌다.
- `doan handoff`의 안내 문구에서 "canvas conversation"만 된다는 설명이 사라진다.
- PRODUCT(§3 Out of scope 4 예외, §5 item 1 'Project conversations', item 2 'Handoff'·'Drawing and promotion', item 3 'Promotion'·'Canvas cards'), ARCHITECTURE(§7 'Project conversations and promotion'·'Handoff'), 관련 DESIGN 문서가 새 규칙으로 바뀐다.

## 하지 않는 것

- 기존 캔버스로의 handoff. handoff는 지금처럼 새 캔버스에만 된다.
- 예전에 승격된 대화를 Overview로 되돌리는 일.
- 캔버스 대화의 handoff 규칙 변경(대상 범위, 판정, 카드 문구).
- Overview 대화 목록 자체. overview-conversation-list feature가 맡고, 이 feature는 그 feature가 develop에 머지된 뒤 구현한다.
- 앱 소켓 v5 형식의 버전 변경.
