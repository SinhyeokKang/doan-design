# terminal-agent-activity — spec

출처: 사용자 요청 "터미널에서 도안을 직접 작업 중일 때 캔버스에 에이전트 작업 중 마커를 띄울 수 있는지". 결정은 대화에서 사용자가 했다. 짝 요청 "터미널 대화 내역을 앱 캔버스 대화 목록에 쌓기"는 BACKLOG에만 남긴다.

## 사용자

- **사람**: 터미널 에이전트가 캔버스를 고치는 동안 앱에서 그 캔버스가 지금 수정 중인 것을 본다. 사이드바 행에는 스피너가 돌고, 캔버스를 열면 앱 대화와 같은 Agent indicator가 Stop 없이 보인다. 끝나면 사라진다.
- **에이전트**: 캔버스를 고치기 전에 `doan work start <캔버스 경로>`, 끝나면 `doan work done`을 부른다. 가이드(`doan skill`)에서 배운다. 앱이 꺼져 있어도 두 명령은 실패하지 않는다.

## 문제

- 터미널 에이전트는 앱과 연결돼 있지 않다. 앱이 아는 것은 수정이 끝난 뒤 shell `doan check`가 남긴 세션 연결 기록(ARCHITECTURE §4 'Shell check session associations')뿐이다.
- 파일 감시는 누가 바꿨는지 모른다(BACKLOG 'Showing where the agent is working on the canvas as it happens').
- ARCHITECTURE §7 'Shell activity'는 "no provider transcripts, no activity text, no polling or store"로 정해져 있어, transcript를 읽는 방식은 쓰지 않는다.

## 결정 (대화에서 확정)

1. 신호는 에이전트가 직접 부르는 `doan` 명령에서 받는다(ego lite의 TaskSpace 방식: 에이전트가 작업 단위를 열고 `finish()`로 닫는다. `ego-browser skill` v2.2.0 'Spaces, rounds, and pages', 'User control and completion'). 사용자 에이전트 설정 파일에 hook을 쓰지 않는다. 이 방식은 Doan 가이드를 따르는 모든 provider에 적용된다.
   - 에이전트가 시작 명령을 빠뜨리면 지금처럼 표시가 없을 뿐이다. 끝 명령을 빠뜨린 경우만 지금보다 나빠지므로 시간 제한으로 끈다(사용자 확인: 단점이 작다).
2. 마커는 사이드바 행 상태 자리의 스피너다(앱 대화의 '작업 중'과 같은 모양과 우선순위 규칙). 캔버스를 열면 PRODUCT §5 'Agent indicator'(glow, dot field, notice)를 재사용한다. 앱에서 터미널 에이전트를 멈출 수 없으므로 Stop은 없다.

## 완료 조건

- 에이전트가 `doan work start .doan/canvases/x.html`을 부르면, 앱이 켜져 있을 때 그 캔버스 행에 스피너가 뜬다. 그 캔버스를 열면 Agent indicator가 Stop 없이 보인다.
- `doan work done`을 부르면 그 세션의 스피너와 indicator가 사라진다.
- 끝 명령 없이 그 세션의 `doan` 호출과 표시된 캔버스 파일 변경이 모두 정해진 시간 동안 없으면 표시가 사라진다.
- 아직 없는 캔버스 경로로 시작하면, 그 파일이 생겨 목록에 나타난 순간부터 표시한다.
- 앱이 꺼져 있거나 socket에 닿지 않아도 두 명령은 성공 envelope와 exit 0으로 끝나고, 앱에 전달되지 않았음을 응답에 적는다.
- 앱 자신의 대화가 부른 `doan work`는 무시한다. 앱 대화의 '작업 중'은 지금처럼 앱 자신의 상태에서 나온다.
- 가이드에 두 명령과 부르는 때가 있다. `/agent-eval`로 에이전트가 캔버스를 고칠 때 시작과 끝을 부르는지 잰다.

## 비목표

- 터미널 대화 내역을 앱 대화 목록에 쌓기(BACKLOG).
- 앱에서 터미널 에이전트를 멈추거나 권한 요청에 답하기.
- 사용자 에이전트 설정에 hook 설치하기.
- 어느 프레임·요소를 고치는지 표시하기(BACKLOG의 실시간 위치 표시).
- 앱이 꺼져 있던 동안의 활동을 나중에 보여주기. 마커는 지금 상태만 다루고, 끝난 변경은 알림 dot이 맡는다.
