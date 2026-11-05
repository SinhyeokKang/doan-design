# work-update — spec

사람의 요청(원문): "cli update는 feature 시켜. work start와 done 사이에 도안 캔버스 gui 갱신용 도구야. 사용자에게 동적인 경험을 주기위한"

읽은 뜻: 에이전트가 `doan work start`와 `doan work done` 사이에 `doan work update`를 실행해, 작업하는 동안 Doan 앱의 캔버스 화면이 바뀌게 한다. 사람은 끝난 결과만이 아니라 진행 과정을 본다. 화면에서 바뀌는 것은 셋이다(design 결정 1, 사람이 정함).

- **한 줄**: 에이전트가 지금 하는 일을 쓴 한 줄(note)이 작업 notice의 글이 된다. 작업 notice는 지금 보드 위에 뜨는 "Agent is working" 카드(`app/src/renderer/CanvasAgent.tsx`의 `.doan-agent`)다. 새 notice를 만들지 않는다.
- **작업 프레임 표시**: 에이전트가 지금 고치는 프레임을 보드 위에 표시한다.
- **따라가기**: 사람이 한동안 화면을 움직이지 않았으면 앱이 그 프레임으로 화면을 옮긴다. 사람이 화면을 움직이면 그 턴이 끝날 때까지 따라가지 않는다.

터미널 에이전트와 Doan 앱 대화(캔버스 대화와 project 대화) 모두에 적용한다(design 결정 4).

## 범위 확인(scope gate)

사람의 답(결정 1 따라가기, 결정 4 앱 대화)을 반영해 다시 확인했다.

- **통과.** PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다.
  - Out of scope 4 'Autonomous agent wake-up': `update`는 `start`·`done`처럼 에이전트를 깨우지 않는다. 앱 대화에서 오는 `update`도 턴을 시작하거나 메시지를 보내지 않는다. 따라가기는 지금 열린 캔버스 안에서 화면만 옮긴다. 다른 캔버스나 worktree로 가지 않는다. 다만 지금 문장 "Terminal work signals (`doan work`) only show work"는 화면을 옮기는 일과 앱 대화의 신호를 담지 못하므로 고친다(아래 'PRODUCT에서 바뀌는 규칙').
  - Out of scope 7 'Simultaneous human/agent file editing': 프레임 표시와 따라가기는 renderer가 보드 위에 그리고 옮기는 것이다. 앱은 캔버스 파일에 아무것도 쓰지 않는다.
  - Out of scope 1 'Drawing', 2 'Enforcing a canvas format': 사람이 그리는 것이 없고, 새 캔버스 속성을 요구하지 않는다. 프레임은 이미 있는 `data-doan-frame` id로 가리킨다(ARCHITECTURE §1).
  - Out of scope 5 'Server': 신호는 이 기기의 앱 소켓으로만 간다.
  - PRODUCT에는 "앱이 스스로 화면을 옮기지 않는다"는 규칙이 없다. 앱이 사람 대신 화면을 바꾸는 선례는 project 대화 턴이 새 캔버스를 만들었을 때 그 캔버스를 여는 규칙이다. 이 규칙도 사람이 그동안 다른 캔버스를 열지 않았을 때만 동작한다(PRODUCT §5 item 1). 따라가기는 `doan open`("only when the person asks", PRODUCT §5 item 10)과 다르다. 열린 캔버스 안에서만 옮기고, 사람이 쉬고 있을 때만 옮기며, 사람이 움직이면 그 작업 턴 동안 멈춘다.
- **PRODUCT에서 바뀌는 규칙**(마지막 task에서 고친다):
  - §3 Out of scope 4: "Terminal work signals (`doan work`) only show work"를 "작업을 보이고, 사람이 쉬고 있을 때 같은 캔버스 안에서만 화면을 옮긴다. 에이전트를 깨우지 않는다"는 뜻으로 고치고, 앱 대화의 `update`도 포함한다. 괄호의 "a `start` may add another worktree"에 `update`를 더한다.
  - §3 'Resume and permissions'의 "Default applies the user's own permission and sandbox settings": Doan 연결 프로필에는 Doan이 넣은 `doan` 허용(design 결정 12)도 적용된다.
  - §5 item 0 'Agent setup'의 "adds three rules …": 네 규칙(`doan work update` 추가).
  - §5 item 1: 사이드바 spinner의 신호("neither a new `start` … for 5 minutes")와 미등록 worktree 자동 등록("A `doan work start` from an unregistered worktree …")에 `update`를 더한다.
  - §5 item 2 'Agent indicator': 지금은 "a project conversation … never shows or stops it"이다. 결정 4로 project 대화가 `update`로 이름을 댄 캔버스에는 표시가 나온다.
  - §5 item 2 'Terminal work'와 'Agent indicator'의 문구, 작업 프레임 표시, 따라가기.
  - §5 item 10 CLI(`doan work update`), "send nothing from Doan's own conversations"의 예외.
