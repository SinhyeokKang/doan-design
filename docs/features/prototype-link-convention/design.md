# prototype-link-convention — design

## 바뀌는 곳

- CLI(Go)
  - `cli/internal/canvas/canvas.go`: `Canvas.Gotos []Goto`(`Goto{Value string; Frames []string}`, `Frames`는 감싼 프레임 id를 바깥에서 안쪽 순으로). `Parse`의 `visit`이 열린 프레임 id 스택을 지니고 내려간다(시그니처 119행 근처).
  - `cli/internal/canvas/links.go`(새 파일): 재생 가능 판단(`canvas.PrototypeTarget`과 같은 기준: id가 비지 않고 고유하며 마크가 맞음), 간선, 묶음(`LinkGroups(c) [][]string`).
  - `cli/internal/check/check.go`: 네 규칙. 위치는 `prototype_not_frame`(179–185행) 바로 뒤다.
- 형식과 fixture
  - `schema/fixtures/prototype-links/cases.json`(새 파일).
- 앱(TS)
  - `app/src/main/prototype/links.ts`(새 파일): 묶음 계산(입력: 프레임 목록 `{id, mark}`과 연결 목록 `{value, frames}`). 렌더러도 import할 수 있게 Electron 없이 순수하게 둔다(`mark.ts`처럼).
- 문서(승격): ARCHITECTURE §1 convention 15와 `doan check` 표, §11.
- CLI 명령, socket 형식, 앱 화면은 바뀌지 않는다.

## 규약(convention 15)

- `data-doan-goto="<frame id>"`. 선택 속성이다. 아무 요소에나 단다(프레임 요소 자신 포함).
- 값은 다듬지 않는다. 대상 프레임의 `data-doan-frame` 값과 문자열로 같아야 한다. 대소문자도 구분한다. 프레임 id에 문법이 없으므로(convention 4) 값에도 따로 문법이 없다.
- 같은 요소에 속성이 여러 번 있으면 처음 것만 센다(`Parse`가 이미 첫 속성을 쓴다, `canvas.go:129-137`).
- `<template>` 안은 세지 않는다(마크와 같다).
- 감싼 프레임: 요소 자신과 조상 중 `data-doan-frame`이 있는 요소들. 중첩 프레임이면 여럿이다.
- 재생할 때의 의미(하위 2): 연결이 있는 요소를 누르면, 재생 중인 프레임에서 대상 프레임으로 간다. 재생 중인 프레임은 그 요소를 감싼 재생 가능한 프레임 중 하나다. 바깥 프레임을 재생하면 안쪽 프레임의 연결도 보이고 눌리기 때문이다.

## 규칙

`Run()`의 차례대로 다음 순서로 보고한다(ARCHITECTURE 표도 같은 순서).

| 코드 | 조건 | 메시지(초안) |
|---|---|---|
| `goto_target_not_found` | 값과 같은 id의 프레임이 없다. 빈 값 포함 | `data-doan-goto="<v>" names no frame in this canvas; use the data-doan-frame id of a marked frame.` |
| `goto_target_shared` | 값과 같은 id의 프레임이 둘 이상 | `data-doan-goto="<v>" names a frame id that two or more frames share; give each frame its own id.` |
| `goto_target_not_prototype` | 대상이 하나지만 마크가 없거나 틀림 | `data-doan-goto="<v>" names a frame that is not marked for prototyping; add data-doan-prototype to that frame.` |
| `goto_outside_prototype` | 감싼 프레임 중 재생 가능한 프레임이 없음(프레임 밖 포함) | `data-doan-goto="<v>" is not inside a frame that can play; put it inside a frame marked with data-doan-prototype.` |

- 모두 error다(사용자 결정). 기존 마크 규칙도 error다.
- `frame`은 감싼 가장 안쪽 프레임 id이고, 프레임 밖이면 비운다. `value`는 속성 값이다.
- 대상 id가 공유되면 `duplicate_frame_id`도 따로 나온다. 같은 원인을 두 번 말하지만, 연결 쪽에서 무엇이 깨졌는지 알려 주므로 둘 다 둔다.
- 대상 id가 200 UTF-16 단위를 넘으면 그 프레임은 재생할 수 없다(`canvas.PrototypeTarget`의 `PrototypeTooLong`). 이 경우는 `goto_target_not_prototype`로 보고하고 메시지를 따로 둔다: `…names a frame whose id is longer than 200 characters; shorten the id.` 
- 자기 자신으로 가는 연결은 규칙에 걸리지 않는다(사용자 결정).

