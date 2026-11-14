# prototype-link-convention — design

## 바뀌는 곳

- CLI(Go)
  - `cli/internal/canvas/canvas.go`: `Canvas.Gotos []Goto`(`Goto{Value string; Frames []string}`, `Frames`는 감싼 프레임 id를 바깥에서 안쪽 순으로). `Parse`의 `visit`이 열린 프레임 id 스택을 지니고 내려간다(시그니처 119행 근처). 기록할 때 스택을 복사한다. slice를 넘기며 `append`하면 형제 사이에서 backing array를 공유해 기록이 덮인다.
  - `cli/internal/canvas/links.go`(새 파일): `Playable(c, id) bool`(spec '정의': `id != ""`이고 `PrototypeTarget(...)`이 OK), 간선, 묶음 `LinkGroups(c) [][]string`.
  - `cli/internal/check/check.go`: 네 규칙. 위치는 `prototype_not_frame`(179–185행) 바로 뒤다.
- 형식과 fixture: `schema/fixtures/prototype-links/cases.json`(새 파일).
- 앱(TS): `app/src/main/prototype/links.ts`(새 파일). 묶음 계산이다. 렌더러도 import할 수 있게 Electron 없이 순수하게 둔다(`mark.ts`처럼).
- 문서(승격): ARCHITECTURE §1 convention 15와 `doan check` 표, §11. PRODUCT §3 Out of scope 2.
- CLI 명령, socket 형식, 앱 화면은 바뀌지 않는다.

## 규약(convention 15)

- `data-doan-goto="<frame id>"`. 선택 속성이다. 아무 요소에나 단다(프레임 요소 자신 포함).
- 값은 다듬거나 정규화하지 않는다. 대상 프레임의 `data-doan-frame` 값과 문자열로 같아야 한다. 대소문자, 앞뒤 공백, NBSP, NFC/NFD 차이도 다른 값이다. 프레임 id에 문법이 없으므로(convention 4) 값에도 문법이 없다.
- 같은 요소에 속성이 여러 번 있으면 처음 것만 센다(`canvas.go:129-137`).
- `<template>` 안은 세지 않는다(마크와 같다).
- 감싼 프레임: 요소 자신과 조상 중 `data-doan-frame`이 있는 요소들이다. 중첩 프레임이면 여럿이다.
- 정적 판단과 live 판단: `doan check`와 하위 3의 내보내기는 파일로 판단하고, 프로토타입 창은 live 문서로 판단한다. 스크립트가 만든 연결이나 프레임은 둘 사이에서 다를 수 있다(convention 14와 같은 차이).
- 재생할 때의 의미(하위 2가 convention 15에 더함): 바깥 프레임을 재생하면 안쪽 프레임의 연결도 보이고 눌린다. 그래서 연결은 감싼 재생 가능한 프레임 어디서 재생하든 동작한다.

## 규칙

연결마다 대상 코드를 spec 완료 조건 3의 순서로 하나 판정하고, `goto_outside_prototype`을 따로 판정한다.

| 코드 | 조건 | 메시지(초안) |
|---|---|---|
| `goto_target_not_found` | 값이 비었거나 값과 같은 id의 프레임이 없다 | `data-doan-goto="<v>" names no frame in this canvas; use the data-doan-frame id of a marked frame.` |
| `goto_target_shared` | 값과 같은 id의 프레임이 둘 이상 | `data-doan-goto="<v>" names a frame id that two or more frames share; give each frame its own id.` |
| `goto_target_not_prototype` | 대상이 하나이지만 id가 200 UTF-16 단위를 넘는다 | `data-doan-goto="<v>" names a frame whose id is longer than 200 characters; shorten the id.` |
| `goto_target_not_prototype` | 대상이 하나이지만 마크가 없거나 틀렸다 | `data-doan-goto="<v>" names a frame that is not marked for prototyping; add data-doan-prototype to that frame.` |
| `goto_outside_prototype` | 감싼 프레임 중 재생 가능한 프레임이 없다(프레임 밖 포함) | `data-doan-goto="<v>" is not inside a frame that can play; put it inside a frame marked with data-doan-prototype.` |