- BACKLOG 'Undecided'의 두 항목을 이 feature가 가져간다: "`doan work update` between `doan work start` and `doan work done`"과 "Showing where on the canvas the agent is working as it happens"의 대부분(터미널, 앱 대화, project 대화의 표시와 따라가기). 남는 것은 바뀐 프레임 표시와 에이전트 신호 없이 파일만 바뀐 경우다(비목표).

## 지금 있는 것(관찰한 사실)

- 열린 캔버스는 그 파일이 바뀔 때마다 다시 불러온다. 에이전트의 턴 중간이라도 마찬가지다(PRODUCT §4 Loop 2; `app/src/renderer/canvasView.ts`는 그 캔버스 row의 `rev`나 `servedRev`가 바뀌면 `reload`를 낸다). 에이전트가 파일을 여러 번 나눠 쓰면 그만큼 화면이 바뀐다.
- 터미널 에이전트가 `doan work start <canvas>`를 보내면 그 캔버스의 보드에 glow, 점 무늬, "Agent is working" 작업 notice가 나타나고(Stop 없음) 사이드바 canvas row에 spinner가 돈다. `done`이 오거나, 5분 동안 신호도 변경도 없으면 사라진다(PRODUCT §5 items 1–2, `app/src/main/workState.ts` `WORK_EXPIRY_MS`).
- 앱이 받는 터미널 작업 정보는 `WorkItem {session, provider, root, path}`뿐이다. 무엇을 하는지, 어느 프레임인지는 없다.
- 앱 대화의 child 환경에는 `DOAN_APP_CONVERSATION=1`과 이 앱의 `DOAN_RUNTIME`이 들어가고(`app/src/main/conversation/environment.ts`, `app/src/main/agentAuth/environment.ts` `providerEnv`), 그 안에서 `doan work`는 아무것도 보내지 않는다(ARCHITECTURE §4 'Suppression'). 대화 id는 환경에 없다.
- 앱 대화는 대화마다 runner를 따로 연다(`ConversationService.openRunner(id, …)`, `service.ts`). Codex는 대화마다 `app-server` 하나가 턴을 넘어 살고(`runners.ts`의 Codex runner), Claude는 턴마다 SDK를 새로 띄운다. 그래서 대화 id를 그 대화의 환경에 넣을 수 있다.
- 캔버스 대화가 일하면 그 캔버스 보드에 glow와 "Agent is working"(Stop 있음)이 나온다. project 대화가 캔버스를 고칠 때는 보드에 아무것도 나오지 않는다. 어느 캔버스를 고쳤는지는 턴이 끝난 뒤 판정한다(PRODUCT §5 item 1 'Project conversations', ARCHITECTURE §7 'Project conversations and promotion').
- Doan 연결의 Claude 프로필에는 skill stub만 있고 허용 규칙이 없다(`agentAuth/providers.ts` `settings: SKILL_STUB`). Codex rule(`agentSetup/plan.ts`)은 사람의 `~/.codex`에만 쓰인다. 그래서 Default 모드의 앱 대화에서 `doan` 명령은 권한을 물을 수 있다.

## 사용자

- **사람(앱 사용자)**: 터미널이나 Doan 대화에서 에이전트에게 캔버스 작업을 시키고 그 캔버스를 본다. 작업 notice에서 에이전트가 지금 하는 일을 한 줄로 읽고, 보드에서 지금 고치는 프레임을 본다. 손을 놓고 보고 있으면 화면이 그 프레임으로 따라간다. 직접 화면을 움직이면 따라가기가 멈춘다.
- **에이전트(터미널 세션과 앱 대화)**: 프레임 하나를 고치기 시작할 때마다 `doan work update`를 한 번 실행한다. 실패해도 작업은 막히지 않는다(`start`·`done`과 같은 best effort).

## 문제

새 PRODUCT §1 문제가 아니다. PRODUCT §3 In scope 1 'Show'(live reload, frame jump)와 §5 item 2 'Agent indicator'를 넓힌다.

