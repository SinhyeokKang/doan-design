# 보드 클릭·모션 안내 — design

## 영향 범위

- **CLI(Go, 임베드 텍스트)**:
  - `cli/internal/cli/skill.md`(guide): 보드 상호작용 규칙. 규약 14의 기존 문장("Start in the default state; draw an open tooltip or dialog as its own frame")과 합치거나 규칙 F에 이어 붙여 바이트를 아낀다. 자리는 구현에서 예산을 보고 정한다.
  - `cli/internal/designskill/presets/animate.md`, `delight.md`: 'Apply the change in Doan'의 트리거 문장을 세 갈래로 바꾸고 Play 안내를 더한다. preset별 버전은 없다(끝 표지의 `v<version>`은 CLI 버전이고, `catalog.json`은 `DisallowUnknownFields`로 읽어 필드를 더하면 로드가 실패한다).
- **테스트**: `cli/internal/cli/skill_test.go`(예산 `TestSkillGuideFitsToolOutputCap`, plain과 `--json`), guide 새 규칙의 문구 고정(`TestSkillGuide…`), `cli/internal/designskill/designskill_test.go`의 `TestPresetsKeepAgentEvalFixes`에 animate·delight 문구 고정.
- **eval**: 새 시나리오 `eval/scenarios/W15/`(쓰기 계열, 아직 없는 id).
- **앱, 형식, `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분

- 없다. 텍스트 변경이다. `/tdd` 대상은 W15의 check와 fixture, guide·preset 문구 고정 테스트다.

## 안내 문장 (초안, 영어 본문은 구현 때 다듬는다)

- guide 규칙: 보드의 보통 클릭은 선택이 되고 캔버스에 닿지 않는다. 보드에는 클릭으로 동작하는 컨트롤을 두지 않는다. 보드의 모션은 반복이나 `:hover`로 하고, 클릭 동작과 한 번 도는 모션은 `data-doan-prototype` 프레임에 만든다.
- `animate.md` 107행 대체(세 갈래): 키 상태를 나란히 그리고 값을 주석으로 단다; 보드에서는 반복 애니메이션이나 `:hover` 트리거(Select 도구에서 동작)로 구현한다; 클릭이 필요한 모션, 한 번 도는 모션, 스크롤 기반 모션은 대상 프레임에 `data-doan-prototype`을 붙이고(guide 규약 14) 그 안에 만든다. replay control이나 클릭 트리거를 보드에 두지 않는다. 답변에서 Play할 프레임을 말하고 `doan open <canvas> --frame <id> --prototype`을 제안한다.
- `delight.md` 82행 대체: 같은 취지.
- 썸네일은 load 뒤 500 ms에 찍히므로(`thumbnailWindow.ts` `SETTLE_MS`) 보드의 모션은 기본 상태가 보이게 둔다는 기존 원칙(animate.md의 "visible default")을 해치지 않는다. Reduce Motion 대안을 주석으로 다는 기존 문장(animate.md:106)도 유지한다.

## 출력 예산

- 테스트는 plain과 `--json`을 각각 재고 `bundleNote`(166 B)를 더한다. 실측(설치된 v0.1.32, develop guide와 같음): plain 약 21,807 B, `--json` 약 21,996 B(테스트 기준 환산). 여유는 약 4 bytes다.
- 새 문장만큼 다른 문장을 줄인다. postmortem 2026-10-29 Follow-up대로 줄인 문장의 조건·예외를 원래 계약과 대조하고, 계약 테스트를 유지한다.

## eval W15

- 과제: 기존 캔버스의 한 프레임에 "버튼을 누르면 카드가 펼쳐지는 모션을 보여 달라".
- 자동 check: 프로토타입 표시가 없는 영역에서 `onclick`, `addEventListener('click'|'pointerdown'|'mousedown')`, `:focus`·`:active`·`:checked`·`:target` 트리거, `<details>`, `popovertarget`를 찾으면 fail. 대상 프레임(또는 그 모션을 담은 프레임)에 `data-doan-prototype`이 있어야 한다. `doan check`가 통과한다. 원본 외 프레임은 바이트 단위로 같다.
- judge(rubric): 그림 속 `<button>`처럼 정적으로 가릴 수 없는 것, 정지 상태만 그렸으면 partial, 답변이 Play할 프레임을 말했는지.
- fixture: pass(표시한 프레임 안의 click handler, 보드의 반복 애니메이션과 `:hover`), fail(표시 없는 프레임의 replay 버튼, `:focus` 트리거).
- 회귀: W13, D5, W7, W8, W11, W12. ARCHITECTURE §14에는 W15가 특수한 메커니즘을 쓸 때만 더한다.

## 형식, 규약, 결정에 미치는 영향

- ARCHITECTURE §1 'Conventions'의 agent rules가 guide와 같은 내용을 담으므로, 승격 때 §1에 같은 규칙을 적는다.
- PRODUCT 변경 없음(보드의 클릭 규칙은 이미 PRODUCT §5 item 4에 있다).
- `/agent-eval` 필수(AGENTS.md 'Workflow': guide 변경).

## 확인할 가정

- 보드의 CSS `:hover`: Select에서는 캔버스가 자기 pointer move를 받으므로 동작할 것이다. Hand에서는 누르기가 drag layer에 떨어지므로 동작하지 않을 가능성이 높다. 그래서 안내는 "Select 도구에서"라고 적는다. T1b에서 확인한다.

## postmortem에서 가져온 주의점

- 2026-10-29 Follow-up(guide 줄이기): 조건과 예외를 원래 계약과 대조하고 계약 테스트를 유지한다.
- guide와 preset 출력 예산(Codex가 가운데를 자름): `skill_test.go`의 예산 테스트가 통과해야 한다.

## 읽은 design preset

- `animate`, `delight`(바꿀 대상으로 읽음).
