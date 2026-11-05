# work-update — design

## 결정

사람이 정한 것(1–7, 12–20, 모두 2026-11-05)과 그 답에서 따라 나온 설계 결정(8–11)이다. 초안에 대한 사람의 확정은 §9에 있다.

1. **화면에서 바뀌는 것(사람).** 한 줄(note) + 작업 프레임 표시 + 따라가기, 셋 다 한다.
2. **note를 그대로 보인다(사람).** 에이전트가 쓴 글을 120자까지 텍스트로만 보인다. toast·알림에는 쓰지 않는다.
3. **따라가기는 사람이 멈춰 있을 때만(사람).** 사람이 한동안 팬·확대하지 않았을 때만 작업 프레임으로 따라간다. 사람이 화면을 움직이면 그 작업 턴이 끝날 때까지 따라가지 않는다. 기다리는 시간은 `FOLLOW_IDLE_MS` = 5초다(사람이 초안에서 확인). E2에서 조정할 수 있다.
4. **앱 대화에도 적용(사람).** 캔버스 대화와 project 대화에서도 `update`가 보이고 따라간다.
5. **보내는 때(사람).** 프레임 하나를 고치기 시작할 때마다 `update`를 보낸다.
6. **`update`는 `start`를 겸한다(사람).** 경로를 더하고, 미등록 worktree를 자동 등록하고, 만료를 새로 센다(터미널).
7. **소켓 v3에 넣는다(사람).** `update` action을 app-socket v3에 더하고 `v`는 3에 둔다. "새 명령 = 새 소켓 버전" 관례의 예외이며, 승격 때 ARCHITECTURE §4에 그 이유를 적는다(tasks Z1).
8. **앱 대화를 묶는 방법: 환경 변수 `DOAN_CONVERSATION_ID`.** 앱이 대화마다 runner를 열 때 그 대화의 Doan 대화 id를 환경에 넣는다. CLI는 `DOAN_APP_CONVERSATION=1`이고 이 값이 있을 때만 `update` 요청에 `conversation`을 싣는다. 대안(앱이 대화 이벤트의 편집 도구 입력에서 프레임을 추측)은 BACKLOG의 PoC 아이디어이고, 사람이 고른 "에이전트가 직접 알림"과 다른 길이라 쓰지 않는다.
9. **억제 규칙은 좁힌다.** 앱 대화 안에서 `start`·`done`은 지금처럼 아무것도 보내지 않는다(앱은 그 대화의 진행을 이미 안다). `update`만 대화 id를 실어 보낸다. 앱 대화의 `update`는 터미널 작업(`WorkItem`)이 되지 않는다. 사이드바의 "working in a terminal" spinner, 터미널 세션 이어 가기 막기, sibling notice, Move to Trash 막기가 앱 대화를 터미널로 잘못 세지 않게 하기 위해서다.
10. **앱 대화의 작업 내용은 턴에 묶인다.** 대화 id → {root, path, frame, note, touched, turnId}를 main 메모리에 둔다. 그 턴의 끝 이벤트(`turn.done`, `turn.failed`, `interrupted`), archive, 삭제, 앱 종료에서 지운다. 대화 이벤트(`conversations/`)에는 쓰지 않는다. 그래서 대화 이벤트 형식은 바뀌지 않고, reload 뒤에도 같은 턴이면 main에서 다시 읽는다.
11. **project 대화의 표시는 promotion과 무관하다.** project 대화가 `update`로 이름을 댄 캔버스에는 턴 동안 터미널과 같은 표시(glow, 점 무늬, Stop 없는 작업 notice, 작업 프레임 표시, 따라가기)가 나온다. promotion 판정(편집 activity + 파일 변경, 턴 뒤), Move to Trash 막기, 새 캔버스 열기 규칙은 그대로다.
12. **Doan 연결 프로필에도 터미널과 같은 범위의 허용을 넣는다(사람, N1·Q5).** 앱 대화가 `update`를 보낼 때 프레임마다 권한을 묻지 않게, Doan 연결 Claude 프로필의 `settings.json` `permissions.allow`에 `CLAUDE_ALLOW_RULES`(터미널 Agent setup과 같은 네 규칙)를, Doan 연결 Codex 프로필에 `codexRuleText()`와 같은 rule을 넣는다. Claude Code도 그 프로필의 `settings.json`을 쓰므로, 지금의 `writeSetting`(`agentAuth/storage.ts`: 내용이 다르면 파일 전체를 바꿈)으로 쓰면 안 되고 Agent setup의 `mergeClaudeAllow`처럼 빠진 규칙만 넣는다. Codex rule 파일은 Doan만 쓰므로 `writeSetting`으로 된다.
13. **캔버스 대화가 다른 캔버스를 댄 `update`도 그 캔버스에 보인다(사람, N2).** project 대화와 같은 규칙이다(§1 규칙 6).
14. **따라가기가 멈춘 것은 보이지 않는다(사람, N3).** 멈춤 표시, 다시 따라가기 버튼, 설정이 없다.
15. **project 대화와 다른 캔버스를 댄 캔버스 대화의 작업 notice에는 Stop이 없다(사람, N4).** 터미널 변형과 같다. 보드의 Stop은 그 캔버스의 현재 대화만 멈춘다는 지금 규칙을 지킨다.
16. **작업 프레임 표시는 jump highlight다(사람).** 새 모양을 만들지 않는다. 프레임 이동 때 쓰는 `.mark.jump-highlight`(3 px `--affordance-accent` → `--indigo-600` 135° gradient 선, 1 px `--surface-panel` 바깥 고리, accent 45 % glow; DESIGN.md 'Canvas area and right panel' 'Overlay marks')를 작업 턴 동안 작업 프레임에 남긴다. 1.2초 뒤 사라지는 동작만 빠진다. 따라가기 이동도 같은 모양이고, 따로 1.2초 jump highlight를 더하지 않는다.
17. **표시는 살아 있게 움직인다(사람).** gradient 한 바퀴 4.8초 linear, glow는 accent 45 % ↔ 25 %를 2.4초(`--ease-state`)로 확정했다(Q1·Q2). (a) `update`가 다른 프레임으로 가면 표시가 새 프레임으로 옮겨 간다(사라졌다 다시 나타나지 않는다). (b) 작업 중에는 gradient 선이 천천히 돌고 glow가 조용히 숨 쉰다. (c) `prefers-reduced-motion`에서는 둘 다 멈추고 표시는 바로 새 프레임에 놓인다. 다른 프레임으로는 220 ms(`--time-settle`, `--ease-settle`) 미끄러져 옮겨 간다(사람, Q3).
18. **프레임 이름은 프레임 제목이다(사람, Q4).** note 없이 프레임만 있으면 작업 notice의 글은 "Working on <frame title>"이다. 제목은 그 프레임의 `data-doan-title`, 없으면 프레임 id다(지금 layout의 `frames[].title`).
19. **글이 바뀔 때 지우고 다시 친다(사람).** 작업 notice의 글이 바뀌면(새 note 또는 새 프레임) 지금 글의 다른 끝부분이 한 글자씩 지워지고 새 글의 다른 끝부분이 한 글자씩 쳐진다. 속도는 조정할 수 있는 값이다(tasks U1·E2).
    - 공통 앞부분은 남긴다(사람, Q7). "Working on Plans" → "Working on Checkout"이면 "Plans"만 지우고 "Checkout"만 친다. 공통 앞부분도 grapheme 단위로 잰다.
    - 커서(사람, Q8을 바꿈): 작업 notice가 보이는 동안 텍스트 커서가 늘 있다. 커서는 카드의 오른쪽 끝에 붙지 않고, 보이는 마지막 글자 바로 오른쪽에 글과 한 줄로 놓인다: 지울 때는 왼쪽으로, 칠 때는 오른쪽으로 움직인다. 너비 규칙(결정 20)으로 카드가 글보다 넓으면 커서는 글 바로 뒤에 있고 그 뒤가 빈다. 최대 너비에서 글이 말줄임표로 잘리면 커서는 말줄임표 바로 뒤에 있다. 지우고 치는 동안에는 깜빡이지 않고, 글이 멈춰 있으면 깜빡인다(1초 주기, 서서히가 아니라 켜짐·꺼짐 두 단계; 주기는 조정 가능). 장식이므로 `aria-hidden`이고 status 글에 들지 않는다. 너비 규칙(결정 20)에는 들지 않고 자기 고정 너비만 차지한다. 색은 작업 notice 글자색(`--text-on-prominent`), 높이는 `--type-body-sm-size`, 너비는 `--space-1`의 절반, 글과의 간격은 2px(`--space-1`의 절반, 사람이 4px에서 줄임)이다. `prefers-reduced-motion`에서는 깜빡이지 않고 보이기만 한다.
    - 글자 단위는 grapheme(`Intl.Segmenter`)이다. 한글 음절과 이모지가 반쪽으로 보이지 않게 하기 위해서다.
    - 속도(사람): 지우기 20 ms/글자, 치기 35 ms/글자. 둘을 더한 시간이 1,000 ms를 넘으면 두 간격을 같은 비율로 줄여 1,000 ms 안에 끝낸다. 보통의 변경이 800–1,000 ms쯤 걸리고, 짧은 변경은 더 빨리 끝난다. 상한은 긴 note가 다음 `update`보다 늦게 끝나지 않게 하기 위해서다.
    - 애니메이션 중에 새 `update`가 오면 남은 단계를 버리고, 지금 보이는 글에서 가장 새 글로 같은 규칙(공통 앞부분 유지, 지우고 치기)을 다시 시작한다.
    - 접근성: 보이는 글자 줄은 `aria-hidden`이고, 같은 카드 안의 `role="status"` 요소(`sr-only`)에는 최종 글이 바로 들어간다. note와 프레임이 함께 있으면 status 글은 "<note> — <frame title>"이다(보이는 글은 note만). 스크린 리더는 중간 글을 읽지 않는다. tooltip은 보이는 최종 글이다.
    - `prefers-reduced-motion`에서는 글이 바로 바뀐다.
    - forced colours에서 커서는 `CanvasText`로 칠한다(`forced-color-adjust: none`). `currentColor` 배경은 forced colours에서 사라지기 때문이다.
    - 지우고 치기는 이 캔버스가 보이는 동안 새 `update`(또는 작업이 시작돼 카드가 생기거나 앱 대화가 이겨 고른 작업 내용이 바뀜)로 글이 바뀔 때만 한다. 작업 턴 도중에 캔버스를 열거나 돌아오면 글을 바로 놓는다. 프레임 제목은 그 `update`의 frame에 대해 마지막으로 찾은 값을 다음 `update`까지 기억한다. 그래서 layout이 늦게 와 id가 제목으로 바뀌거나 reload 뒤 프레임이 사라져도 글을 다시 치지 않는다. 처음 layout 전에는 id를 보이고, layout이 오면 바로 제목으로 바꾼다.
    - 답 기다림: 캔버스 대화가 답을 기다리면 "Agent needs your answer"로 바로 바꾸고(행동을 요구하는 글이라 늦추지 않는다) 커서를 숨긴다.
