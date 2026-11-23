# 프로젝트 대화의 handoff — spec

## 사용자

- **사람**: Home이나 Overview에서 프로젝트 대화로 일을 시킨다. 대화는 Overview에 남고, 에이전트가 만든 새 캔버스마다 그 캔버스의 대화가 따로 시작된다. 같은 프로젝트에서 프로젝트 대화 여러 개를 동시에 돌릴 수 있다.
- **에이전트**(Doan 연결 대화 안의 Claude Code, Codex, Cursor, Antigravity, GitHub Copilot): 프로젝트 대화의 턴에서도 새로 만든 캔버스마다 `doan handoff <path> --message '<message>'`를 실행하라는 안내를 받는다. 캔버스 대화가 이미 받는 안내와 같다.

## 문제

- 지금 프로젝트 대화는 턴이 새 캔버스 하나를 만들거나, 편집 근거가 있는 기존 캔버스 하나를 고치면 그 캔버스에 묶인다(promotion, PRODUCT §5 item 1 'Project conversations'). 묶이면 대화가 Overview를 떠나 캔버스 대화가 된다.
- 판정 규칙이 복잡하다: 판정 시점(첫 폴더 새로고침, 약 5.6초, 최대 10초), 후보가 정확히 하나일 때만 승격, 같은 루트의 판정 안 된 다른 턴과 겹치면 양쪽 다 승격하지 않음, 편집 근거는 Claude Code와 Codex만 확인됨.
- 한 턴이 새 캔버스를 둘 이상 만들면 아무 데도 묶이지 않는다.
- 한 루트에서 프로젝트 대화는 하나만 일할 수 있다(`project_busy`). 이 제한은 promotion이 새 캔버스를 엉뚱한 대화에 묶지 않게 하려고 둔 것이다. 캔버스 대화는 제한 없이 동시에 돈다.
- 캔버스 대화는 이미 새 캔버스마다 handoff로 새 대화를 넘기는데(PRODUCT §5 item 2 'Handoff'), 프로젝트 대화는 `doan handoff`를 거부당한다(`not_canvas_conversation`).
- Cursor, Antigravity, GitHub Copilot이 편집 경로를 보내는지는 실제 앱에서 확인되지 않았다. 그래서 이 provider의 턴에는 캔버스 카드와 missed 표시가 나오지 않는다(PRODUCT §5 item 3 'Canvas cards').

배경: Overview 대화 목록(overview-conversation-list)이 들어오면 프로젝트 대화를 Overview에서 계속 볼 곳이 생긴다.

## 완료 기준

- **promotion 없음**: 프로젝트 대화는 어떤 턴 뒤에도 캔버스에 묶이지 않는다. promotion 판정, `conversation.bound` 쓰기, Overview의 moved 줄과 초안 이동, 승격으로 인한 seen 처리가 없다. 기존 캔버스만 고친 턴이나 handoff를 실행하지 않은 턴은 대화가 Overview에 그대로 남고 아무 대화도 시작되지 않는다.
- **동시 실행**: 한 루트에서 프로젝트 대화 여러 개가 동시에 시작하고 보낼 수 있다. `project_busy` 거부와 Home·Overview의 "Another conversation is still running in <project>." 줄이 없다. 큐는 캔버스 대화와 같은 규칙으로 나간다.
- **handoff**: Doan 연결 프로젝트 대화의 턴은 Plan이 아니면 `HANDOFF_GUIDANCE`를 받는다. `doan handoff`는 그 턴에서 새로 만든 캔버스마다 받아들여지고, 턴이 done으로 끝나면 캔버스 대화의 handoff와 같은 규칙으로 판정해 새 대화를 시작한다(provider, 모델, effort, Fast, 현재 권한 모드 복사, Last used 변경 없음). 실패·중지·사용량 한도로 끝난 턴, 종료, 로그아웃은 남은 요청을 취소한다.
- **안내 문구**: `HANDOFF_GUIDANCE`의 "Do not hand off if the user asked not to hand off or to stay on this canvas"가 "…or to stay on this canvas or in this conversation"으로 넓어진다(캔버스 대화에도 같은 문구).
- **새 대화의 첫 카드**: "Handed off from Overview"이고, Open은 그 루트의 Overview에서 원본 대화를 연다. 원본 대화가 지워졌으면 Open이 없고 머리가 "Handed off from Overview · Conversation deleted"다.
- **원본 스레드의 캔버스 카드**: 캔버스 대화와 같이 "Hands off when this turn ends", 이어서 "Handed off"(Open) 또는 "Didn’t hand off." 사유를 보여준다. 안내를 받은 턴이 handoff 없이 새 캔버스를 남기면 그 캔버스 카드가 "Didn’t hand off. The agent didn’t ask to."를 보여준다.
- **화면 이동**:
  - handoff가 새 대화 하나를 시작하고, 그 루트의 Overview가 원본 대화를 보여주고(문제·읽기 오버레이가 덮지 않음), 페이지 잠금·대화상자·first run이 없고, 사람이 그 사이 다른 것을 고르지 않았고 입력 중이 아니면, 앱이 새 캔버스를 열고 패널을 새 대화로 펼친다(Back은 원본 대화를 보여주는 Overview로 돌아간다).
  - 아니면 토스트 "<project> Overview handed off to <target file>"이 Open을 준다.
  - 둘 이상이면 화면이 움직이지 않는다. 그 루트의 Overview가 원본 대화를 보여주면 아무것도 띄우지 않고(카드마다 Open이 있다), 아니면 토스트 "<project> Overview handed off to <n> canvases"가 원본 대화로 가는 Open을 준다.
  - '고름'은 Overview 목록·헤더 메뉴에서 대화를 고르거나, New, 다른 대화에서 보내기다. '입력 중'은 Overview composer에 초안이 있거나 IME 조합 중이거나, 키보드 포커스가 Conversations 목록이나 열린 헤더 메뉴에 있는 경우다.
