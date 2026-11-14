# prototype-link-convention — spec

상위 feature [prototype-frame-links](../prototype-frame-links/spec.md)의 하위 1이다. 프레임 사이 연결 속성 `data-doan-goto`의 규약, 파싱, `doan check` 규칙, 묶음 계산을 정한다. 이 하위만으로는 사람이 보는 것이 바뀌지 않는다. 연결 동작은 하위 2(`prototype-link-play`), 내보내기는 하위 3(`prototype-link-export`)이 한다. 상위 문서의 공통 결정을 따르고, 상위 문서는 고치지 않는다.

## 사용자

- **에이전트**: 캔버스에 `data-doan-goto`를 쓰고 `doan check`로 연결이 맞는지 확인한다. 가이드는 하위 2가 바꾸므로, 이 하위가 병합된 develop에서는 에이전트가 아직 속성을 모른다.
- **사람**: 바뀌는 것이 없다.

## 문제

- 프레임 사이 이동을 적을 방법이 없다. PRODUCT §5 item 2 'Prototype window'가 "frames do not link to each other"라고 정했다.
- Go 파서(`cli/internal/canvas/canvas.go` `Parse`)는 요소를 감싼 프레임을 기록하지 않는다. 그래서 "이 요소는 어느 프레임에서 재생되는가"를 판단할 수 없다.

## 완료 조건

1. ARCHITECTURE §1 convention 15가 `data-doan-goto="<frame id>"`를 정한다. 값은 같은 캔버스의 프레임 id와 정확히 같아야 한다. 다듬지 않고, 문법은 따로 없다.
2. `canvas.Parse`가 `<template>` 밖의 `data-doan-goto` 요소마다 값과 그 요소를 감싼 프레임 id들을 문서 순서로 기록한다. 감싼 프레임은 요소 자신(프레임 요소에 단 경우)을 포함한다.
3. `doan check`가 다음을 error로 보고한다. 각 finding은 `value`(속성 값)와, 있으면 `frame`(감싼 가장 안쪽 프레임)을 담는다.
   - `goto_target_not_found`: 값과 같은 id의 프레임이 없다. 빈 값도 여기다.
   - `goto_target_shared`: 값과 같은 id의 프레임이 둘 이상이다.
   - `goto_target_not_prototype`: 대상 프레임에 마크가 없거나 마크가 convention 14 문법에 맞지 않는다.
   - `goto_outside_prototype`: 그 요소를 감싼 프레임 중에 재생할 수 있는 프레임(id가 비지 않고 고유하며 마크가 맞는 프레임)이 없다. 프레임 밖도 여기다.
   한 요소가 여러 규칙에 걸리면 모두 보고한다. 같은 캔버스에서 같은 (code, value, frame)은 한 번만 보고한다.
4. 자기 자신을 감싼 프레임으로 가는 연결(예: 프레임 `home` 안의 `data-doan-goto="home"`)은 규칙에 걸리지 않는다. 재생 중에 누르면 그 프레임을 처음부터 다시 시작한다(하위 2).
5. 묶음 계산이 Go와 TS에 있고, 같은 공유 fixture로 같은 결과를 낸다.
   - 재생할 수 있는 프레임만 노드다.
   - 연결 하나는 그 요소를 감싼 재생 가능한 프레임마다, 대상이 재생 가능하면 그 대상으로 가는 간선이다.
   - 간선 방향은 무시하고 이어진 노드를 한 묶음으로 묶는다. 연결이 없는 프레임은 혼자 한 묶음이다.
   - 묶음 안의 프레임 순서와 묶음의 순서는 문서 순서(묶음은 첫 프레임의 문서 순서)다.
6. 공유 fixture `schema/fixtures/prototype-links/cases.json`이 파싱(감싼 프레임), `doan check` 코드, 묶음을 담고, Go와 TS 테스트가 모두 읽는다.
7. ARCHITECTURE §1 `doan check` 표에 네 규칙이 코드 순서대로 있고, §11 'Shared formats'에 새 fixture가 있다.

## 하지 않는 것

- 가이드(`cli/internal/cli/skill.md`) 문구와 `/agent-eval`. 하위 2가 한다. 이 하위의 새 `doan check` 규칙도 하위 2의 `/agent-eval`이 함께 잰다(사용자 확인).
- 프로토타입 창의 클릭 처리, 토스트, 프레임 서랍 묶음 표시. 하위 2가 한다.
- 내보내기와 내보낸 파일의 전환. 하위 3이 한다.
- `doan ls --json`에 연결이나 묶음을 더하는 것.
- PRODUCT §5 item 2의 "frames do not link to each other" 수정. 연결이 실제로 동작하는 하위 2가 고친다.
- 주입 스크립트(`prototypeScript.ts`)의 수정. 하위 2가 같은 규칙을 그 안에 따로 둔다.