1. 에이전트가 일하는 동안 보드는 "Agent is working"만 보인다. 사람은 에이전트가 캔버스의 어디를, 무엇을 하는지 모른다. 결과는 파일이 바뀔 때에야 보이고, 어느 부분이 바뀌었는지는 사람이 찾아야 한다. 큰 캔버스에서는 바뀐 프레임이 화면 밖에 있다.
2. 앱에는 에이전트가 고치는 프레임을 알 근거가 없다. BACKLOG 'Undecided'가 적듯 "which frame or element it edits has no evidence for a live source yet"이다.
3. project 대화가 캔버스를 그리는 동안 그 캔버스 보드에는 아무 표시가 없다. 어느 캔버스인지는 턴이 끝나야 정해지기 때문이다.

## 완료 조건

용어: **작업 내용**은 `update`가 보내는 프레임 id와 한 줄 글(note)이다. **작업 프레임 표시**는 보드 위에서 그 프레임을 감싸는 표시이고, 프레임 이동 때 쓰는 jump highlight(`.mark.jump-highlight`)와 같은 모양이다. **작업 notice**는 지금 보드 위에 뜨는 "Agent is working" 카드(`CanvasAgent.tsx`)다. **작업 턴**은 터미널 세션에서는 첫 `start`/`update`부터 `done`이나 만료까지, 앱 대화에서는 그 대화의 한 턴이다.

