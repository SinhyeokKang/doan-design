# canvas-edit-awareness — design

이 문서는 develop `7fdcd1dbf`의 코드를 기준으로 썼다. 하위 1([canvas-concurrent-conversations](../canvas-concurrent-conversations/design.md))이 병합되면 `conversation/` 쪽 인용(대화의 캔버스 바인딩, `liveTurns`)을 그 결과와 다시 맞춘다(tasks 1).

## 흐름

```
에이전트: doan work start|update <canvas> --json
  CLI(work.go): 지금과 같은 v3 요청 {v:3, action, root, path, session/provider | conversation, frame?, note?}
  main(runtime.ts answerLine v:3):
    schema → token → path → (conversation → conversationWork | root 등록 → work)   ← 지금과 같다
    그 뒤 othersOnCanvas(...)로 같은 파일의 다른 세션을 골라
    {v:3, ok:true, others?: [{kind, provider?, frame?, note?}]}   ← 비면 others를 뺀다
  CLI: readWorkResponse가 others를 함께 읽어 result {delivered, others?}
       --json 없이 others가 있으면 한 줄
  에이전트(가이드 규칙 D): others가 있으면 그 캔버스의 첫 편집 전에 사람에게 한 번 묻는다
```

## 영향받는 컴포넌트

- **형식**
  - `schema/app-socket.v3.schema.json` `response`: `ok: true` 쪽에 선택 필드 `others`(배열, 최대 개수 상한)를 더한다. 원소는 `{kind: "terminal" | "conversation", provider?, frame?, note?}`, `additionalProperties: false`. `frame`은 v4의 `frameId`, `note`는 v3 요청의 `note`와 같은 제약을 `$ref`로 쓴다. `provider`는 터미널이면 `claude` | `codex`, 앱 대화면 다섯 프로바이더 id다.
  - `$comment`에 '리드 판단'의 호환 규칙(요청은 그대로, 답만 늘어남, 이전 CLI는 `delivered: false`)을 적는다.
  - fixture `schema/fixtures/app-socket-v3/response/`에 `others`가 있는 답, 빈 경우(필드 없음), 원소 모양별(터미널 익명·이름 있음, 대화 프레임·메모 있음·없음), 상한을 넘는 배열(거부), 모르는 원소 필드(거부)를 더한다. TS(`app/src/formats/validate.test.ts`)와 Go(`cli/internal/formats/validate_test.go`)의 fixture 표에 넣는다.
  - `v`는 3 그대로다(spec '리드 판단').
- **CLI(Go)**
  - `cli/internal/cli/work_rules.go`: `readWorkResponse`가 `bool` 대신 `(delivered bool, others []workOther)`를 돌려주게 바꾼다. `others`는 스키마를 통과한 답에서만 꺼낸다.
  - `cli/internal/cli/work.go`: `start`·`update` 결과에 `others`를 더한다(비지 않았을 때만). `done`은 그대로다. `--json` 없이 `others`가 있으면 `Outcome.Text`에 한 줄을 둔다(지금 `work`는 텍스트 모드에서 아무것도 찍지 않는다, `run.go` `emit`).
  - `cli/internal/formats`: `ValidateWorkResponse`가 새 스키마를 쓴다(스키마 파일을 읽는 방식 그대로).
- **앱 main(TS)**
  - `app/src/main/runtime.ts` `answerLine`의 v3 분기(`:212-223`)와 `workAfterRegistration`(`:170-185`): `state.work`·`state.conversationWork`를 적용한 뒤 `state.workOthers(request)`로 `others`를 받아 답에 넣는다. `RuntimeState`(`:26-31`)에 `workOthers(request: WorkRequest): WorkOther[]`를 더한다. 오류 답과 `project_not_open`은 그대로다.
  - 새 순수 모듈 `app/src/main/workOthers.ts`(아래 순수 함수 1).
  - `app/src/main/index.ts`(`:956-958` 근처): `workOthers`를 `workState`, `conversationWork`, `conversations.liveTurns()`, 대화 목록(캔버스 바인딩과 프로바이더)으로 채운다.
  - `app/src/formats/types.ts`: `WorkResponse`에 `others?`.
