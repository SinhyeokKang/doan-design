# 보드 클릭·모션 안내 — spec

## 사용자

- **에이전트**: `doan skill` guide와 `doan design-skill`의 preset을 읽고 캔버스를 그리는 Claude Code, Codex 등. 보드에 클릭으로 동작하는 요소(모션 재생 버튼 등)를 만들지 않고, 클릭이 필요한 동작과 한 번 도는 모션은 프로토타입으로 만들도록 안내받는다.
- **사람**: 앱에서 캔버스를 보는 사람. 누를 수 없는 "Replay" 버튼 대신, 정지 상태로 그린 상태들, 보드에서 반복하거나 hover로 도는 모션, Play로 재생하는 프로토타입 프레임을 받는다. 답변이 어느 프레임을 Play하면 되는지 알려 준다.

## 문제 (관찰)

- 에이전트가 캔버스에 모션 재생 버튼을 만들고 사람에게 누르라고 한다(사용자 보고).
- 보드에서 Select 도구의 보통 클릭은 캔버스 동작을 막는다(PRODUCT §5 item 4 "Ordinary clicks suppress canvas actions"). 클릭은 선택이 되고 버튼은 반응하지 않는다. Option-click만 캔버스에 닿는데, 사람이 알기 어려운 조작이다.
- 원인: `animate` preset이 "implement the motion in canvas CSS with a visible trigger (hover, focus, or a replay control)"라고 안내한다(`cli/internal/designskill/presets/animate.md:107`). `delight` preset도 "implement it in canvas CSS with a visible trigger"라고 한다(`delight.md:82`). guide(`cli/internal/cli/skill.md`)에는 보드의 클릭이 막힌다는 말이 없다. 다른 preset에서 보드 클릭을 직접 권하는 문장은 없다(polish·critique의 "working controls", onboard의 tour 문장은 upstream의 일반 문장이라 고치지 않고 guide 규칙이 덮는다).
- 보드는 iframe을 문서 높이에 맞추므로 스크롤 기반 트리거(`animation-timeline: scroll()`, IntersectionObserver reveal)도 보드에서는 의도대로 돌지 않는다(ARCHITECTURE §1 규약 11, §3 'Canvas view' Height). `animate.md`가 scroll-driven motion을 안내한다.
- 프로토타입(`data-doan-prototype`, guide 규약 14·15, 규칙 F)은 클릭과 스크립트가 콘텐츠에 닿는 별도 창에서 재생된다.

## 확정한 결정 (사용자)

- 캔버스(보드)에 클릭해야 동작하는 요소를 만들지 않게 한다.
- 클릭이 필요한 동작과 동적인 요소는 프로토타입 기능을 쓰도록 유도한다.
- 보드에서 쓰는 모션은 반복 애니메이션과 CSS `:hover` 트리거(Select 도구에서 동작)다. 로드 때 한 번만 도는 모션과 스크롤 기반 트리거는 프로토타입 프레임으로 보낸다(보드에서는 놓치기 쉽고, 에이전트가 쓸 때마다 다시 돈다).
- 금지하는 것: 클릭이 필요한 트리거(재생·토글·탭 버튼, 클릭으로만 생기는 `:focus`·`:active`·`:checked`·`:target`, `<details>`, `popovertarget`, click·pointerdown·mousedown 핸들러)를 보드(프로토타입 표시가 없는 영역)에 두는 것.
- 기존 프레임에 클릭 동작이나 한 번 도는 모션을 더해 달라는 요청이면, 그 프레임에 `data-doan-prototype`을 붙이고 그 안에 만든다(내용을 두 벌 그리지 않는다).
- 모션이나 동작을 만든 답변은 어느 프레임을 Play하면 되는지 말하고, 열기 제안을 `doan open <canvas> --frame <id> --prototype`으로 한다. 이 안내는 preset의 Doan 절에 둔다(guide는 예산 여유가 없다).
- `doan check` 규칙은 더하지 않는다.

## 완료 조건

1. guide에 보드에서는 보통 클릭이 캔버스에 닿지 않으니 클릭으로 동작하는 요소를 만들지 말라는 규칙이 있고, 클릭 동작과 한 번 도는 모션은 프로토타입으로 만들라고 한다. 반복과 `:hover`는 보드에서 써도 된다고 한다.
2. `animate`와 `delight` preset의 'Apply the change in Doan'이 replay control과 클릭 트리거를 권하지 않는다. 세 갈래로 안내한다: 정지 상태를 나란히 그리기, 보드의 반복이나 `:hover`, 클릭이 필요하거나 한 번 도는 모션(스크롤 기반 포함)은 프로토타입 프레임. 답변에서 Play할 프레임과 `--prototype` 열기 제안을 말하라고 한다.
3. 보드(Select 도구)에서 캔버스의 CSS `:hover`가 실제로 동작한다(실기 확인). 동작하지 않으면 사용자에게 알리고 `:hover` 허용을 다시 정한다.
4. guide와 preset 출력이 출력 예산(`skillOutputBudget` 22,000 bytes, plain과 `--json` 각각 번들 줄 포함) 안에 있다. 지금 `--json` 기준 여유는 약 4 bytes라, 새 문장만큼 다른 문장을 줄인다. 줄인 문장의 조건과 예외는 계약 테스트로 원래 뜻을 지킨다.
5. `/agent-eval`의 새 시나리오 W15에서 Claude Code와 Codex 모두 보드에 클릭 트리거를 만들지 않고, 요청한 클릭 동작을 프로토타입 표시가 있는 프레임 안에 만든다. 정지 상태만 그리면 partial이다(규칙 F: 요청한 상호작용을 만든다). 에이전트마다 1회 돌리고, 실패하면 `--repeat`로 2회 더 돌린다. 바꾸기 전 baseline 회차에서는 이 시나리오가 실패한다.
6. 회귀 시나리오(W13 보드 entrance animation, D5 "don't add animation", W7·W8·W11·W12 프로토타입)가 회귀하지 않는다.

## 하지 않는 것

- `doan check` 규칙 추가(guide 텍스트는 check 규칙을 더하지 않는다, ARCHITECTURE §6 'Guide'). 보드의 클릭 처리 변경.
- 이미 있는 캔버스의 재생 버튼 정리.
- upstream에서 온 일반 preset 문장 수정.
