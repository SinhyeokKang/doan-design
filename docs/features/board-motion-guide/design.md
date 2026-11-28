# 보드 클릭·모션 안내 — design

## 영향 범위

- **CLI(Go, 임베드 텍스트)**:
  - `cli/internal/cli/skill.md`(guide): 'Canvas conventions' 또는 'Agent rules'에 보드 상호작용 규칙 한 줄. 규칙 F(Prototypes)와 이어지게 둔다.
  - `cli/internal/designskill/presets/animate.md`, `delight.md`: 'Apply the change in Doan'의 트리거 문장을 바꾼다. preset 버전(`catalog.json`)을 올린다(끝 표지 `v<version>`).
  - 다른 preset에서 보드 클릭을 전제하는 문장이 있는지 찾는다(`rg -n -i 'trigger|replay|click|interactive' cli/internal/designskill/presets`).
- **테스트**: `cli/internal/cli/skill_test.go`(예산), `cli/internal/designskill/designskill_test.go`(짝, 출처, 표지).
- **eval**: 새 시나리오 하나(`eval/scenarios/<id>/`, `/agent-eval` 스킬의 id 규칙).
- **앱, 형식, `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분

- 없다. 텍스트 변경이다. 대신 검증은 예산 테스트, preset 테스트, eval 시나리오가 맡는다(`/tdd` 대상: eval 시나리오의 check와 fixture, 예산 테스트가 새 텍스트로 통과).

## 안내 문장 (초안, 영어 본문은 구현 때 다듬는다)

- guide 규칙(새 줄, 짧게): 보드의 보통 클릭은 선택이 되고 캔버스에 닿지 않는다. 보드에 누르는 컨트롤(재생, 토글, 탭)을 만들지 말고, 상태는 나란히 그리며, 모션과 클릭 동작은 `data-doan-prototype` 프레임에 만들어 사람이 Play로 재생하게 한다.
- `animate.md` 107행 대체: "implement the motion in a prototype-marked frame (`data-doan-prototype`, the guide's rule 14) that plays it on load or on a click inside the played frame; never put a replay control or click trigger on the board, where clicks select instead of reaching the canvas."
- `delight.md` 82행 대체: 같은 취지.
- 보드에서 허용(사용자 결정): 로드 때 재생과 반복 애니메이션, CSS `:hover` 트리거. preset 문장은 "a visible trigger (hover, focus, or a replay control)"에서 focus와 replay control을 빼고, 클릭이 필요한 트리거는 프로토타입 프레임으로 보낸다.
- 확인할 가정: 주입 스크립트가 iframe의 포인터 이벤트를 가져도 CSS `:hover`는 hit test로 정해지므로 보드에서 동작한다고 본다. T2 전에 격리된 실제 앱에서 확인한다.

## 출력 예산

- guide 21,641 / 22,000 bytes(번들 줄 포함 전). 새 줄을 넣으려면 다른 문장을 줄여야 할 수 있다. 줄이는 문장은 뜻을 바꾸지 않는다(postmortem: Codex는 긴 출력의 가운데를 잘라 끝 표지로는 손실을 알 수 없다).

## 형식, 규약, 결정에 미치는 영향

- ARCHITECTURE §1 'Conventions'의 agent rules가 guide와 같은 내용을 담으므로, 승격 때 §1에 같은 규칙을 적는다.
- PRODUCT 변경 없음(보드의 클릭 규칙은 이미 PRODUCT §5 item 4에 있다).
- `/agent-eval` 필수(AGENTS.md 'Workflow': guide 변경).

## postmortem에서 가져온 주의점

- guide와 preset 출력 예산(Codex가 가운데를 자름): `skill_test.go`의 예산 테스트가 통과해야 한다.
- 구현 때 `rg -n -i 'budget|guide' docs/postmortem/`로 guide 관련 항목을 다시 확인한다.

## 읽은 design preset

- `animate`, `delight`(바꿀 대상으로 읽음).
