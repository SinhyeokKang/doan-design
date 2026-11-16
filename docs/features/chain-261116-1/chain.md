# chain-261116-1

## 규칙

- 진행 방식은 [/chain](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다.
- 이 파일은 리드만 쓴다. 컨덕터는 시작할 때 읽고, 이 파일이 말하는 곳에서만 `/orchestrate` 기본값 대신 이 파일을 따른다.

## 순서

두 링크는 병렬 그룹 하나다. 둘 다 최신 `origin/develop`에서 함께 시작하고, PR은 링크 순서대로 병합한다.

겹침 점검(각 design의 영향 파일 기준):
- 링크 1이 고치는 파일: `app/src/main/conversation/`(service, store, types, summary, state, 새 `drawnCanvases`), renderer의 `threadItems.ts`, `turnStatus.ts`, `overviewRun.ts`, `handoffView.ts`, `revealDecision.ts`, `ConversationThread.tsx`, `styles.css`, 초안 `.doan/canvases/canvas-drawing-cards.html`(읽기만).
- 링크 2가 고치는 파일: `app/src/main/prototypeScript.ts`, `cli/internal/export/viewer/isolate.js`, `cli/internal/check/`, `cli/internal/cli/skill.md`와 그 테스트, `app/src/main/exportViewer.test.ts`, `eval/scenarios/W12/`.
- 겹치는 코드, 테스트, schema, skill, 초안 파일이 없다. 공유 문서(PRODUCT, ARCHITECTURE, `docs/design/`, BACKLOG, USABILITY-EVAL)는 겹침으로 치지 않는다. 나중에 병합하는 쪽이 `/ship` 'Lead' 4단계대로 충돌을 푼다.

1. **canvas-drawing-cards** — [spec](../canvas-drawing-cards/spec.md) · [design](../canvas-drawing-cards/design.md) · [tasks](../canvas-drawing-cards/tasks.md)
   - 리뷰: `/feature-review` 네 관점을 반영했다(f70cfe47).
   - 초안: `.doan/canvases/canvas-drawing-cards.html`. 사용자가 Doan 앱에서 직접 고친 뒤 확정했다(0c2eabd8, 기록 c4a7f462). tasks 0(초안)은 끝났으므로 컨덕터는 건너뛴다.
   - 먼저 병합하는 이유: 링크 2보다 크고 화면이 바뀐다. 링크 2는 공유 문서만 겹치므로 순서가 결과를 바꾸지 않는다. 링크 1을 먼저 병합해 `docs/design/conversation.md`와 PRODUCT 'Handoff' 재작성을 먼저 굳힌다.
2. **prototype-authoring-contract** — [spec](../prototype-authoring-contract/spec.md) · [design](../prototype-authoring-contract/design.md) · [tasks](../prototype-authoring-contract/tasks.md)
   - 리뷰: `/feature-review` product·tech·qa를 반영했다(a7ddc7d5). 사람이 보는 화면이 없어 uxui와 초안은 없다. 평가 시나리오 W12를 더했다(43bcb4e8).

## 시작 점검

링크를 시작하기 전에 리드가 사용자와 한 번에 정하고, 승인을 '인계 기록'에 적는다. 그 뒤 컨덕터는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **로그인**(링크 1): tasks 8의 `/runtime-test`는 실제 턴이 새 캔버스 두 개를 만드는 경우를 본다. Doan 연결 Claude Code 로그인이 필요하다. 리드가 시작 점검에서 아래 '로그인'대로 만든다. 사용자가 로그인을 원하지 않으면, 실제 턴이 필요한 항목은 확인하지 못한 항목으로 남기고 병합을 막지 않는다.
2. **링크 안에서 사용자가 확인할 것**(컨덕터가 직접 묻는다):
   - 링크 1: 카드 문구 최종본(`canvasCardText`). 초안의 문구를 그대로 쓰면 묻지 않는다.
   - 링크 2: 가이드 문구와 예산 때문에 줄일 곳(design '가이드 문구 초안').
3. **`/agent-eval`**
   - 링크 2: W 계열 전부(W12 포함)와 X2. 자동 검사가 `--repeat 2` 뒤에도 실패하면, 사용자가 열린 이슈로 받아들이지 않는 한 병합을 막는다. W7·W11·W12에서 질문으로 멈추는 것도 실패로 본다.
   - 링크 1: 돌리지 않는다. 가이드, CLI 출력, `doan check` 규칙, skill stub을 바꾸지 않는다(AGENTS.md 'Workflow'의 `/agent-eval` 조건). 컨덕터가 바꾸게 되면 리드에게 알리고 X 또는 해당 시나리오를 돌린다.
4. **확인하지 못해도 병합을 막지 않는 항목**: 링크 2의 실제 휴대폰 Safari 확인(BACKLOG에 남긴다), ACP 프로바이더의 편집 경로(링크 1, BACKLOG 기존 항목에 더한다).

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 `gate`가 통과하면 링크 순서대로 develop에 병합한다. 링크 2의 PR이 먼저 준비돼도 링크 1이 병합된 뒤에 병합한다.
- 컨덕터는 Claude다. 모델 경계를 넘는 허가는 없다(Codex 워커 없음). `/agent-eval`이 Codex를 돌리는 것은 AGENTS.md의 상시 예외다.

## 로그인

- 링크 1의 실제 앱 probe는 실제 HOME의 프로바이더 로그인이 아니라 Doan 연결 로그인을 쓴다. 리드가 시작 점검에서 만든다.
- 로그인한 userData는 메인 체크아웃의 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 워크트리가 다르기 때문이다.
- 링크는 그것을 다시 쓰고, 지우거나 바꾸는 probe에는 복사본을 쓴다. 새 로그인을 청하기 전에 먼저 그 디렉터리를 확인하고, 링크마다 로그아웃하지 않는다.
- 마지막 링크의 PR이 오면, 리드가 병합 전에 로그아웃하고 Keychain 항목이 없어졌는지 확인한 뒤 그 userData를 지운다.

## 진행 규칙

[/chain](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기 루프는 `/orchestrate` §2를 따른다.
- 링크 2의 실제 앱 probe는 격리한 앱(임시 userData·HOME·SHELL·`DOAN_RUNTIME`)으로 한다. 로그인이 필요 없다.
- `/agent-eval`은 eval 러너가 자기 임시 저장소에서 실제 Claude Code와 Codex를 돌린다. 먼저 `npm --prefix app run package`가 필요하다(AGENTS.md 'Commands').
- 링크 2의 검증 게이트는 `--eval`을 붙인다(W12 시나리오).

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| canvas-drawing-cards | — | — | — | 대기 |
| prototype-authoring-contract | — | — | — | 대기 |

## 인계 기록

- 2026-11-16 · 리드(Claude, develop): 체인 파일을 썼다. 사용자 요청은 파일 작성까지이고, 시작 점검과 링크 시작은 사용자가 시작을 요청할 때 한다.