20. **지우고 치는 동안 카드가 줄어들지 않는다(사람).** 글 칸의 너비 = max(보이는 글의 너비, min(이전 글의 너비, 새 글의 너비))이고, 카드의 최대 너비(420px 열)는 그대로다. 새 글이 짧으면 지우는 동안 카드는 새 글 너비까지만 줄고, 새 글이 길면 지우는 동안 이전 너비를 지키다가 새 글이 그보다 길어질 때 넓어진다. 구현은 `update` 하나에 한 번, 숨긴 측정 노드로 이전 글과 새 글의 너비를 재고, 애니메이션 동안 글과 커서를 담은 줄에 `min-width: min(이전, 새)`(커서와 간격 포함, 카드 열 너비를 넘지 않음)를 준다. 보이는 글이 그보다 넓으면 그 너비가 이긴다. 글 노드 자체를 넓히지 않으므로 커서는 글 바로 뒤에 남는다. 단계마다 다시 재지 않는다. 끝나면 `min-width`를 지운다. reduced motion에서는 너비가 한 번에 바뀐다.

## 1. 영향 받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 | `schema/app-socket.v3.schema.json`: `action`에 `update`, `update`에만 `frame`·`note`·`conversation`. `conversation`은 `session`·`provider`와 함께 올 수 없다. `path`는 `start`·`update`에서 필수. fixture는 `schema/fixtures/app-socket-v3/request/{valid,invalid}/`(§3). |
| CLI(Go) | `cli/internal/cli/work.go`: `work update`. `run.go`: `Flags`에 `Note`, `--note` 등록, `case "work"`의 `update`에 `frame`·`note` 허용, `DOAN_CONVERSATION_ID`를 읽어 `ctx`에 둔다(`AppConversation`처럼). 인자 검사·요청 조립은 `work_rules.go`의 순수 함수. guide `cli/internal/cli/skill.md` 규칙 I와 명령 목록. |
| 앱 main: 환경 | `app/src/main/conversation/service.ts` `openRunner`가 runner 환경에 `DOAN_CONVERSATION_ID: <id>`를 더한다(두 경로 모두: Doan 연결과 legacy external). `app/src/main/agentAuth/environment.ts`의 `RESERVED`에 `DOAN_CONVERSATION_ID`를 더해 provider extra가 덮지 못하게 한다. |
| 앱 main: 상태 | `app/src/main/workState.ts`: 터미널 `update`(경로 추가, 작업 내용, `touched`). 새 순수 모듈(예: `conversationWork.ts`): 앱 대화의 작업 내용. `runtime.ts` `answerLine` v3: `update`는 `conversation`이 있으면 대화 쪽으로, 없으면 `start`처럼(경로 패턴, 자동 등록). `index.ts`: `work:changed` 발행 조건에 작업 내용, 새 채널 `conversation-work:get`/`conversation-work:changed`(이름은 구현에서 정함), `senderAllowed.ts` 허용 목록, preload. `ConversationService`가 턴 끝·archive·삭제·종료를 알려 대화 작업 내용을 지운다. |
| 앱 renderer | `agentIndicator.ts`: 고르기(`spec` 완료 조건 6), 작업 notice의 글, project 대화 변형. `CanvasAgent.tsx`: 지금의 작업 notice(`.doan-agent`)의 글과 tooltip, project 대화의 glow와 Stop 없는 작업 notice. 새 notice 컴포넌트는 없다. `CanvasController.ts`: 작업 프레임 표시 층, 따라가기 이동(사람의 이동과 구별), 사람의 마지막 이동 시각. |
| Agent setup | `agentSetup/plan.ts` `CLAUDE_ALLOW_RULES`에 `Bash(doan work update *)`, `notice.ts` 안내 문구. Doan 연결 프로필의 허용(결정 12): `agentAuth/providers.ts`의 Claude·Codex 항목, Claude 프로필 `settings.json`은 빠진 규칙만 넣는 병합(새 함수 또는 `mergeClaudeAllow` 재사용), Codex 프로필 rule은 `writeSetting`. 프로필을 만들 때와 앱을 실행할 때마다 확인한다. |
| 스킬 | 디스크 stub(`app/src/main/onboarding/SKILL.md`)은 그대로다. guide만 바뀐다. 앱 대화 지시(`conversation/prompt.ts`)는 바꾸지 않는다: guide 규칙 I가 앱 대화에도 그대로 맞는다. |
| eval | 새 시나리오 `eval/scenarios/W5/`. `eval/lib/socket.ts`의 fake app은 같은 v3 schema를 읽는다. 앱 대화 쪽은 eval runner가 다루지 않으므로 `/runtime-test`로 본다. |