- 모두 error다(사용자 결정). 기존 마크 규칙도 error다.
- `frame`은 감싼 가장 안쪽 프레임 id이고, 프레임 밖이면 비운다. `value`는 속성 값이다. 메시지는 (code, value)만의 함수다. 그래야 기존 `add`의 중복 제거가 의도대로 동작한다.
- 대상 id가 공유되면 `duplicate_frame_id`도 따로 나온다. 같은 원인을 두 번 말하지만, 연결 쪽에서 무엇이 깨졌는지 알려 주므로 둘 다 둔다.
- 200자 초과는 `goto_target_not_prototype`로 보고한다. `doan open/export --prototype`은 같은 경우(`PrototypeTooLong`)를 `frame_not_found`로 보낸다(ARCHITECTURE §4). 연결 규칙에서는 대상 프레임이 실제로 있으므로 "names no frame"보다 정확한 쪽을 고른다.
- 판정에 `PrototypeTarget`을 그대로 쓰지 않는다. 이 함수는 길이를 먼저 보고 빈 id를 거르지 않으므로 순서가 다르다. 빈 값을 먼저 걸러 내고 개수와 길이, 마크를 차례로 본다.
- `doan check`는 오류가 있으면 exit 4이고 envelope은 `ok: true`다(ARCHITECTURE §12).
- 자기 자신으로 가는 연결은 대상이 재생 가능하면 규칙에 걸리지 않는다(사용자 결정).

## 묶음 계산

- 노드: 재생 가능한 프레임(spec '정의').
- 간선: 연결마다, 감싼 프레임 중 재생 가능한 프레임 각각에서 대상으로 간다. 대상이 재생 불가면 간선이 없다. 자기 자신으로 가는 간선은 묶음에 영향이 없다.
- 묶음: 방향을 무시한 연결 요소다. 묶음 안 프레임은 문서 순서, 묶음은 첫 프레임의 문서 순서다.
- Go 반환: `[][]string`(프레임 id).
- TS 입력 계약(`links.ts` `linkGroups(frames, gotos)`)
  - `frames`: 문서 순서의 `LayoutFrameMark {id, prototype?}`(`playability.ts`). 모든 `data-doan-frame`을 넣는다. 이미 재생 가능한 것만 걸러 넣어도 결과가 같아야 한다(멱등).
  - `gotos`: 문서 순서의 `{value, frames}`.
  - id와 값은 원본이다. 한도(200 UTF-16, 1000개)를 넘는 것은 공급자가 잘라 넣지 말고 뺀다. 잘린 id는 다른 200자 id와 겹쳐 가짜 간선을 만든다. 하위 2의 보드 `layout`은 지금 id를 200자로 자르므로, 하위 2가 그 경우를 빼고 넣는다.
  - 반환: `string[][]`.

## 순수 함수(`/tdd` 대상)

1. Go `Parse`의 `Gotos` 기록(감싼 프레임 스택, 중첩, 형제 중첩, 프레임 요소 자신, `<template>`와 `<template/>`, 첫 속성만).
2. Go `check` 네 규칙과 판정 순서, 메시지.
3. Go `Playable`, `LinkGroups`.
4. TS `linkGroups`.
5. 공유 fixture로 1–4를 함께 고정한다.

## 공유 fixture `schema/fixtures/prototype-links/cases.json`

- `placements`: body `html` 조각마다 다음을 둔다.
  - `frames`: 문서 순서의 `{id, prototype}`, 마크가 없으면 null. `prototype-mark` placements와 같은 모양이다.
  - `gotos`: 문서 순서의 `{value, frames}`.
  - `codes`: 이 연결 규칙의 코드. 순서는 `Run()`이 정렬한 출력 순서(`check.go:313`, 코드 이름 순)다.
  - `groups`: 묶음.