1. **명령.** `doan work update <canvas path> [--frame <id>] [--note <text>] --json`이 있다. 경로 규칙은 `start`와 같다(`workTarget`). 앱이 꺼져 있거나 닿지 않으면 `ok: true`, exit 0, `delivered: false`다. 인자 오류(경로, 빈 `--frame`이나 200자를 넘는 `--frame`, 120자를 넘는 `--note`, 줄바꿈이나 제어 문자)만 `usage_error`(exit 2)다. 결과는 `{delivered}`다. `cli/internal/cli/work_test.go`가 고정한다.
2. **start를 겸한다(터미널).** 그 경로에 `start`가 아직 없어도 `update`는 그 세션의 작업에 경로를 더하고, 미등록 worktree를 `start`처럼 자동 등록하며, 5분 만료를 새로 센다.
3. **앱 대화에서도 보낸다.** 앱 대화 안에서 `update`는 그 대화의 id를 실어 보낸다. `start`·`done`은 지금처럼 아무것도 보내지 않는다. 앱은 그 id가 같은 root에서 지금 턴을 돌리는 대화일 때만 받는다. 대화 id가 환경에 없거나 맞지 않으면 아무것도 바뀌지 않는다.
4. **앱 상태.** 앱은 작업 내용을 터미널 세션은 (세션, root, path)마다, 앱 대화는 대화마다 마지막 하나만 기억한다. 새 `update`는 그것을 바꾸고, `--frame`이나 `--note`를 빼면 그 부분은 비운다. 터미널 쪽은 `done`과 만료가, 앱 대화 쪽은 그 턴의 끝(완료, 실패, 중단, archive, 삭제, 앱 종료)이 지운다. 메모리에만 있고 재실행 뒤에는 없다. 대화 이벤트 파일에는 쓰지 않는다.
5. **작업 notice의 글.** 지금의 작업 notice(`CanvasAgent.tsx`) 하나의 글만 바뀐다. 새 notice나 두 번째 줄은 없다. note가 있으면 note를 그대로, 없고 프레임이 있으면 그 프레임 제목을 넣은 문구, 둘 다 없으면 지금처럼 "Agent is working"이다. 프레임이 있을 때의 문구는 "Working on <frame title>"이다(design 결정 18). 프레임 제목은 `data-doan-title`, 없으면 프레임 id다. 길면 말줄임표로 줄이고, 줄었을 때 전체가 tooltip에 나온다. note는 텍스트로만 그리고 toast나 알림에는 쓰지 않는다. 글이 바뀌면 공통 앞부분은 남기고, 지금 글의 다른 끝부분이 한 글자씩 지워진 뒤 새 글의 끝부분이 한 글자씩 쳐진다(지우기 20 ms, 치기 35 ms/글자, 합계 1,000 ms 이하로 줄임; 속도는 조정 가능, tasks E2). 지우고 치기는 이 캔버스가 보이는 동안 새 `update`로 글이 바뀔 때만 한다. 작업 턴 도중에 캔버스를 열거나 돌아오면, 그리고 layout이 와서 프레임 id가 제목으로 바뀌는 것처럼 `update` 없이 글이 바뀌면 글을 바로 놓는다. 그동안 카드는 이전 글과 새 글 중 짧은 쪽 너비 아래로 줄지 않는다. 중간에 새 `update`가 오면 지금 보이는 글에서 가장 새 글로 다시 시작한다. 보이는 마지막 글자 바로 오른쪽에 장식용 텍스트 커서(`aria-hidden`)가 늘 있다(카드가 더 넓으면 그 뒤가 비고, 잘리면 말줄임표 바로 뒤). 지우고 치는 동안에는 켜진 채로 있고, 글이 멈추면 1초 주기로 깜빡이며, reduced motion에서는 깜빡이지 않는다. 스크린 리더에는 최종 글만 바로 전해지고(note와 프레임이 함께 있으면 "<note> — <frame title>"), `prefers-reduced-motion`에서는 글이 바로 바뀐다. 캔버스 대화가 답을 기다리면 "Agent needs your answer"로 바로 바뀌고(지우고 치지 않음) 커서는 숨는다.
6. **어느 작업 내용을 보일지.** 이 root의 이 캔버스에서: 이 캔버스의 현재 대화가 일하거나 답을 기다리면 그 대화의 작업 내용(없으면 지금 문구), 아니면 이 캔버스를 이름으로 댄 project 대화와 터미널 세션 중(다른 캔버스에 묶인 캔버스 대화가 이 캔버스를 댄 경우도 같다: design 결정 13) 마지막으로 `update`(터미널은 `start` 포함)를 보낸 쪽이다. 같은 경로를 가진 다른 worktree의 것은 세지 않는다. 대화가 답을 기다리는 동안 그 작업 프레임 표시는 남되 움직이지 않는다(reduced motion 모양).
7. **project 대화의 표시.** project 대화가 `update`로 이름을 댄 캔버스가 이 root에 목록으로 있고 열려 있으면, 그 보드에 터미널과 같은 glow, 점 무늬, 작업 notice(Stop 없음, design 결정 15)와 작업 프레임 표시가 나온다. promotion 판정, Move to Trash의 사용 불가 조건, 새 캔버스 열기 규칙은 바뀌지 않는다.
8. **작업 프레임 표시.** 고른 작업 내용에 프레임이 있고 그 id의 프레임이 지금 문서에 있으면, 보드가 그 프레임에 jump highlight를 작업 턴 동안 남긴다(1.2초 뒤 사라지지 않는다). 작업 중에는 gradient 선이 천천히 돌고 glow가 숨 쉰다. 다른 프레임으로 가면 표시가 그 프레임으로 옮겨 간다. 옮겨 가는 220 ms 움직임은 작업 프레임 id가 바뀔 때만 있고, 팬·확대·reload·창 크기 변경에서는 표시가 프레임에 바로 붙는다. `prefers-reduced-motion`에서는 움직이지 않고 바로 놓인다(gradient 한 바퀴 4.8초, glow 2.4초, 옮겨 갈 때 220 ms; design 결정 17). 캔버스가 다시 불러와져도 같은 id로 다시 붙는다. id가 없으면 표시는 없고 문구만 바뀐다. 표시는 선택, hover, pick, 팬, 확대를 막지 않고 선택을 바꾸지 않는다.
9. **따라가기.** 이 작업 턴에 아직 따라가지 않은 작업 프레임이 지금 문서에 있을 때(`update` 뒤 reload로 새 프레임이 생긴 경우 포함), 사람이 그 캔버스에서 마지막으로 움직인 지 `FOLLOW_IDLE_MS`(5초, 조정 가능: tasks E2)가 지났고, 이 작업 턴에 따라가기가 멈추지 않았으면, 앱이 그 프레임이 보이도록 화면을 한 번 옮긴다. 프레임이 이미 화면의 안전 영역(작업 notice와 도구 줄을 뺀 영역) 안에 다 보이면 옮기지 않는다. 화면보다 큰 프레임은 윗변이 안전 영역 안에 있으면 보이는 것으로 본다. 지금 확대율로 안전 영역에 들어가면 확대율은 그대로 두고 가운데로 옮기고, 들어가지 않으면 frame drawer의 이동과 같은 규칙을 따른다. 선택은 바꾸지 않는다. 지금의 프레임 jump처럼 화면은 바로 옮긴다. 따로 1.2초 jump highlight를 더하지 않는다(작업 프레임 표시가 같은 모양이다). 작업 턴 도중에 캔버스를 열거나 돌아오면 바로 따라가지 않는다. 그때의 작업 프레임은 이미 따라간 것으로 보고, 다음 프레임부터 따라간다. 같은 캔버스에서 고른 작업 출처(터미널 세션, 대화)가 바뀐 `update`는 표시와 글만 바꾸고 화면은 옮기지 않는다.
10. **따라가기 멈춤.** 사람이 이 작업 턴 동안 그 캔버스에서 화면을 직접 움직이면 그 작업 턴이 끝날 때까지 따라가지 않는다. 그 캔버스에 있는 모든 작업 턴이 멈춘다. 사람의 이동은 앱이 옮긴 화면을 뺀 모든 화면 변경이다. 휠·트랙패드 팬, 핀치·⌘휠 확대, Hand·Space 드래그, 확대 버튼·메뉴·단축키, frame drawer, Quick Open 프레임 이동, 칩 Locate, `doan open --frame`·링크의 프레임 이동이 여기에 든다. 앱이 옮긴 화면은 따라가기 이동, reload가 보존한 화면, 캔버스를 열 때 복원한 화면, 열 때의 맞추기다. 보드 위의 pointer 이동, 선택 변경, 패널 composer 입력은 따라가기를 멈추지 않지만 쉬는 시간을 새로 센다. 작업 턴 중에 선택을 바꾸면 멈춘다. pick·capture·드래그 중이거나, 캔버스 페이지가 보이지 않거나, 그 페이지의 메뉴나 dialog가 열려 있으면 따라가지 않는다. 다른 캔버스로 화면을 바꾸지 않는다.
11. **guide.** `doan skill` guide가 프레임 하나를 고치기 시작할 때마다 `update`를 실행하라고 말한다(ARCHITECTURE §1 규칙 I). guide는 `skillOutputBudget`(21,600 B) 안에 있고 `skill_test.go`가 통과한다.
12. **허용 규칙.** Agent setup이 Claude Code의 `permissions.allow`에 `Bash(doan work update *)`를 더하고, 이미 설치된 곳에는 다음 실행에서 빠진 규칙만 넣는다. `plan.test.ts`가 고정한다. Doan 연결 프로필에도 터미널 Agent setup과 같은 범위의 허용을 넣는다: Claude 프로필 `settings.json` `permissions.allow`에 네 규칙(`doan open` 포함), Codex 프로필에는 모든 `doan` 명령을 sandbox 밖에서 돌리는 rule(design 결정 12). 그래서 Default 모드의 Claude·Codex 앱 대화에서 `update`가 프레임마다 권한을 묻지 않는다. 이것은 R1에서 확인한다(P1은 허용이 없을 때 묻는다는 것만 확인했다).
13. **agent-eval.** 프레임 여러 개를 고치는 새 시나리오 W5에서 Claude Code와 Codex가 각 프레임 편집 전에 그 프레임 id로 `update`를 보낸다. 통과 기준: W5의 자동 검사가 에이전트마다 `--repeat 3` 중 2회 이상 통과한다. 결과를 `docs/USABILITY-EVAL.md`에 적는다.
14. **실제 앱.** 격리된 실제 앱에서 (a) 빌드한 CLI로 보낸 터미널 신호와 (b) 캔버스 대화·project 대화 한 턴씩으로 작업 notice의 글, 작업 프레임 표시, 따라가기, 사람이 팬한 뒤의 멈춤이 spec대로 바뀌고 턴이 끝나면 사라진다(`/runtime-test`, 스크린샷 기록).

