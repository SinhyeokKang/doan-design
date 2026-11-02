# terminal-agent-activity — spec

출처: 사용자 요청 "터미널에서 도안을 직접 작업 중일 때 캔버스에 에이전트 작업 중 마커를 띄울 수 있는지". 결정은 대화와 `/feature-review`에서 사용자가 했다. 짝 요청 "터미널 대화 내역을 앱 캔버스 대화 목록에 쌓기"는 BACKLOG에만 남긴다.

## 사용자

- **사람**: 터미널 에이전트가 캔버스를 고치는 동안 앱에서 그 캔버스가 지금 수정 중인 것을 본다. 사이드바 행에는 스피너가 돌고, 캔버스를 열면 앱 대화와 같은 Agent indicator가 Stop 없이 보인다. 끝나면 사라진다. 그 터미널 세션이 작업 중인 동안 캔버스 대화 패널은 그 세션을 이어 가는 선택지를 막고 이유를 보인다. 작업이 끝나면 에이전트의 마지막 답에 있는 `doan://` 링크를 눌러 고친 캔버스를 앱에서 바로 연다.
- **에이전트**: 캔버스를 고치기 전에 `doan work start <캔버스 경로>`, 끝나면 고친 캔버스 경로와 함께 `doan work done`을 부르고, 결과의 링크를 마지막 답에 보인다. 가이드(`doan skill`)에서 배운다. 앱이 꺼져 있어도 두 명령은 실패하지 않는다. Claude Code와 Codex는 Agent setup이 쓴 허용 규칙 덕분에 두 명령을 권한 확인 없이 실행한다.

## 문제

- 터미널 에이전트는 앱과 연결돼 있지 않다. 앱이 아는 것은 수정이 끝난 뒤 shell `doan check`가 남긴 세션 연결 기록(ARCHITECTURE §4 'Shell check session associations')뿐이다.
- 파일 감시는 누가 바꿨는지 모른다(BACKLOG 'Showing where the agent is working on the canvas as it happens').
- ARCHITECTURE §7 'Shell activity'는 "no provider transcripts, no activity text, no polling or store"로 정해져 있어, transcript를 읽는 방식은 쓰지 않는다.

## 결정 (대화와 `/feature-review`에서 확정)

1. 신호는 에이전트가 직접 부르는 `doan` 명령에서 받는다(ego lite의 TaskSpace 방식: 에이전트가 작업 단위를 열고 `finish()`로 닫는다. `ego-browser skill` v2.2.0 'Spaces, rounds, and pages', 'User control and completion'). 사용자 에이전트 설정 파일에 hook을 쓰지 않는다. 이 방식은 Doan 가이드를 따르는 모든 provider에 적용된다.
   - 에이전트가 시작 명령을 빠뜨리면 지금처럼 표시가 없을 뿐이다. 끝 명령을 빠뜨린 경우만 지금보다 나빠지므로 시간 제한으로 끈다(사용자 확인: 단점이 작다).
2. 마커는 사이드바 행 상태 자리의 스피너다(앱 대화의 '작업 중'과 같은 모양과 우선순위 규칙). 캔버스를 열면 PRODUCT §5 'Agent indicator'(glow, dot field, notice)를 재사용한다. 앱에서 터미널 에이전트를 멈출 수 없으므로 Stop은 없다.
3. Agent setup(PRODUCT §5 item 0)은 Claude Code 사용자 설정의 `permissions.allow`에 `doan work start`·`doan work done` 허용 규칙을 쓴다. 기존 Codex rule과 같은 목적이다. 기존 내용은 보존해 합치고, 여러 번 실행해도 결과가 같다. 파일을 읽을 수 없거나 깨져 있으면 쓰지 않고 About의 agent setup 결과에 보인다. Cursor, Antigravity, Copilot은 사용자의 허용 설정에 따라 실행 허락을 물을 수 있다. 이 비용은 받아들인다.
4. 터미널 세션이 `doan work` 중인 동안 캔버스 대화 패널의 새 대화 상태는 그 세션의 'Terminal session' 이어 가기 선택지(PRODUCT §5 item 2 'Terminal session')를 비활성으로 두고 이유 한 줄을 보인다. 새 대화는 계속 고를 수 있다. `done`이나 만료 뒤에는 다시 고를 수 있다. 같은 세션인지는 세션 식별(`provider:id`)로 판정한다.
5. 앱 자신의 대화는 대화 환경에 `DOAN_APP_CONVERSATION=1`을 둔다. 이 표시가 있으면 `doan work`는 아무것도 보내지 않는다. 앱 대화의 '작업 중'은 지금처럼 앱 자신의 상태에서 나온다.
6. 끝난 터미널 에이전트는 마지막 답에 캔버스 deep link를 보인다. 패키지된 앱이 `doan://` URL scheme을 등록한다(개발 실행은 등록하지 않는다). 형식은 `doan://open?root=<URL 인코딩한 절대 root>&canvas=<repo 상대 캔버스 경로>`이고 `&frame=<frame id>`는 선택이다. 앱 밖에는 프로젝트 맥락이 없으므로 root가 필요하다. 앱 안의 답 칩(`agent-reply-chips` feature)은 자기 형식 `doan:<canvas-id>/frame/<id>`을 그대로 쓴다. 앱 안 링크는 이미 프로젝트를 알기 때문이다(지휘자 판단). 두 형식은 섞지 않는다.
   - 링크를 열면 이동만 한다. 필요하면 앱을 켜고 그 캔버스(와 프레임)를 보인다. 쓰기, 보내기, 대화 시작, 그 밖의 상태 변경은 하지 않는다. 어느 웹 페이지든 이 scheme을 부를 수 있으므로 이 규칙은 보안 경계다.

