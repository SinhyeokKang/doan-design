# 보드 클릭·모션 안내 — spec

## 사용자

- **에이전트**: `doan skill` guide와 `doan design-skill`의 preset을 읽고 캔버스를 그리는 Claude Code, Codex 등. 보드에 클릭으로 동작하는 요소(모션 재생 버튼 등)를 만들지 않고, 모션과 동적인 동작은 프로토타입으로 만들도록 안내받는다.
- **사람**: 앱에서 캔버스를 보는 사람. 누를 수 없는 "Replay" 버튼 대신, 정지 상태로 그린 상태들과 Play로 재생하는 프로토타입 프레임을 받는다.

## 문제 (관찰)

- 에이전트가 캔버스에 모션 재생 버튼을 만들고 사람에게 누르라고 한다(사용자 보고).
- 보드에서 Select 도구의 보통 클릭은 캔버스 동작을 막는다(PRODUCT §5 item 4 "Ordinary clicks suppress canvas actions"). 클릭은 선택이 되고 버튼은 반응하지 않는다. Option-click만 캔버스에 닿는데, 사람이 알기 어려운 조작이다.
- 원인: `animate` preset이 "implement the motion in canvas CSS with a visible trigger (hover, focus, or a replay control)"라고 안내한다(`cli/internal/designskill/presets/animate.md:107`). `delight` preset도 "implement it in canvas CSS with a visible trigger"라고 한다(`delight.md:82`). guide(`cli/internal/cli/skill.md`)에는 보드의 클릭이 막힌다는 말이 없다.
- 프로토타입(`data-doan-prototype`, guide 규약 14·15, 규칙 F)은 클릭과 스크립트가 콘텐츠에 닿는 별도 창에서 재생된다. 모션과 동작은 이쪽이 맞다.

## 확정한 결정 (사용자)

- 캔버스(보드)에 클릭해야 동작하는 요소를 만들지 않게 한다.
- 모션 재생과 동적인 요소는 프로토타입 기능을 쓰도록 유도한다.
- 보드에서 클릭 없이 도는 모션은 허용한다: 로드할 때 시작하는 재생과 반복 애니메이션, CSS `:hover` 트리거. 금지하는 것은 클릭이 필요한 트리거다(재생·토글·탭 버튼, 클릭으로만 생기는 `:focus`·`:active`, click 핸들러).

## 완료 조건

1. guide에 보드에서는 클릭이 캔버스에 닿지 않으니 클릭으로 동작하는 요소(재생·토글·탭 전환 버튼 등)를 만들지 말라는 규칙이 있고, 클릭 동작과 재생이 필요한 모션은 프로토타입으로 만들라고 한다. 로드 때 재생과 `:hover`는 보드에서 써도 된다고 한다.
2. `animate`와 `delight` preset의 'Apply the change in Doan'이 replay control과 클릭 트리거를 권하지 않는다. 대신 정지 상태를 나란히 그리기, 로드 때 재생이나 `:hover` 트리거, 클릭이 필요한 동작은 프로토타입 프레임을 안내한다.
2a. 보드(Select 도구)에서 캔버스의 CSS `:hover`가 실제로 동작한다(실기 확인). 동작하지 않으면 `:hover` 허용을 빼고 사용자에게 알린다.
3. guide와 preset 출력이 출력 예산(`skillOutputBudget` 22,000 bytes, 번들 줄 포함) 안에 있다. 지금 guide는 21,641 bytes라 여유가 359 bytes뿐이다.
4. `/agent-eval`에서 모션을 요청하는 시나리오(새 id)로 Claude Code와 Codex 모두 보드에 클릭 트리거를 만들지 않고, 프로토타입 표시가 있는 프레임이나 정지 상태로 그린다.

## 하지 않는 것

- `doan check` 규칙 추가(guide 텍스트는 check 규칙을 더하지 않는다, ARCHITECTURE §6 'Guide'). 보드의 클릭 처리 변경.
- 이미 있는 캔버스의 재생 버튼 정리.