### 동작 규칙

1. **명령 모양.** `doan work update <canvas path> [--frame <id>] [--note <text>] --json` → `{delivered}`. `--frame`, `--note`는 생략할 수 있고, 둘 다 없으면 작업 내용을 비우고 만료만 새로 센다.
2. **인자 경계.** `--frame`은 v4 `frame`과 같은 경계(비어 있지 않음, 제어 문자 없음, 200자 이하; ARCHITECTURE §11). `--note`는 한 줄, 제어 문자 없음, 120자(코드 포인트) 이하. 앞뒤 공백은 지우고, 지운 뒤 빈 note는 note 없음이다. 넘으면 `usage_error`다(자르지 않는다: 에이전트가 고쳐 다시 보낼 수 있고, 잘린 글이 뜻을 바꾸지 않게).
3. **요청 고르기(CLI).** `DOAN_APP_CONVERSATION=1`이면: `start`·`done`은 보내지 않는다. `update`는 `DOAN_CONVERSATION_ID`가 유효한 불투명 id(빈 값 아님, `-`로 시작하지 않음, NUL 없음: `session`과 같은 계약)일 때만 `{action: "update", root, path, frame?, note?, conversation}`을 보내고, 아니면 보내지 않는다. 그 밖에는 지금처럼 `session`/`provider`를 싣는다.
4. **터미널 상태.** `update`는 세션에 (root, path)가 없으면 더하고, 그 항목의 작업 내용을 `{frame, note}`로 바꾸며(빠진 쪽은 비움), 세션의 `started`와 항목의 `touched`를 지금으로 한다. `start`는 작업 내용을 건드리지 않고 `touched`만 새로 한다. 상한(`MAX_WORK_PATHS`)에 걸린 `update`는 세션만 새로 센다.
5. **대화 상태.** main은 `conversation` id가 같은 root에서 지금 턴을 돌리는(받아들여졌고 끝나지 않은) 대화일 때만 받는다. 받으면 그 대화의 작업 내용 하나를 바꾸고 받은 때의 `turnId`를 적는다. 맞지 않는 id, 끝난 턴, 다른 root는 `ok: true`로 답하고 버린다(에이전트가 할 수 있는 일이 없으므로 새 오류 코드를 만들지 않는다). 대화 쪽 `update`는 자동 등록하지 않는다(앱 대화의 root는 이미 등록돼 있다).
   - **한계(사람이 받아들임):** 요청에는 대화 id만 있고 턴 id는 없다. Codex runner는 환경을 한 번만 정하므로 턴마다 다른 값을 넘길 수 없다. 그래서 턴이 끝난 뒤부터 다음 턴이 받아들여지기 전까지 온 `update`는 버리지만, 다음 턴이 받아들여진 뒤 도착한 이전 턴의 `update`는 구별하지 못하고 새 턴의 것으로 받는다. 이 일은 사람이 Stop한 직후 새 턴을 보내고, 그 사이 CLI 요청(ms 단위)이 아직 날아가는 중일 때만 생긴다. 결과는 표시 하나가 다음 `update`나 턴 끝까지 남는 것이다.
