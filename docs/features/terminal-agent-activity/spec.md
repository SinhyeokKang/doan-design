# terminal-agent-activity — spec

출처: 사용자 요청 "터미널에서 도안을 직접 작업 중일 때 캔버스에 에이전트 작업 중 마커를 띄울 수 있는지". 결정은 대화에서 사용자가 했다. 짝 요청 "터미널 대화 내역을 앱 캔버스 대화 목록에 쌓기"는 BACKLOG에만 남긴다.

## 사용자

- **사람**: 터미널의 Claude Code가 캔버스를 고치는 동안, 앱에서 그 캔버스가 지금 수정 중인 것을 본다. 사이드바 행에는 스피너가 돌고, 캔버스를 열면 앱 대화와 같은 Agent indicator가 보인다. 끝나면 사라진다.
- **에이전트**: 하는 일이 없다. hook은 Agent setup이 설치하고, 에이전트는 평소처럼 작업한다. 가이드에 새 규칙이 늘지 않는다.

## 문제

- 터미널 에이전트는 앱과 연결돼 있지 않다. 앱이 아는 것은 수정이 끝난 뒤 shell `doan check`가 남긴 세션 연결 기록(ARCHITECTURE §4 'Shell check session associations')뿐이다.
- 파일 감시는 누가 바꿨는지 모른다(BACKLOG 'Showing where the agent is working on the canvas as it happens').
- ARCHITECTURE §7 'Shell activity'는 "no provider transcripts, no activity text, no polling or store"로 정해져 있어, transcript를 읽는 방식은 쓰지 않는다.

## 결정 (대화에서 확정)

1. 신호는 에이전트 hook에서 받는다. Agent setup이 Claude Code 사용자 설정에 hook을 넣고, hook은 `doan`을 불러 앱에 알린다. Codex는 hook 지원을 PoC로 먼저 확인하고, 없으면 이번 범위에서 뺀다.
2. 마커는 사이드바 행 상태 자리의 스피너다(앱 대화의 '작업 중'과 같은 모양과 우선순위 규칙). 캔버스를 열면 PRODUCT §5 'Agent indicator'(glow, dot field, notice)를 재사용한다. 앱에서 터미널 에이전트를 멈출 수 없으므로 Stop은 없다.

## 완료 조건

- Agent setup을 마친 기기에서 터미널 Claude Code가 `.doan/canvases/` 또는 `.doan/ds/`의 캔버스 파일을 편집 도구로 고치기 시작하면, 앱이 켜져 있을 때 그 캔버스 행에 스피너가 뜬다. 그 캔버스를 열면 Agent indicator가 Stop 없이 보인다.
- 그 세션의 턴이 끝나면(Stop hook) 스피너와 indicator가 사라진다. hook이 오지 않고 끊긴 세션은 마지막 신호 뒤 일정 시간이 지나면 사라진다.
- 캔버스를 건드리지 않는 터미널 작업(같은 repo의 코드 작업)은 아무것도 띄우지 않는다.
- 앱 자신의 대화가 낸 hook 신호는 무시한다. 같은 캔버스에 앱 대화가 작업 중이면 앱 대화 표시가 그대로 보인다.
- 앱이 꺼져 있거나 socket에 닿지 않으면 hook은 아무 출력 없이 곧바로 끝나고 에이전트 작업을 막거나 늦추지 않는다.
- 사용자 설정 파일에 이미 있는 내용은 보존한다. 설정 파일을 읽을 수 없으면 hook 설치를 건너뛰고 About의 Agent setup 결과에 그 항목을 보인다.

## 비목표

- 터미널 대화 내역을 앱 대화 목록에 쌓기(BACKLOG).
- 앱에서 터미널 에이전트를 멈추거나 권한 요청에 답하기.
- Cursor, Antigravity, Copilot의 터미널 세션. Codex는 PoC 결과에 따른다.
- 어느 프레임·요소를 고치는지 표시하기(BACKLOG의 실시간 위치 표시).
- 앱이 꺼져 있던 동안의 활동을 나중에 보여주기(마커는 지금 상태만 다룬다. 끝난 변경은 알림 dot이 맡는다).