## 완료 조건

- 에이전트가 `doan work start .doan/canvases/x.html`을 부르면, 앱이 켜져 있고 그 프로젝트가 앱에 등록돼 있을 때 그 캔버스 행에 스피너가 뜬다. 그 캔버스를 열면 Agent indicator가 Stop 없이 보인다.
- `doan work done`을 부르면 그 세션의 스피너와 indicator가 사라진다.
- 끝 명령 없이 그 세션의 `doan work start` 호출과 집합 안 캔버스 파일 변경이 모두 정해진 시간 동안 없으면 표시가 사라진다.
- 아직 없는 캔버스 경로로 시작하면, 그 파일이 생겨 목록에 나타난 순간부터 표시한다.
- 앱이 꺼져 있거나 socket에 닿지 않거나 앱이 요청을 받지 않아도 두 명령은 성공 envelope `{delivered: false}`와 exit 0으로 끝난다(경우 목록은 design.md '오류 대응'). 명령은 앱을 띄우지 않는다. 인자 오류(`usage_error`)와 repo를 못 찾는 경우(`repo_not_found`)만 다른 명령처럼 exit 2다.
- `DOAN_APP_CONVERSATION=1`이 있는 환경(앱 자신의 대화)에서 부른 `doan work`는 아무것도 보내지 않고 `{delivered: false}`, exit 0으로 끝난다.
- 터미널 세션이 작업 중인 동안 그 세션의 'Terminal session' 이어 가기 선택지는 비활성이고 이유를 보인다. `done`이나 만료 뒤에는 다시 고를 수 있다.
- Agent setup이 Claude Code 설정에 두 명령의 허용 규칙을 쓴다. 기존 내용을 지우지 않고, 다시 실행해도 같은 규칙을 두 번 쓰지 않는다. 읽을 수 없거나 깨진 설정 파일은 건드리지 않고 About에 보인다.
- `doan work done <캔버스 경로>…`의 결과에 그 캔버스들의 링크가 있다(`{delivered, links}`). 앱이 꺼져 있어도(`delivered:false`) 링크를 돌려준다.
- 패키지된 앱에서 링크를 열면, 앱이 꺼져 있을 때는 macOS가 앱을 켜고 시작 복원이 끝난 뒤 그 캔버스를 연다. 켜져 있을 때는 창을 보이고 그 캔버스를 연다. `frame`이 있으면 Quick Open의 프레임 이동처럼 선택을 바꾸지 않고 그 프레임으로 간다.
- 등록되지 않은 root, 목록에 없는 캔버스, 형식이 틀린 링크는 앱을 보이고 짧은 안내만 띄운다. 다른 일은 하지 않는다.
- 가이드에 두 명령과 부르는 때가 있다. 응답을 끝내기 전에, 사람에게 질문하려고 멈출 때도 `doan work done`을 부르고, 결과의 링크를 마지막 답에 보인다. 오래 걸리는 작업 중에는 `doan work start`를 다시 부른다.
- `/agent-eval` 새 시나리오에서 Claude Code와 Codex가 모두 통과한다(편집 전 시작, 마지막에 끝, 고친 캔버스와 같은 시작 경로).

## 알려진 한계

- 세션 식별 환경 변수가 없는 provider(Cursor, Antigravity, Copilot)는 root마다 하나의 익명 세션을 함께 쓴다. 그중 한 세션의 `done`이 그 root의 익명 집합을 모두 비운다. Claude와 Codex 식별 변수가 함께 있으면 익명으로 본다.
- 앱을 다시 켜면 표시가 비어 있다. 다음 `doan work start`까지 아무것도 보이지 않는다.
- macOS Terminal, iTerm2, Orca가 `doan://` 링크를 눌러지는 링크로 그리는지 확인하지 않았다(T12에서 기록한다). 그리지 않으면 사람이 복사해 붙이거나 셸에서 `open "doan://…"`으로 연다.
- 개발 실행은 scheme을 등록하지 않으므로 링크가 열리지 않는다. 패키지된 앱만 연다.

## 비목표

- 터미널 대화 내역을 앱 대화 목록에 쌓기(BACKLOG).
- 앱에서 터미널 에이전트를 멈추거나 권한 요청에 답하기.
- 사용자 에이전트 설정에 hook 설치하기.
- 어느 프레임·요소를 고치는지 표시하기(BACKLOG의 실시간 위치 표시).
- 앱이 꺼져 있던 동안의 활동을 나중에 보여주기. 마커는 지금 상태만 다루고, 끝난 변경은 알림 dot이 맡는다.
- 프로젝트 재진입 때 worktree 고르기(PRODUCT §5 item 1 'Back and Forward' 항목의 "identifiable agent activity")에 이 신호를 쓰기. 신호는 표시에만 쓰고 메모리에만 둔다.
- 터미널 에이전트가 작업하는 동안 캔버스 대화 패널에서 보내기를 막기. 사람이 보내는 것은 그대로 된다(PRODUCT §3 Out of scope 7은 바뀌지 않는다).
- 링크로 요소를 가리키거나, 링크로 대화·보내기·쓰기 같은 동작을 시작하기.
- `sessions.jsonl`에 기록하기. `doan work`는 세션 연결 기록을 남기지 않으므로 PRODUCT §3 'Association recording'("Only a shell `doan check` … records")은 그대로다.