- **가이드와 스킬**
  - `cli/internal/cli/skill.md` 규칙 D(`:37`)와 `doan work` 설명(`:55-56`): '문구'의 문장. 스킬 스텁(`app/src/main/onboarding/SKILL.md`)은 바꾸지 않는다(가이드를 부르라는 말뿐이다).
  - 앱 대화 프롬프트(`app/src/main/conversation/prompt.ts`)는 바꾸지 않는다. 앱 대화의 에이전트도 같은 가이드를 읽는다. 앱 대화에서 `start`가 아무것도 보내지 않는다는 점은 가이드 문장에 넣는다.
- **eval**: 새 시나리오와 fake 앱 옵션(아래 'agent-eval').

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **`othersOnCanvas(input) → WorkOther[]`** (`app/src/main/workOthers.ts`)
   - 입력: 요청(`root`, `path`, 부른 쪽 신원: `session`+`provider` | 익명 | `conversation`), `workItems(workState)`, `conversationWork`, 돌고 있는 앱 대화 턴(`liveTurns`의 `running`)과 각 대화의 캔버스 바인딩·프로바이더, 상한.
   - 고르기: 같은 `root`와 같은 `path`인 것만. 터미널은 `WorkItem`에서, 앱 대화는 `running`인 턴 중 (a) 그 경로로 `update`를 보낸 `ConversationWork`가 있거나 (b) 그 캔버스에 바인딩된 대화.
   - 빼기: 부른 쪽 자신. 이름 있는 터미널은 `session`과 `provider`가 같으면, 익명 터미널은 같은 루트의 익명 세션이면, 앱 대화는 `conversationId`가 `conversation`과 같으면.
   - 원소: 터미널 `{kind:"terminal", provider?(익명이면 없음), frame?, note?}`, 앱 대화 `{kind:"conversation", provider, frame?, note?}`. ID는 넣지 않는다.
   - 순서: 최근 `touched`(앱 대화는 그 `ConversationWork.touched`, 없으면 턴 시작) 순. 상한을 넘으면 앞에서 자른다.
2. **CLI `workResponseOthers(line) → (delivered, others)`** (`work_rules.go`): 스키마를 통과하지 못하거나 `ok`가 아니면 `(false, nil)`. 원소 순서를 지킨다.
3. **CLI `workOthersText(others) → string`** (`work_rules.go`): '문구'의 한 줄. `EscapeControl`은 `emit`이 한다.

## 문구

`doan design-skill clarify --json`으로 다듬는다. 초안:

- 가이드 규칙 D 끝에 더할 문장:
  "If the reply lists `others`, another session is editing this canvas file: before your first edit of this canvas in this conversation, tell the person who (kind, provider, frame, note) and ask whether to go ahead. Ask again only when a session you have not told them about appears. Skip the question when the person already said to go ahead regardless. In a Doan app conversation `start` sends nothing, so read `others` from your first `update`. No `others` (including `delivered:false`) means go ahead as usual; Doan never blocks the edit."
- `doan work start`·`update` 설명: "Returns `{delivered, others?}`; `others` lists other sessions editing the same file: `{kind: terminal|conversation, provider?, frame?, note?}`."
- 텍스트 모드 한 줄(예): `Also editing this canvas: a Codex app conversation (frame checkout: "Adjusting the header"); a Claude Code terminal session.`

가이드 길이는 `skillOutputBudget` 예산 안이어야 한다(POSTMORTEM 2026-10-29).

## 세부 규칙