- **대상 캔버스 패널**: 사람이 handoff 대상 캔버스를 미리 열어 두었고, 패널이 '그 캔버스에 대화가 없어서' 자동으로 새 대화 상태이고(사람이 고른 New가 아니고) 그 초안이 비어 있으면, handoff로 생긴 대화가 패널을 차지한다. 캔버스 → 캔버스 handoff에도 같은 규칙이 적용된다.
- **Drawing 미리보기 없음**: 프로젝트 대화가 새 캔버스를 그리는 동안 그 캔버스 패널이 그 대화를 미리 보여주지 않는다. 캔버스 → 캔버스 handoff와 같다.
- **Home**: Home에서 보낸 대화가 새 캔버스를 그렸을 때 앱이 그 캔버스를 바로 여는 동작은 없어지고, 위 handoff 규칙이 대신한다. 오버레이 아래에서만 나오는 conversation strip의 끝난 상태는 "Done"과 Dismiss만 보여준다.
- **Move to Trash**: 프로젝트 대화가 그리는 중인 캔버스라는 이유로 막지 않는다. 캔버스 handoff와 같다.
- **프로젝트 제거**: Remove from Doan이 그 루트의 대기 중 handoff를 취소한다.
- **예전 기록**: 예전에 promotion으로 캔버스에 묶인 대화는 그대로 캔버스 대화다. 기존 기록의 "Moved here from <project> Overview" 같은 표시는 지금처럼 읽힌다.
- **CLI**: `doan handoff`의 안내 문구에서 "canvas conversation"만 된다는 설명이 사라진다.
- **ACP provider**: Cursor, Antigravity, GitHub Copilot을 실제 계정(격리된 복사본)으로 돌려, 새 캔버스를 만들 때 편집 경로가 오는지와 `doan handoff`를 실행하는지 확인한다. 되는 provider는 캔버스 카드와 missed 표시가 나오는 것으로 PRODUCT에 올리고, 안 되는 provider는 관찰 결과를 BACKLOG 'Not verified in the real app'에 남긴다.
- **문서**: PRODUCT, ARCHITECTURE, DESIGN, BACKLOG가 새 규칙으로 바뀐다(tasks 문서 승격 목록).

## 하지 않는 것

- 기존 캔버스로의 handoff. handoff는 지금처럼 새 캔버스에만 된다.
- 예전에 승격된 대화를 Overview로 되돌리는 일.
- 캔버스 대화 handoff의 판정·카드 문구 변경(대상 패널 규칙과 안내 문구 확대만 함께 바뀐다).
- Overview 대화 목록 자체. overview-conversation-list feature가 맡고, 이 feature는 그 feature가 develop에 머지된 뒤 구현한다.
- 앱 소켓 v5 형식의 버전 변경.