6. **고르기(renderer).** 열린 캔버스(root + path)에 대해: 이 캔버스의 현재 대화가 일하거나 기다리면 그 대화의 작업 내용 중 path가 이 캔버스인 것. 아니면 이 root에서 path가 이 캔버스인 대화 작업 내용(project 대화와, 다른 캔버스에 묶인 캔버스 대화: 결정 13)과 터미널 항목 중 `touched`가 가장 늦은 것.
7. **작업 notice의 글.** 지금의 작업 notice(`.doan-agent-text`) 글을 바꾼다. note → "Working on <frame title>"(결정 18) → "Agent is working". 글이 바뀔 때는 결정 19의 지우고 치기를 따른다. 캔버스 대화의 Stop, "Agent needs your answer"와 Open은 그대로다. 문구는 텍스트 노드로만 넣는다. 답 기다림에서는 커서를 숨기고, 작업 프레임 표시는 남기되 움직임(gradient, glow)을 멈춘다(reduced motion 모양). 지금 작업 notice의 점도 기다릴 때 멈춘다(`agentIndicator.ts` `steady`).
8. **작업 프레임 표시(결정 16·17).** 고른 작업 내용의 frame이 지금 layout에 있으면 그 사각형에 jump highlight 모양의 표시를 둔다(`.mark.jump-highlight`에 작업용 수식어를 더한 class, 1.2초 타이머와 fade 없음). 문서를 다시 불러오는 동안(`CanvasState.reloading`)은 지우고, 새 layout에서 같은 id로 다시 찾는다. reload가 실패하면(`status === "failed"`) 표시를 붙이지 않는다. `pointer-events: none`, 선택·hover 표시보다 아래, Hand 드래그 층보다 아래. 다른 프레임으로 갈 때는 위치와 크기가 옮겨 간다(`--time-settle` 220ms, `--ease-settle`, 결정 17). 이 220 ms transition은 작업 frame id가 바뀐 그 한 번에만 건다(예: id가 바뀔 때만 이동용 class를 220 ms 붙임). 표시는 화면 px로 놓이고 view가 바뀔 때마다 다시 정해지므로(`applyView` → 표시 위치 갱신), transition을 늘 걸면 팬·확대·따라가기 이동·창 크기 변경 때 표시가 프레임보다 늦게 미끄러진다. view 변경, reload 뒤 다시 붙이기, 같은 frame의 크기 변화, 작업 턴 도중 캔버스를 열 때는 바로 놓는다. 초안의 `.mark.jump-highlight.working` transition은 이 뜻으로 옮긴다. 작업 중에는 gradient가 선을 따라 돌고(4.8초 한 바퀴, linear) glow 투명도가 숨 쉰다(2.4초, `--ease-state`; 작업 notice의 점 `doan-agent-breathe`와 같은 주기). reduced motion에서는 셋 다 없다. reduced transparency에서는 jump highlight처럼 glow를 뺀다. forced colours에서는 jump highlight처럼 3 px `Highlight` 테두리다. 사람이 그 사이 frame drawer 등으로 다른 프레임에 jump하면 그 프레임에는 지금처럼 1.2초 jump highlight가 따로 나온다.
9. **따라가기.**
   - 시작 조건: 고른 작업 내용의 frame이 이 작업 턴에 아직 따라가지 않은 frame이고(`followed`: 이 캔버스·작업 턴에서 따라갔거나 따라간 것으로 본 frame id), 그 frame이 layout에 있고(`update` 뒤 reload로 새로 생긴 경우 포함), `now - lastPersonMove >= FOLLOW_IDLE_MS`, 이 작업 턴의 멈춤 표시가 없고, busy가 아니고, 고른 작업 출처가 직전과 같을 때. 같은 frame의 다음 `update`나 reload는 시작 조건이 아니다. 시작 조건이 맞아 옮겼거나 이미 보여 옮기지 않았으면 그 frame을 `followed`로 둔다.
   - busy: pick, capture(`state.capturing`), 드래그, Space 누름, 캔버스 페이지가 보이지 않음(`onCanvasPage()` false: Overview, Home, Settings 등), 그 페이지의 메뉴(frame drawer, zoom 메뉴)나 Quick Open·dialog가 열림.
   - 캔버스에 들어옴: 작업 턴 도중에 캔버스를 열거나 돌아오면(sidebar, Back, Overview 등) `lastPersonMove`를 지금으로 하고, 그때의 작업 frame을 `followed`로 둔다. 멈춤 표시는 남기지 않는다. 사람이 방금 고른 화면을 바로 빼앗지 않고, 다음 frame부터 따라간다.
   - 작업 출처가 바뀜: 고른 작업 출처(터미널 세션 또는 대화)가 바뀐 `update`는 표시와 글만 바꾸고 화면을 옮기지 않으며, 그 frame을 `followed`로 둔다. 두 출처가 번갈아 `update`해도 화면이 왔다 갔다 하지 않는다.
   - "이미 보임": `safeArea(viewport, FIT_INSET)`(`viewport.ts`) 안에 프레임이 다 들어 있으면 보인다. 안전 영역보다 큰 프레임은 윗변이 안전 영역 안에 있으면 보인다.
   - 이동: 보이지 않으면 옮긴다. 지금 확대율로 안전 영역에 들어가면 확대율을 그대로 두고 가운데로 옮긴다(`elementView`의 들어맞는 경우와 같은 계산). 들어가지 않으면 frame drawer의 jump와 같은 `fitFrame`을 쓴다(spec 완료 조건 9). 선택하지 않고 1.2초 jump highlight도 더하지 않는다(작업 프레임 표시가 같은 모양으로 이미 있다). 이동은 지금의 jump처럼 바로 일어난다(view 애니메이션 없음). `followDecision`이 이 view를 돌려준다.
   - 사람의 이동은 출처로 구별한다: view를 바꾸는 모든 곳(`applyView`와 그 호출자)이 출처를 받고, 기본값은 "사람"이다. 사람이 아닌 출처는 넷뿐이다: 따라가기 이동, reload가 보존한 화면, 캔버스를 열 때 복원한 화면, 열 때의 맞추기(`settleFit`). 사람 출처의 view 변경은 `lastPersonMove`를 지금으로 하고, 작업 턴 중이면 멈춤 표시를 남긴다. 그래서 새 이동 경로가 생겨도 따라가기가 사람과 싸우지 않는다. 지금의 경로 예: 휠·트랙패드 팬, 핀치·⌘휠 확대, Hand·Space 드래그, 확대 버튼·zoom 메뉴(`zoomTo`)·단축키, frame drawer, Quick Open 프레임 이동, 칩 Locate, `doan open --frame`·`doan://` 링크의 프레임 이동. 지금의 `viewChanged` 콜백은 출처를 구별하지 않으므로 그대로 쓰면 안 된다.
   - 쉬는 신호: 보드 위의 pointer 이동, 선택 변경, 패널 composer 입력도 `lastPersonMove`를 지금으로 한다(멈춤 표시는 남기지 않음). 작업 턴 중에 사람이 선택을 바꾸면 멈춤 표시도 남긴다.
   - 멈춤의 범위: 사람의 이동은 그 순간 이 캔버스에 작업 내용이 있는 모든 작업 턴 키에 멈춤 표시를 남긴다. 다른 출처가 이겨도 다시 따라가지 않는다.
   - 작업 턴의 키: 터미널은 main이 그 세션의 작업이 처음 시작될 때(`start` 또는 `update`로 세션이 생길 때) 한 번 만드는 식별자(`WorkItem`에 실음, provider 포함; 만료나 `done` 뒤 새 세션이면 새 값), 앱 대화는 (conversationId, turnId). renderer가 처음 본 시각을 쓰지 않는다. 화면 전환이나 구독 시점에 따라 키가 달라지기 때문이다. 키가 바뀌면(예: `done` 뒤 새 `update`) 멈춤 표시와 `followed`는 없어진다. 둘 다 캔버스·작업 턴 키별로 renderer 메모리에만 있다.
   - 캔버스를 떠났다가 같은 작업 턴에 돌아오면 멈춤 표시와 `followed`는 남는다.