- `groups`: HTML 없이 `frames`와 `gotos`만으로 묶음을 고정하는 경우다. 멱등 경우(걸러진 `frames`)를 하나 넣는다.
- TS 테스트는 `placements`의 `frames`·`gotos`·`groups`와 `groups`를 읽는다(TS는 HTML을 파싱하지 않는다).
- 꼭 넣을 경우
  - 연결: 한 방향 A→B, 왕복, 사슬 A→B→C, 끊긴 두 묶음, 연결이 둘 이상인 조각.
  - 대상: 자기 자신, 대상 없음, 빈 값, 대상 공유, 대상 마크 없음, 대상 마크 틀림.
  - 빈 값과 빈 id: 빈 값 + 마크된 빈 id 프레임 하나, 둘. 둘 다 `not_found`만 나온다.
  - 200 UTF-16:
    - 대상 없는 201단위 값은 not_found다.
    - 공유된 201단위 id는 shared다.
    - 마크 없는 201단위 id는 not_prototype이다.
    - 마크된 201단위 id는 not_prototype(긴 id)이다.
  - surrogate:
    - astral 100자(200단위)는 재생 가능하다.
    - astral 101자(202단위)는 재생할 수 없다.
    - BMP 199자 + astral 1자(code point 200개, 201단위)는 재생할 수 없다. 이 경우가 Go의 rune 세기를 막는다.
  - 다듬지 않음: 대소문자만 다른 값(`Home`/`home`), 앞뒤 공백, NBSP, NFC/NFD.
  - 위치:
    - 프레임 밖과 마크 없는 프레임 안
    - 마크된 A > 마크 없는 B > 마크된 C: `frame=C`, 간선은 A와 C에서 나간다.
    - 마크된 A > 마크된 C > 마크 없는 B: `frame=B`이고 outside가 아니다.
    - 마크된 프레임 둘 중첩(간선 둘), 형제 프레임 둘이 각각 중첩 프레임과 연결을 가짐
    - 프레임 요소 자신에 단 연결, 같은 요소의 중복 속성
    - 프레임 없는 캔버스의 연결: `outside`와 `not_found`가 함께 나온다.
    - 같은 값의 연결이 서로 다른 프레임에 있으면 finding이 둘이다.
  - `<template>`: `<template>…</template>`와 `<template/>`를 최상위와 중첩으로 둔다. 프레임 안 `<template>`의 연결, `<template>` 안의 프레임도 넣는다(POSTMORTEM 2026-11-09).
  - 묶음: 빈 캔버스(`html: ""`), 연결 없는 마크된 프레임(혼자 묶음), 마크 없는 프레임(묶음에 없음).
- lone surrogate는 넣지 않는다. Go `encoding/json`은 U+FFFD로 바꾸고 TS는 그대로 두므로 결과가 갈린다.
- `<head>`나 `<body>` 자체에 단 연결은 body 조각으로 표현할 수 없으므로 Go 전용 테스트로 고정한다. 기대값은 `goto_outside_prototype`이고 `frame`은 없다.
- 설명문(`description`)은 기존 `prototype-mark/cases.json`처럼 규칙을 한 문단으로 적는다.

## POSTMORTEM에서 가져온 함정

- 2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`': `canvas.go`는 `html.Parse`를 쓰므로 파서를 따라간다. 그래도 fixture에 `<template/>`을 최상위와 중첩으로 넣는다.

## 영향

- 형식: 새 공유 fixture 하나다. 시험 데이터라 schema와 `v`가 없다.
  - 지금 읽는 쪽: Go canvas와 check, TS `links.ts`.
  - 나중에 읽는 쪽: 하위 2의 주입·보드 스크립트와 하위 3의 `isolate.js`가 각 하위를 병합할 때 `placements`의 `html`을 DOM에서 실행해 `frames`·`gotos`를 비교한다.
  - §11 항목에 이를 적는다. 앱 socket과 CLI 응답 형식(`v`)은 바뀌지 않고, `doan check --json` finding은 기존 필드(`value`, `frame`)만 쓴다.
- 규약: convention 15를 더한다. 선택 속성이라 다른 속성이 필수가 되지 않는다. PRODUCT §3 Out of scope 2의 문장을 두 선택 속성으로 고친다.
- 구조 결정: 없음.
- PoC 의존: 없음.
- `/agent-eval`: 이 하위는 가이드를 바꾸지 않지만 `doan check` 규칙을 더한다(AGENTS.md 'Workflow'의 조건). 새 규칙은 이 속성을 쓴 캔버스에서만 나온다. 저장소 어디에도 `data-doan-goto`가 없어 기존 시나리오(W7 등)의 `doan check`에 영향이 없다. 그래서 이 하위에서는 돌리지 않고 하위 2의 `/agent-eval`이 함께 잰다(2026-11-14 사용자 확인).
