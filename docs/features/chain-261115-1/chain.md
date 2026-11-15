# chain-261115-1

## 규칙

- 진행 방식은 [/chain](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다.
- 이 파일은 리드만 쓴다. 컨덕터는 시작할 때 읽고, 이 파일이 말하는 곳에서만 `/orchestrate` 기본값 대신 이 파일을 따른다.
- 세 링크는 상위 feature [prototype-frame-links](../prototype-frame-links/spec.md)의 하위다. 상위 문서의 작업 체크는 리드가 develop에서 한다. 컨덕터는 상위 문서를 고치지 않는다.
- 세 링크 사이에 릴리스를 끼우지 않는다(상위 spec '하위 feature'). 하위 1만 병합된 develop에는 에이전트에게 알리지 않은 규약이 있고, 하위 2까지 병합된 develop에서는 내보낸 파일의 연결이 아무 일도 하지 않는다.

## 순서

직렬이다. 링크 2는 링크 1의 묶음 계산(`links.ts`, fixture)을 쓰고, 링크 3은 링크 1의 `LinkGroups`와 링크 2의 클릭 판정 표를 쓴다.

1. **prototype-link-convention** — 병합됨(#204, 7e2fc2c0d). feature 문서는 승격 뒤 지웠다.
   - 리뷰: `/feature-review`를 반영했다(35a114974). 화면이 없어 초안은 없다.
   - 먼저 가는 이유: 규약, `doan check` 규칙, 묶음 계산, 공유 fixture를 정한다. 다른 두 링크가 이것을 쓴다.
   - `chain-261114-2`와 겹치는 코드 파일이 없다(이 링크는 `cli/internal/canvas`, `cli/internal/check`, `schema/fixtures/prototype-links/`, `app/src/main/prototype/links.ts`). 그래서 그 체인을 기다리지 않는다.
2. **prototype-link-play** — [spec](../prototype-link-play/spec.md) · [design](../prototype-link-play/design.md) · [tasks](../prototype-link-play/tasks.md)
   - 리뷰: 반영했다(bd88853da). 초안 `.doan/canvases/prototype-link-play.html`은 독립 리뷰를 거쳐 사용자가 확정했다(b69fd0e37).
   - 시작 조건: 링크 1이 병합되고, `chain-261114-2`의 링크 3(`canvas-edit-awareness`, 가이드)과 링크 4(`canvas-mark-accent`, `CanvasController.ts`·`App.tsx`)가 병합된 뒤.
3. **prototype-link-export** — [spec](../prototype-link-export/spec.md) · [design](../prototype-link-export/design.md) · [tasks](../prototype-link-export/tasks.md)
   - 리뷰: 반영했다(942f69911). 새 화면이 없어 초안은 없다(성공 토스트 문구 한 구절만 바뀜).
   - 시작 조건: 링크 2 병합 뒤.

## 시작 점검

링크 1을 시작하기 전에 리드가 사용자와 한 번에 정하고, 승인을 '인계 기록'에 적는다. 그 뒤 컨덕터는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **명령 미정 항목**: 링크 2 작업 1 PoC의 검증 명령 `node .scratch/prototype-link-play/poc.mjs`(모든 경우가 기대대로면 exit 0). 기대와 다르면 컨덕터가 관찰을 커밋하고 멈춰 사용자에게 묻는다.
2. **링크 안에서 사용자가 확인할 것**(링크 진행 중 컨덕터가 사용자에게 직접 묻는다):
   - 링크 2: 가이드 문구와 줄일 곳(design.md '가이드 예산' 표).
   - 링크 3: 성공 토스트 문구("Exported “<frame>” and 2 linked frames." 형식), `--json` 새 필드 이름.
   - 링크 3: Safari에서 내보낸 파일을 한 번 열어 보기(병합을 막지 않는다).
3. **`/agent-eval`**:
   - 링크 2는 전체 라운드를 돌린다. 새 W9나 기존 시나리오의 자동 검사가 `--repeat 2` 뒤에도 실패하면, 사용자가 열린 이슈로 받아들이지 않는 한 병합을 막는다.
   - 링크 3은 X2를 돌린다. 막는 기준은 같다.
   - 링크 1은 돌리지 않는다(링크 2가 함께 잰다, 사용자 확인).

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 `gate`가 통과하면 링크 순서대로 develop에 병합하고 다음 링크를 시작한다.
- 컨덕터는 Claude다. **모델 경계**: 사용자가 2026-11-15 이 체인의 세 링크 모두에 Codex 워커를 허가했다. 컨덕터는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고, 각 링크의 `orch.md`에 쓴 범위를 적는다.

## 진행 규칙

[/chain](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기 루프는 `/orchestrate` §2를 따른다.
- 실제 프로바이더 로그인은 필요 없다. 링크 2·3의 실제 앱 probe는 격리한 앱(임시 userData·HOME·SHELL·`DOAN_RUNTIME`)으로 한다. `/agent-eval`은 eval 러너가 자기 임시 저장소에서 실제 Claude Code와 Codex를 돌린다(AGENTS.md 'Commands').
- `chain-261114-2`가 함께 돈다. 링크 2는 그 체인의 링크 3·4 병합을 기다린다. 링크 1·3은 그 체인과 겹치는 코드 파일이 없지만, 병합 시점에 겹치는 공유 문서는 `/ship` 'Lead' 4단계대로 푼다.

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| prototype-link-convention | claude · `prototype-link-convention-orch`(제거됨, `feat/prototype-link-convention` 유지) | 2026-11-15 | [#204](https://github.com/SinhyeokKang/doan-design/pull/204) · 7e2fc2c0d | 병합 |
| prototype-link-play | claude · `prototype-link-play-orch` (`feat/prototype-link-play`) | 2026-11-15 | — | 진행 |
| prototype-link-export | — | — | — | 대기 |

## 인계 기록

- 2026-11-15 리드 세션: 체인 파일을 썼다. 시작 점검 1–3은 아직 사용자 승인 전이다. 체인은 사용자가 시작을 말할 때 시작한다.
- 2026-11-15 리드 세션: 사용자가 이 체인의 세 링크 모두에 Codex 워커를 허가했다.
- 2026-11-15 리드 세션: 사용자가 이 체인을 다른 리드 세션에 맡겼다. 이 세션은 `chain-261114-2`를 마무리하고 릴리스를 준비한다. 시작 점검 1–3은 아직 사용자 승인 전이고, 링크는 하나도 시작하지 않았다. 링크 2는 `chain-261114-2`의 링크 3·4가 병합된 뒤에 시작할 수 있다. 상위 `prototype-frame-links`의 작업 1–3은 끝났다(체크됨).
- 2026-11-15 이전 리드 세션: `chain-261114-2`가 모두 병합되었다(#199, #201, #200, #202). 링크 2의 시작 조건(그 체인의 링크 3·4 병합)이 충족되었다. 다섯 프로바이더가 로그인된 프로필 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`는 사용자 요청으로 지우지 않고 남겼다(다음 체인이 씀). 쓰고 나서 로그아웃과 삭제는 그 체인이 사용자와 정한다.
- 2026-11-15 새 리드 세션: 이 체인을 넘겨받았다. 사용자가 시작 점검 1–3을 적힌 그대로 승인하고 시작을 지시했다. 링크 1을 `origin/develop`(08a79b565, 0.1.13 릴리스 뒤)에서 시작했다. 다른 실행 중인 컨덕터나 열린 PR은 없다.
- 2026-11-15 새 리드 세션: 링크 1을 병합했다(#204, 7e2fc2c0d, `gate` 통과). 링크 2·3이 알아야 할 것은 #204 본문 'For links 2 and 3'에 있다. 요약하면 다음과 같다.
  - 가이드(`cli/internal/cli/skill.md`)는 아직 그대로다. 클릭 동작 문장과 PRODUCT §5 항목 2의 "frames do not link to each other" 수정은 링크 2가 한다.
  - DOM에서 읽는 쪽은 디코딩된 속성 값을 비교하고, 속성 이름을 소문자로 다루고, `<template/>`를 뒤를 숨기는 열린 template로 다룬다(fixture가 고정한다).
  - `linkGroups`는 id와 값을 원문 그대로 받는다. 보드 `layout`이 id를 200 UTF-16 단위로 자르므로, 링크 2는 그런 프레임을 자르지 말고 빼고 넘겨야 한다.
  - 미검증: fixture `html`은 아직 실제 DOM에서 돌지 않았다(링크 2의 주입·보드 스크립트, 링크 3의 `isolate.js`가 처음 읽는다). `/agent-eval`은 링크 2 라운드가 새 check 규칙을 함께 잰다.
  - 링크 1은 Codex를 체인 권한 안에서 썼다(링크 시작 때 Codex 주간 사용량 46%).
- 2026-11-15 새 리드 세션: 링크 2를 `origin/develop`(7e2fc2c0d, 링크 1 병합 뒤)에서 시작했다.