10. **앱 종료·reload.** 터미널·대화 작업 내용은 모두 메모리에만 있다. renderer reload 뒤에는 main에서 다시 읽는다. 앱을 다시 실행하면 없다.

### UI 흐름

1. 터미널 에이전트(또는 캔버스 대화)가 프레임 `pricing-empty`를 고치기 시작하며 `update --frame pricing-empty --note "요금제 빈 상태를 그리는 중"`을 보낸다.
2. 그 캔버스를 보고 있던 사람의 보드에서 작업 notice의 글이 그 문장으로 바뀌고 `pricing-empty`에 표시가 생긴다. 사람이 5초 넘게 화면을 움직이지 않았고 그 프레임이 화면 밖이면 화면이 그 프레임으로 옮겨 간다.
3. 에이전트가 파일을 쓰면 캔버스가 다시 불러와지고 표시는 같은 프레임에 다시 붙는다. 이미 따라간 프레임이면 화면은 다시 옮기지 않는다. `update`할 때 아직 없던 새 프레임이 이 reload로 생겼으면 조건이 맞을 때 한 번 따라간다.
4. 다음 프레임의 `update`에서 표시가 옮겨 가고, 조건이 맞으면 화면도 따라간다.
5. 사람이 중간에 휠로 다른 곳을 보면, 그 턴의 나머지 `update`는 표시와 문구만 바꾸고 화면은 옮기지 않는다.
6. `done`(터미널) 또는 턴 끝(앱 대화)에서 glow, 작업 notice, 표시가 사라진다. 사람이 다른 캔버스를 보고 있으면 지금처럼 사이드바만 바뀐다.

project 대화는 Home이나 Overview에서 시작되고, 그 대화가 이름을 댄 캔버스를 사람이 열고 있을 때만 그 보드에 같은 흐름이 나온다.

`/design-draft`에서 그릴 상태:

- (a) note가 글이 된 작업 notice: 터미널, 캔버스 대화(Stop 있음), project 대화(Stop 없음)
- (b) note 없이 프레임 제목이 들어간 작업 notice
- (b2) 글이 바뀔 때 지우고 치기: 단계 순서와 시간, 중간에 새 update가 온 경우, reduced motion
- (c) 긴 note의 말줄임표와 tooltip
- (d) 작업 프레임 표시(jump highlight 모양, 살아 있는 gradient와 glow): 보통, 같은 프레임이 선택됨, hover 중
- (e) 표시할 프레임 id가 문서에 없음(문구만)
- (f) 표시가 다른 프레임으로 옮겨 감: 전과 후, 옮겨 가는 중간을 주석으로
- (f2) 따라가기: 옮기기 전과 후(프레임이 화면 밖 → 화면 안), 이미 보이는 프레임(옮기지 않음)
- (g) 따라가기 멈춤: 사람이 팬한 뒤 다음 `update`(표시만 옮겨 가고 화면은 그대로, 멈춤 표시 없음)
- (h) reduced motion(멈춘 표시). 앱은 light only라서 다크 모드는 그리지 않는다(DESIGN.md 'Doan adjustments' 'Light only').

초안 요청: 캔버스 `.doan/canvases/work-update.html`, canvas id `work-update`, frame id `notice-states`(a·b·c), `notice-typing`(b2), `marker-states`(d·e), `marker-moves`(f), `follow`(f2·g), `reduced-motion`(h). `/design-sync`는 이 여섯 frame을 비교한다.

새 파일에 그리고, 참고 원본 `.doan/canvases/terminal-agent-activity.html`(`terminal-notice`)과 `buzz-canvas.html`(`agent-working`)은 고치지 않는다.

### 읽은 design preset

`doan design-skill --json`(설치된 CLI)로 목록을 보고 두 개를 읽었다.

- `clarify`: "Loading text names the real operation and sets an honest expe[ctation]" — 작업 notice가 고정 문구 대신 실제 작업을 말하는 근거다. 같은 개념에는 같은 말을 쓰라는 규칙을 따라, 바탕 문구는 기존 "Agent is working"이다.
- `animate`: "On working surfaces … motion serves feedback, state, and continuity; keep routine transitions fast and never make people wait through load choreography" — 작업 프레임 표시는 연출 없이 나타나고 옮겨 가며, 따라가기 이동은 짧게 하고 reduced motion에서는 바로 옮긴다.

## 2. 순수 함수(`/tdd` 대상)

Go(`cli/internal/cli/work_rules.go`):

1. `workUpdateArgs(positional []string, frames []string, note string, noteSet bool) (path, frame, note string, err error)` — §1 규칙 2의 경계. 플래그는 따로 파싱하지 않는다. `run.go`의 `SplitArgs`가 기존 `Flags`로 먼저 읽고(`Frames`는 이미 있고, `Note`를 더함), `case "work"`의 허용 플래그 목록에 `update`일 때만 `frame`·`note`를 연다(지금 `frame`은 `open`에서만 허용). 이 함수는 위치 인자와 파싱된 값을 받는다. `--frame`이 두 번이면 `open`처럼 오류다.
2. `workRequest(action, root, path, frame, note string, id workIdentity) (map[string]any, bool)` — §1 규칙 3. 앱 대화에서 `start`·`done`이거나 대화 id가 없으면 `false`(보내지 않음). `workIdentity`는 세션/provider 또는 대화 id.
3. `conversationID(value string) string` — `session`과 같은 불투명 id 계약.

TS main:

4. `applyWork`의 `update` 분기, `workItems`의 `frame`·`note`·`touched`(`workState.ts`). 같은 경로를 가진 두 root를 꼭 넣는다.
4b. `WorkItem`에 터미널 작업 턴 식별자(세션의 작업이 처음 시작될 때 main이 한 번 만듦, §1 규칙 9 '작업 턴의 키').
5. `workItemsChanged(previous, next)` — 지금 `index.ts`의 `work:changed` 발행 비교를 꺼내 작업 내용까지 본다. 빠뜨리면 `update`가 앱에 닿아도 renderer는 바뀌지 않는다.
6. `applyConversationWork(state, request, live)`, `endConversationWork(state, conversationId)` — §1 규칙 5. `live`는 (conversationId → {root, turnId, running})의 읽기 전용 사본이다.
7. 환경: 주입은 대화 id를 아는 `ConversationService.openRunner`에서 `input.env`에 더한다(§8, 두 경로 모두). `agentAuth/environment.ts` `providerEnv`는 `RESERVED`에 `DOAN_CONVERSATION_ID`를 더해 provider extra가 덮으면 `reserved_extra`로 거절하는 일만 한다. A4는 `RESERVED` 검증(`agentAuth/environment.test.ts`, `conversation/environment.test.ts`), B3는 runner 환경에 id가 들어가는지(`service.test.ts`)를 맡는다.

TS renderer:

8. `pickWork(open, presence, conversationWork, terminalWork)` — §1 규칙 6.
9. `agentNoticeView` 확장 — 문구(프레임 제목, 없으면 id), project 대화 변형(Stop 없음).
9b. `typingSteps(from, to, {eraseMs, typeMs, capMs, fromWidth, toWidth})` → `{text, at, minWidth}[]` — 결정 19·20: grapheme 공통 앞부분, 끝부분만 지우고 치는 순서와 시각, 1,000 ms 상한의 비율 축소, 단계마다의 너비 하한(애니메이션 동안 `min(fromWidth, toWidth)`, 마지막 단계는 없음). 중간 교체는 호출자가 지금 보이는 글을 `from`으로 다시 부른다.
10. `workFrameRect(layout, id)`.
11. `followDecision({frame, followed, sourceChanged, rect, viewport, view, lastPersonMove, now, stopped, busy})` → `"move" | "stay"`와 이동할 view — §1 규칙 9의 시작 조건, "이미 보임"(`safeArea(viewport, FIT_INSET)`), 확대율 유지·`fitFrame` 이동.
12. `followTurnKey(item)`(터미널은 main이 준 식별자, 대화는 conversationId+turnId), 멈춤 표시 갱신 `followStopped(state, keys, personMoved)`(그 캔버스의 모든 작업 턴 키), 캔버스에 들어올 때와 출처가 바뀔 때의 `followed` 갱신.

## 3. 형식 변경