- **같은 파일**: `root`는 문자열 비교, `path`는 CLI가 보낸 저장소 기준 경로 그대로. 루트를 다시 계산하지 않는다(ARCHITECTURE §4 'Selection ownership').
- **시점**: `others`는 이번 요청을 적용한 뒤의 상태로 고른다. 그래서 같은 요청의 `update`가 자기 프레임을 바꿔도 자신은 빠진다.
- **만료**: 터미널 작업은 `WORK_EXPIRY_MS` 뒤 사라진다(`workState.ts`). 만료된 세션은 `others`에 없다.
- **`project_not_open`·등록 대기**: 오류 답에는 `others`가 없다. 자동 등록 뒤 적용되는 경우(`workAfterRegistration`)는 적용한 뒤의 `others`를 답한다.
- **줄 상한**: 원소 상한(예: 8)과 `note` 120자, `frame` 200자로 64 KiB 답 줄 안에 들어간다(POSTMORTEM 2026-11-07, 공유 `readLine`).
- **개인 정보**: 세션 ID, 대화 ID, 계정, 경로 밖 정보는 답에 없다. 메모는 같은 사람의 다른 에이전트가 쓴 한 줄이고, 앱 화면에 이미 보이는 내용이다.

## 형식 변경

- `schema/app-socket.v3.schema.json`의 답에 선택 필드 `others`. `v`는 3 그대로다. 공유 fixture를 TS와 Go가 같이 읽는다.
- CLI envelope의 `work` 결과(ARCHITECTURE §12): `{delivered, others?}`. 명령 결과는 envelope 스키마에 넣지 않는다(§11).

## 규약 영향

- ARCHITECTURE §1 'Agent rules' D에 '정한 점' 3·4가 들어간다. 에이전트 규칙이 바뀌므로 가이드(`skill.md`)와 §1을 같이 고친다.
- `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 10 work 문장에 "`start`와 `update`의 답이 같은 파일의 다른 세션을 알려 주고, 에이전트는 첫 편집 전에 한 번 묻는다"를 더한다.
- PRODUCT §3 Out of scope 4(에이전트를 스스로 깨우지 않음)와 맞는다. 답은 정보일 뿐이고 아무것도 시작하지 않는다.
- 상위 공통 결정 3(동시 편집은 막지 않는다)을 지킨다. 묻는 것은 에이전트이고 Doan은 막지 않는다.

## agent-eval

AGENTS.md 'Workflow': guide, CLI output and messages가 바뀌므로 `/agent-eval`이 필요하다.
- fake 앱(`eval/lib/socket.ts` v3 분기 `:409-421`)에 옵션 `workOthers`를 더해, `start`·`update` 답에 정해진 `others`를 싣는다. 단위 테스트 `eval/lib/socket.test.ts`.
- 새 시나리오 `eval/scenarios/W9`("Another session is editing the canvas: ask once before editing"): fake 앱이 다른 세션을 알리고, 프롬프트는 캔버스 편집을 시킨다. 통과는 에이전트가 첫 편집 전에 한 번 묻고 그 턴에서 캔버스를 고치지 않는 것, 실패 fixture는 묻지 않고 고친 기록이다.
- 같은 시나리오의 짝 `W9b`: 프롬프트에 "다른 세션과 상관없이 진행"이 있으면 묻지 않고 고친다.
- `node eval/run.ts --self-test --scenarios W9,W9b`가 pass·fail fixture를 모두 맞게 판정한다.

## PoC 의존

- 없다. 소켓 답 확장, 가이드 규칙, fake 앱 옵션은 출시된 방식이다.

## POSTMORTEM에서 가져온 것

- **2026-10-29 'Codex cut the middle out of the doan guide and kept its end marker, so presets were never read'**: "before adding text that agents read through a tool (guide, preset bodies, nextSteps, MCP results), check it against the output budget tests". 가이드 문장은 `skillOutputBudget` 테스트 안에 있어야 한다.
- **2026-11-07 'A reply one byte over the cap passed because its length was checked only on a read failure'**: "a cap read through a `+1` limit checks the length before trusting a successful read". `others`가 답을 키우므로 상한 경계 fixture(최대 원소 수, 최대 `note`·`frame`)를 둔다.
- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: "any state kept across a failed or pending read about a canvas carries the project root in its identity, and tests switch between two roots that share a canvas id and path." `othersOnCanvas`는 루트와 경로를 함께 비교하고, 같은 경로의 다른 루트 테스트를 둔다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: 앱 대화는 지금 턴이 `running`인 것만 센다(`liveTurns`). 끝난 턴의 `ConversationWork`는 이미 지워진다(`endConversationWork`).