## 묶음 계산

- 노드: 재생 가능한 프레임(id가 비지 않고 고유, 200 UTF-16 단위 이하, 마크가 맞음). 주입 스크립트의 프레임 서랍 목록(`prototypeScript.ts` `list`)과 같은 기준이다.
- 간선: 연결마다, 감싼 프레임 중 재생 가능한 프레임 각각에서 대상으로. 대상이 재생 불가면 간선이 없다. 자기 자신으로 가는 간선은 묶음에 영향이 없다.
- 묶음: 방향을 무시한 연결 요소. 묶음 안 프레임은 문서 순서, 묶음은 첫 프레임의 문서 순서다.
- 반환: `[][]string`(프레임 id). TS는 같은 모양의 `string[][]`.

## 순수 함수(`/tdd` 대상)

1. Go `Parse`의 `Gotos` 기록(감싼 프레임 스택, 중첩, 프레임 요소 자신, `<template>`와 `<template/>`, 첫 속성만).
2. Go `check` 네 규칙과 메시지, 중복 제거.
3. Go `LinkGroups`.
4. TS `linkGroups`(`links.ts`).
5. 공유 fixture로 1·2·3·4를 함께 고정한다.

## 공유 fixture `schema/fixtures/prototype-links/cases.json`

- `placements`: `html` 조각마다 `gotos`(문서 순서의 `{value, frames}`), `codes`(이 연결 규칙의 코드, 순서대로), `groups`(묶음).
- `groups`: HTML 없이 `frames`(`{id, mark}` 목록)와 `gotos`에서 묶음만 고정하는 경우. TS 테스트는 이것과 `placements`의 `gotos`·`groups`를 읽는다(TS는 HTML을 파싱하지 않는다).
- 꼭 넣을 경우
  - 한 방향 연결 A→B(A, B 한 묶음), 왕복, 사슬 A→B→C, 끊긴 두 묶음.
  - 자기 자신, 대상 없음, 빈 값, 대상 공유, 대상 마크 없음, 대상 마크 틀림, 대상 id 201자.
  - 프레임 밖, 마크 없는 프레임 안, 마크 없는 프레임이 마크된 프레임 안에 중첩(재생 가능), 마크된 프레임 둘이 중첩(간선 둘).
  - 프레임 요소 자신에 단 연결, 같은 요소의 중복 속성.
  - `<template>…</template>`와 `<template/>` 안의 연결(세지 않음, POSTMORTEM 2026-11-09).
  - 연결 없는 마크된 프레임(혼자 묶음), 마크 없는 프레임(묶음에 없음).
- 설명문(`description`)은 기존 `prototype-mark/cases.json`처럼 규칙을 한 문단으로 적는다.

## POSTMORTEM에서 가져온 함정

- 2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`': `canvas.go`는 `html.Parse`를 쓰므로 파서를 따라간다. 그래도 fixture에 `<template/>`을 최상위와 중첩으로 넣는다.
- 2026-11-14 'An eval check that compared a prototype export only with a regenerated one accepted the canvas viewer': 이 하위와 직접 관계는 없지만, 하위 3이 X2 기준 파일을 바꿀 때 같은 함정을 본다.

## 영향

- 형식: 새 공유 fixture 하나. 앱 socket과 CLI 응답 형식(`v`)은 바뀌지 않는다. `doan check --json` finding은 기존 필드(`value`, `frame`)만 쓴다.
- 규약: convention 15를 더한다. 선택 속성이라 다른 속성이 필수가 되지 않는다(PRODUCT §3 Out of scope 2).
- 구조 결정: 없음.
- PoC 의존: 없음.
- `/agent-eval`: 이 하위는 가이드를 바꾸지 않지만 `doan check` 규칙을 더한다(AGENTS.md 'Workflow'의 조건). 새 규칙은 이 속성을 쓴 캔버스에서만 나오고, 가이드가 속성을 알리기 전에는 에이전트가 쓰지 않는다. 그래서 이 하위에서는 돌리지 않고 하위 2의 `/agent-eval`이 함께 잰다(2026-11-14 사용자 확인).