## 비목표

- **바뀐 프레임 표시.** 작업이 끝난 뒤 어느 프레임이 바뀌었는지 남기는 표시는 하지 않는다(BACKLOG에 남는다).
- **신호 없는 변경.** 에이전트가 `update`를 보내지 않으면 프레임 표시와 따라가기는 없다. 파일 감시만으로 바뀐 프레임을 추측하지 않는다.
- **요소 단위 표시.** `--frame`만 받는다. 요소(`data-doan-id`) 단위는 하지 않는다.
- **진행률, 단계 목록, 기록.** 작업 내용은 마지막 하나만 있다.
- **다른 캔버스로 이동.** 따라가기는 열린 캔버스 안에서만 움직인다. 에이전트가 다른 캔버스를 고쳐도 그 캔버스를 열지 않는다(project 대화의 새 캔버스 열기는 지금 규칙 그대로).
- **따라가기 멈춤 표시, 켜고 끄기 설정, 다시 따라가기 버튼.** 없다. 따라가기가 멈춰도 화면에는 아무 표시가 없다(design 결정 14).
- **ACP provider의 권한 질문 줄이기.** Cursor·Antigravity·Copilot의 Doan 연결 프로필에는 허용을 넣지 않는다(design 결정 12). 이 provider들은 Default 모드에서 `update`마다 권한을 물을 수 있다. PRODUCT §5 item 0의 터미널 허용 규칙이 Claude Code와 Codex만 다루는 것과 같다.
- **사이드바·Overview 변경.** spinner의 이름과 Overview는 그대로다.
- **promotion 규칙 변경.** `update`는 project 대화의 promotion 증거가 아니다.
