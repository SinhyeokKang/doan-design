# canvas-edit-awareness — spec (canvas-multi-conversation 하위 3)

에이전트가 캔버스를 고치기 전에, 같은 캔버스 파일을 고치는 다른 세션이 있는지 안다. 있으면 사람에게 한 번 확인한다. Doan은 막지 않는다. 상위 [canvas-multi-conversation](../canvas-multi-conversation/spec.md)의 공통 결정 1–8을 따르고, 하위 1 [canvas-concurrent-conversations](../canvas-concurrent-conversations/spec.md)가 병합된 뒤에 구현한다.

## 사용자

- **에이전트**: 터미널 에이전트와 Doan 앱 대화 안의 에이전트. 편집 전에 부르는 `doan work start`와 `doan work update`의 답에서 다른 세션을 본다.
- **사람**: 같은 캔버스를 다른 세션이 고치고 있을 때, 에이전트가 덮어쓰기 전에 한 번 묻는다. 진행할지, 기다릴지, 다른 캔버스로 할지 사람이 정한다.

## 문제

- 하위 1 이후 한 캔버스에서 앱 대화 여러 개가 동시에 돌 수 있고, 같은 파일을 동시에 고쳐도 Doan은 막지 않는다(상위 공통 결정 3). 터미널 에이전트끼리는 지금도 그렇다.
- 앱은 어느 세션이 어느 캔버스를 고치는지 안다. 터미널 세션은 `workState.ts`, 앱 대화의 작업 내용은 `conversationWork.ts`, 돌고 있는 턴은 `ConversationService.liveTurns()`다. 하지만 v3 답은 `{v: 3, ok: true}`뿐이라(`schema/app-socket.v3.schema.json` `response`) 에이전트에게 돌아가는 정보가 없다.
- 그래서 에이전트는 다른 세션의 작업을 모른 채 같은 파일을 고친다. 편집이 실패하고 다시 시도하거나, 파일 전체를 다시 쓰면 다른 세션의 변경이 사라진다.

## 정한 점

1. **다른 세션의 범위**: 같은 캔버스 파일(루트 + 경로)을 고치는 세션이다. `doan work`로 그 파일을 작업 중이라고 알린 터미널 세션과, 그 파일에서 턴이 돌고 있는 앱 대화를 모두 센다. 다른 워크트리의 같은 캔버스는 파일이 다르므로 세지 않는다. 부른 쪽 자신은 뺀다.
2. **답에 담는 것**: 다른 세션마다 종류(터미널 / 앱 대화), 프로바이더, 지금 프레임, 메모(`doan work update`의 `--frame`·`--note`)를 담는다. 세션 ID, 대화 ID, 계정 이름은 담지 않는다.
3. **에이전트가 묻는 때**: 한 대화 안에서 그 캔버스를 처음 고치기 전에 한 번 묻는다. 사람이 진행하라고 하면 같은 대화 안에서 그 캔버스에 대해 다시 묻지 않는다. 다만 새로운 다른 세션이 나타나면 다시 묻는다. 사람이 처음부터 "다른 세션과 상관없이 진행"이라고 했으면 묻지 않는다.
4. **정보가 없을 때**: 앱이 꺼져 있거나 답에 정보가 없으면(`delivered: false`, 또는 `others`가 없는 답) 묻지 않고 지금처럼 진행한다. Doan은 어떤 경우에도 편집을 막지 않는다(상위 공통 결정 3).

## 리드 판단

- **v3 안에서 답만 늘린다** — `update stays in v3`(ARCHITECTURE §4)와 같은 이유: 요청은 바꾸지 않으므로 이전 앱도 지금처럼 신호를 받는다. 답의 `ok: true` 쪽에 선택 필드 `others`를 더한다. 새 CLI가 이전 앱의 답을 읽으면 `others`가 없으므로 정보 없음으로 진행한다. 이전 CLI가 새 앱의 답(`others` 포함)을 읽으면 이전 스키마(`additionalProperties: false`)에 걸려 `delivered: false`를 보고하지만, 앱은 신호를 이미 받았다. `doan`은 앱 번들 안의 CLI라 두 쪽이 어긋나는 일은 드물고, 어긋나도 `delivered: false`는 오류가 아니다(가이드 규칙).
- **앱 대화는 `update`로만 받는다** — 앱 대화는 `start`를 보내지 않는다(`work_rules.go` `workRequest`). 앱 대화의 에이전트는 프레임을 고치기 시작할 때마다 `update`를 부르므로 첫 `update`의 답이 첫 편집 전에 온다. 가이드는 "터미널은 `start`, 앱 대화는 첫 `update`의 `others`"로 쓴다.
- **바인딩된 대화도 센다** — 그 캔버스에 묶인 앱 대화의 턴이 돌고 있으면, 아직 `update`를 보내지 않았어도 센다(프레임·메모 없이). 하위 1 뒤로는 그런 대화가 여럿일 수 있다.
- **익명 터미널** — 세션 ID가 없는 터미널은 루트마다 하나의 익명 세션이다(ARCHITECTURE §4 'Session'). 같은 루트의 익명 터미널 둘은 구분되지 않으므로 서로를 다른 세션으로 보지 못한다. 알려진 한계로 둔다.

## 완료 조건

- 터미널 세션 A가 `doan work update .doan/canvases/x.html --frame hero --note "Tightening spacing" --json`을 보낸 뒤, 터미널 세션 B가 `doan work start .doan/canvases/x.html --json`을 부르면 결과가 `{delivered: true, others: [{kind: "terminal", provider: "claude", frame: "hero", note: "Tightening spacing"}]}`이다. A 자신의 다음 `update` 답에는 A가 없다.
- 앱 대화 C의 턴이 그 캔버스에서 돌고 있으면, 터미널 B의 `start` 답에 `{kind: "conversation", provider: "<C의 프로바이더>"}`가 있다. C가 `update`를 보냈으면 그 프레임과 메모도 있다. C 자신의 `update` 답에는 C가 없다.
- 다른 워크트리의 같은 캔버스 경로를 고치는 세션은 답에 없다.
- 다른 세션이 없으면 `others`가 없다. 앱이 없으면 `{delivered: false}`이고 `others`가 없다.
- `--json` 없이 다른 세션이 있으면 한 줄을 찍는다(design.md '문구'). 없으면 지금처럼 아무것도 찍지 않는다.
- 가이드 규칙 D가 '정한 점' 3·4를 말한다. `/agent-eval`의 새 시나리오에서 Claude Code와 Codex가 다른 세션이 있는 캔버스를 고치기 전에 한 번 묻고, "상관없이 진행"이 프롬프트에 있으면 묻지 않는다.
- 세션 ID, 대화 ID, 계정 이름이 답과 CLI 출력 어디에도 없다.

## 하지 않는 것

- Doan이 편집을 막거나 경고하는 UI.
- 사람에게 보이는 앱 화면 변경. 앱은 지금처럼 작업 표시만 한다.
- 다른 워크트리의 같은 캔버스를 같은 대상으로 보기.
- 같은 루트의 익명 터미널끼리 구분하기.
- 다른 세션이 끝날 때까지 기다리거나 다시 묻는 자동 동작.

## 사용자 결정(2026-11-14)

- 다른 세션 목록에 경과 시간을 넣지 않는다. 터미널 작업은 5분이 지나면 사라지고 앱 대화는 도는 동안만 세므로, 목록에 있으면 지금 작업 중이다.
- '상관없이 진행'을 처음부터 말한 경우는 `/agent-eval`의 별도 시나리오(W9b)로 둔다.