- **JSON Schema 원본이 바뀐다**: `schema/app-socket.v3.schema.json`의 `$defs/request`.
  - `action` enum에 `update`.
  - 새 속성 `frame`(v4 frame 경계), `note`(1–120자, 제어 문자·줄바꿈 없음), `conversation`(`session`과 같은 불투명 id 계약).
  - 조건: `start`·`update`면 `path` 필수, `done`이면 금지. `update`가 아니면 `frame`·`note`·`conversation` 금지. `conversation`이 있으면 `session`·`provider` 금지.
  - 응답은 그대로다.
- **`v`는 3에 둔다(결정 7).** 새 앱은 지금 CLI의 요청을 그대로 받는다. 지금 앱은 새 CLI의 `update`를 schema에서 `bad_request`로 거절하고, CLI는 그것을 `delivered: false`로 바꾼다(ARCHITECTURE §4 'Best effort'). 그래서 어느 조합도 에이전트를 막지 않는다. 이 이유를 승격 때 ARCHITECTURE §4 'Terminal work over app-socket v3'에 적는다. 이름 "Terminal work"도 앱 대화를 포함하도록 고친다.
- **fixture**: `request/valid/`에 frame+note, frame만, note만, 둘 다 없는 update, conversation이 있는 update. `request/invalid/`에 path 없는 update, `start`에 붙은 frame/note/conversation, 121자 note, 줄바꿈 note, 빈 frame, conversation과 session이 함께 있는 update. Go(`cli/internal/formats`)와 TS(`app/src/formats/validate.ts`) 테스트가 같은 파일을 읽는다.
- **대화 이벤트 형식은 바뀌지 않는다**(결정 10). userData에 새 파일도 없다.
- `work`의 `result`에는 schema가 없다(ARCHITECTURE §12). `update`의 `{delivered}`는 §12 문장으로 적는다.

## 4. 관례 영향

- **ARCHITECTURE §1 규칙 I가 바뀐다.** 문장 초안: "Before the first edit to a canvas, run `doan work start <canvas path> --json`. Each time you start editing a frame, run `doan work update <canvas path> --frame <id> --note "<what you are doing, one short line in the person's language>" --json`; it also counts as `start`." 지금의 "run it again when several minutes pass between edits"는 `update`가 대신하므로 지운다. 규칙 J와 `delivered:false` 문장은 그대로다.
- **guide 예산.** BACKLOG 'Known defects'대로 guide는 21,598 / 21,600 B다(`skillOutputBudget`, `cli/internal/cli/skill_test.go`). 위 문장과 명령 목록 한 줄(약 350–450 B)을 넣으려면 먼저 줄여야 하고, 줄이기는 모든 section에 닿으므로 전체 `/agent-eval` round가 필요하다(tasks G0).
- **`doan check` 규칙은 더하지 않는다.**
- **Agent setup 허용 규칙이 하나 는다**(ARCHITECTURE §7 'Agent setup' 'Claude allow rules'). 병합은 빠진 규칙만 넣는다. link인 settings 파일 안내 문구(`notice.ts`)도 네 규칙을 말한다.
- **예약 환경 변수가 하나 는다**(ARCHITECTURE §7 'Agent conversation runtime and IPC'의 환경 문단, 'Agent authentication'의 `RESERVED`).

## 5. 결정 영향

- **Out of scope 4(에이전트를 깨우지 않음)**: `update`는 표시 신호다. 대화를 시작하거나 보내지 않는다. 따라가기는 열린 캔버스 안에서 화면만 옮긴다.
- **앱은 캔버스에 쓰지 않음(Out of scope 7)**: 표시는 renderer overlay(지금 `jumpMark`와 같은 층)이고, 따라가기는 view만 바꾼다.
- **신호는 앱을 열지 않음**, **세션 연결을 기록하지 않음**(PRODUCT §5 item 10): `update`도 같다.
- **ARCHITECTURE §4 'Suppression'이 좁아진다**: "`DOAN_APP_CONVERSATION=1` sends nothing"은 `start`·`done`에만 맞게 된다. 앱 대화를 터미널 작업으로 세지 않는다는 원래 목적은 결정 9(별도 상태와 채널)로 지킨다.
- **PRODUCT §5 item 2 'Agent indicator'의 "project conversation … never shows or stops it"이 바뀐다**: 이제 보인다(Stop은 없다, 결정 15). "twin canvas in another worktree never shows or stops it"은 그대로다.
- **에이전트가 쓴 글을 앱에 보인다(결정 2)**: note는 에이전트의 자유 글이 앱 UI에 나오는 첫 경로다. 텍스트로만 그리고, 알림·toast에 쓰지 않고, 길이를 제한한다. 캔버스나 코멘트 속 지시에 끌려간 에이전트가 사람을 헷갈리게 하는 글을 쓸 수 있지만, 글은 notice 안에서만 보이고 버튼이나 링크가 되지 않는다.
- **대화 id가 에이전트 환경에 들어간다**: 같은 기기의 에이전트가 다른 대화의 id를 알면 그 대화의 표시를 바꿀 수 있다. 소켓 token이 이미 이 기기 사용자의 경계이고, 바꿀 수 있는 것은 같은 root의 진행 중 턴의 표시뿐이라 받아들인다.

## 6. PoC 의존

