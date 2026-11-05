# context-window-ring — spec

사람의 요청: "docked 입력창 우하단에 Context Window Ring. 지금 진행 중인 과업의 프리미티브를 재사용, 물론 사이즈는 작게 가야겠제."

docked composer(캔버스 conversation panel과 project Overview)의 tray(카드 아래 줄) 오른쪽 끝에 작은 진행 링을 두고, 지금 보이는 대화의 context window가 얼마나 찼는지 보인다. 링은 main에 있는 provider-usage의 사용량 링(`AgentUsageButton.tsx`의 `Ring`, `--border-track`, 70% 색 규칙)을 공유 컴포넌트로 빼서 작게 쓴다(design §3).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다. 값은 대화가 이미 받는 provider 출력에서 읽고, 새 모델 요청이나 agent 작업을 시작하지 않는다(Out of scope 4). 서버·동기화도 없다(5).
- In scope 6 'Conversation'의 대화 화면(PRODUCT §5 items 1–3) 위에서 일어난다. Home의 composer는 새 대화만 시작하므로 대상이 아니다.
- PRODUCT·ARCHITECTURE에는 context window 표시에 대한 규칙이 없다. 두 문서가 정하지 않은 것은 사람이 정했다(design '결정').

## 사용자

- **사람(앱 사용자)**: 긴 대화를 이어 가기 전에 context가 얼마나 남았는지 보고, 새 대화를 시작할지 판단한다. 대화가 곧 압축(compaction)되거나 한도에 닿을 수 있음을 미리 안다.
- **에이전트**: 바뀌지 않는다. CLI, guide, skill stub, `doan check`, 턴 prompt는 그대로다.

## 문제(관찰한 사실)

1. Doan의 대화 화면에는 context window를 얼마나 썼는지 볼 곳이 없다. renderer가 받는 대화 event(`app/src/main/conversation/types.ts` `EventPayload`)에 토큰 수나 context 크기가 없다.
2. provider는 이 값을 대화 중에 이미 보낸다(design '조사 결과'). 그러나 runner와 transport(`runners.ts`, `transport.ts`, `acp.ts`)는 그 값을 읽지 않고 버린다.
3. 지금은 같은 세션을 터미널에서 열어 `/context` 같은 명령으로 보는 길밖에 없다. Doan 연결의 대화는 Doan의 profile에서 돌므로(PRODUCT §3 In scope 7) 사람의 터미널에서 그대로 열리지 않는다. legacy external 대화(터미널 세션을 이어 가는 대화, Out of scope 3)는 터미널에서 볼 수 있으나, Doan에서 대화하는 동안에는 역시 볼 곳이 없다.

## 완료 조건

1. **자리.** 캔버스 conversation panel과 project Overview의 docked composer에 context 링이 하나 있다. 자리는 카드 아래 tray(Attach · Pick · model · effort · permission)의 오른쪽 끝, 곧 composer의 오른쪽 아래 모서리다(design 결정 1). provider가 보이는 picker 수(effort·permission이 없거나 terminal session의 고정 tray)와 상관없이 링은 tray 오른쪽 끝에 있다. tray는 줄바꿈하지 않으므로 링은 그 한 줄의 끝에 있다. 카드와 그 안의 Send·Stop·Queue 자리는 바뀌지 않고, 턴이 도는 동안에도 링은 tray에 그대로 있다. 링은 16px다(결정 7). 링이 없으면 tray의 DOM과 배치는 이 기능 전과 같다.
2. **값.** "쓴 토큰(used)"은 그 대화의 마지막 모델 호출의 input 토큰(cache 포함)이다. 모든 provider에 같은 뜻을 쓴다(결정 9). 링은 지금 보이는 대화의 마지막 기록 값, 곧 used ÷ context window 크기의 원시 비율을 0–100%로 채운다(결정 4). 링에는 글자나 숫자가 없다. 비율은 tooltip과 접근 이름에만 있고(결정 10), 글의 퍼센트는 버림한다(69.9%는 "69%", 결정 15). 100%를 넘으면 링은 가득 찬 채이며 tooltip과 이름은 실제 비율을 쓴다.
3. **값이 생기는 때.** transport가 낸 턴의 끝(`turn.done`, `turn.failed` 모두)에서 provider가 그 턴에서 보낸 마지막 값을 대화 event로 기록한다(결정 3·5). Stop의 `interrupted`, 앱 종료, crash 접기, runner가 직접 내는 `turn.failed`에는 값이 없다(design §1). 턴이 도는 동안에는 바뀌지 않는다. 같은 대화를 다시 열거나 앱을 다시 시작해도 마지막 값이 보인다.
4. **값이 없을 때.** 새 대화 상태, 아직 값이 기록되지 않은 대화(첫 턴 전, 이 기능 전에 끝난 턴뿐인 대화), 값을 보내지 않는 provider(Cursor, design '조사 결과')에서는 링이 없다. provider나 대화 종류로 나누지 않고, 기록된 값이 있으면 보인다(결정 2). legacy external 대화(터미널 세션을 이어 가는 대화)도 같은 규칙을 따른다.
5. **색.** 사용량 링과 같이 비율이 70% 미만이면 기본 색, 70% 이상이면 danger 색이다(결정 6). 반올림하지 않은 비율을 사용량 링과 같은 `>= DANGER`로 비교한다. 색만으로 알리지 않고, 비율은 이름과 tooltip 글에도 있다.
6. **접근성과 tooltip.** 링의 접근 이름과 hover tooltip의 첫 줄은 같은 글이다. 예: "Context window 42% used · last turn". "last turn"은 값이 언제의 것인지 알린다(결정 11). tooltip 둘째 줄은 토큰 수("84K of 200K tokens")이고, 같은 글을 `aria-description`으로도 준다. 링은 누르는 컨트롤이 아니다. 눌러도 dialog나 popover가 열리지 않고, 모든 정보는 tooltip에만 있다. Tab 순서에 들지 않는다(결정 8). Escape로 닫은 tooltip은 다시 hover하면 다시 열린다(POSTMORTEM 2026-10-23 'Re-hovering a dismissed tooltip did not reopen it').
7. **다른 동작은 그대로.** 링은 Send, Queue, Stop, 모델·effort·permission picker, 첨부, preset, 대화 목록의 unseen 표시, 턴의 terminal event 수(턴마다 하나)를 바꾸지 않는다. 링 때문에 provider에 새 요청이 가지 않고, 턴이 끝난 뒤 다음 send가 기다리는 시간도 늘지 않는다(POSTMORTEM 2026-10-28).

## 비목표

- 턴이 도는 동안 링을 실시간으로 바꾸는 일(결정 3).
- 누르면 열리는 자세한 내용(dialog·popover), context 내용의 내역(system prompt, tools, messages 등 분류)과 압축 버튼(결정 8). Doan은 `/compact` 같은 명령을 보내지 않는다.
- 모델을 바꾼 직후 새 모델의 window로 다시 계산하는 일. 링은 마지막 턴의 모델 기준 값을 그대로 보이고, 다음 턴이 끝나면 바뀐다.
- Home composer, 대화 목록 행, 헤더의 사용량 버튼(provider-usage)에 context를 보이는 일.
- 계정 사용량(provider-usage)과 context 값을 합치는 일.
- Cursor의 context 값을 비공개 경로로 읽는 일.