- **P1. 환경 전달.** Doan이 runner 환경에 넣은 변수가 다섯 provider의 셸 도구에서 실행한 `doan`까지 가는지 문서로 확인된 적이 없다. 지금의 `DOAN_APP_CONVERSATION` 억제도 마찬가지다. 진행 중인 `canvas-handoff` feature의 P1(`docs/features/canvas-handoff/tasks.md`)이 같은 것을 확인하므로, 그 결과가 있으면 다시 쓰고 없으면 여기서 한다. 실패한 provider에서는 앱 대화의 `update`가 아무것도 바꾸지 않는다(best effort라 대화는 막히지 않는다).
- **P2. 소켓 도달.** 사람의 `~/.codex`에는 Codex rule이 있어 `doan`이 sandbox 밖에서 돈다(ARCHITECTURE §7 'Agent setup'). Doan 연결 Codex 프로필에는 그 rule이 없다(`agentSetup/plan.ts`만 씀). Default 모드의 앱 Codex 대화에서 sandbox가 소켓을 막으면 `update`는 `delivered: false`로 끝나거나 escalation 권한 요청이 된다. ACP provider(Cursor, Antigravity, Copilot)도 확인되지 않았다. P1과 같은 probe에서 `doan work update`의 `delivered`를 provider별·권한 모드별로 본다.
- **사용성.** 에이전트가 프레임마다 `update`를 보내는지, id가 맞는지는 eval 전에는 모른다. 지금까지 `/agent-eval` 실행은 모두 편집 한 번이었다(USABILITY-EVAL.md 'Terminal-work signals: first W3 round'). 그래서 eval W5(E1)를 UI 작업 앞에 둔다.
- **권한 질문 비용.** Default 모드의 앱 대화와 Cursor·Antigravity·Copilot 터미널에서는 `doan` 실행마다 물을 수 있고, 프레임마다 `update`를 하면 묻는 횟수가 는다. eval runner는 권한 질문을 볼 수 없다(USABILITY-EVAL.md). 앱 대화 쪽은 결정 12로 Doan 연결 프로필에 허용을 넣어 줄인다. Cursor·Antigravity·Copilot의 Doan 연결 프로필은 이 결정에 들지 않는다.

## 7. 참고한 POSTMORTEM

- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: "any state kept across a failed or pending read about a canvas carries the project root in its identity, and tests switch between two roots that share a canvas id and path." → 터미널 작업 내용은 (세션, root, path), 대화 작업 내용은 root를 함께 기억하고, `pickWork` 테스트는 같은 경로를 가진 두 root를 오간다. project 대화 표시도 같은 root만 센다.
- **2026-10-29 'Codex cut the middle out of the doan guide and kept its end marker'**: "check it against the output budget tests and remember that an end marker does not detect a cut in the middle." → G0.
- **2026-10-26 'A reload that never laid out left a new comment unblocked'**: "reads `CanvasState.reloading` or `status === \"failed\"`, not a `layout.document` change or `status === \"loading\"` alone." → 표시 재부착과 따라가기 시작 조건은 `reloading`을 본다.
- **2026-11-02 'Evaluation unit checks inherited the real session-recording runtime'**: eval 테스트가 CLI를 실행할 때는 절대 경로의 임시 `DOAN_RUNTIME`을 준다. → W5 fixture도 같다.
- **2026-10-31 'A linked default directory served its unconfigured target'**: 경로 규칙은 새로 만들지 않고 `workTarget`을 쓴다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: 대화 작업 내용은 `turnId`를 함께 기억하고, 끝난 턴의 늦은 `update`는 다음 턴이 받아들여지기 전까지 버린다. 그 뒤에 도착한 이전 턴의 요청은 구별하지 못한다(§1 규칙 5 '한계').
- ARCHITECTURE §4 'Auto-registration'이 인용하는 POSTMORTEM 2026-11-03: `adopt`는 목록만 보내고 `FolderFocus`는 보내지 않는다. 터미널 `update`의 자동 등록도 같은 경로를 탄다.

## 8. 앱 대화 묶기를 코드로 확인한 것

- 환경을 만드는 곳은 두 군데다: legacy external은 `conversation/environment.ts` `agentEnv`, Doan 연결은 `agentAuth/manager.ts` `childEnv` → `agentAuth/environment.ts` `providerEnv`. 둘 다 `DOAN_APP_CONVERSATION: "1"`을 넣고, `conversation/prepare.ts`가 그 결과를 `Prepared.env`로 넘긴다(Doan 연결은 `PATH`와 Claude의 `promptSuggestionEnv`를 더함).
- 대화 id는 `ConversationService.start`에서 `randomUUID()`로 runner를 열기 전에 정해지고, `openRunner(id, live, input)`가 runner를 연다. 그래서 `openRunner`에서 `input.env`에 id를 더하면 두 경로 모두에 들어간다. `prepare`에는 id가 없으므로 그쪽에서 넣지 않는다.
- Codex runner는 대화마다 `app-server`를 띄우고 그 대화의 여러 턴에 걸쳐 산다. 환경은 runner를 열 때 한 번 정해지므로 같은 대화의 턴마다 id가 같다. 턴은 main이 `turnId`로 구별한다.
- `ConversationService.receive`가 턴 끝 이벤트를 처리하는 곳(같은 파일)이 대화 작업 내용을 지울 자리다. archive(`archive()`), 삭제, 종료도 같은 정리를 부른다.
- project 대화의 캔버스는 `ProjectTurn` 증거와 판정(`project.ts`)으로 턴 뒤에 정해진다. `update`가 주는 path는 이 판정에 넣지 않는다(결정 11). 표시는 `update`의 path로만 정한다.

## 9. 사용자 확정

사용자 확정(2026-11-05): 초안 확인, 질문 Q1–Q8 답. 수정본의 최종 모양도 사용자가 앱에서 확인했다. 구현 주의: 카드는 내용 폭으로 정해지므로 줄의 폭 하한을 퍼센트(`min(100%, …)`)로 주면 0으로 계산되어 하한이 걸리지 않는다(초안 미리보기에서 확인함). px 값으로 주고, 카드가 쓸 수 있는 폭으로 상한을 둔다. 초안은 `.doan/canvases/work-update.html`이다. 마지막 수정본(너비 규칙, 공통 앞부분, 커서 간격 2px)도 사용자가 앱에서 보고 확정했다(2026-11-06). 지우고 치는 속도(20·35 ms/글자, 1,000 ms 상한), 커서 깜빡임 주기(1초)와 따라가기 전 쉬는 시간(5초)은 확정한 시작값이고, tasks U1·E2에서 조정할 수 있다.
