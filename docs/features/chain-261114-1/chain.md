# chain-261114-1

## 규칙

- 진행 방식은 [/chain](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다.
- 이 파일은 리드만 쓴다. 컨덕터는 시작할 때 읽고, 이 파일이 말하는 곳에서만 `/orchestrate` 기본값 대신 이 파일을 따른다.

## 순서

직렬이다. 두 링크가 같은 코드를 고친다(`app/src/renderer/Onboarding.tsx`, `projectStep.ts`, `AddProjectsPage.tsx`, `app/src/main/index.ts`, 그 테스트들, 그리고 초안 `.doan/canvases/new-project-folder.html`).

1. **project-step-actions** — [spec](../project-step-actions/spec.md) · [design](../project-step-actions/design.md) · [tasks](../project-step-actions/tasks.md)
   - 리뷰: new-project-folder의 `/feature-review`와 그 뒤 부작용 점검(2026-11-14)에서 나온 결정으로 만든 feature다. 따로 `/feature-review`를 돌리지 않았다(시작 점검 1).
   - 초안: 공유 초안의 `card-busy`, `shipped-notices-*` 다섯 프레임과 모든 프레임의 하단 줄·버튼 크기·알림 모양. 사용자가 2026-11-14 시각적으로 확인했다.
   - 먼저 가는 이유: 출시된 Project 단계(알림 자리·모양, 하단 'Add project', 버튼 크기)를 바꾸고, 링크 2가 그 위에 New folder를 더한다. 출시 알림 회귀가 New folder diff에 섞이지 않게 PR을 나눈다.
2. **new-project-folder** — [spec](../new-project-folder/spec.md) · [design](../new-project-folder/design.md) · [tasks](../new-project-folder/tasks.md)
   - 리뷰: `/feature-review` 반영(f01ae5f16), 초안 독립 리뷰, 부작용 점검을 거쳤다.
   - 초안: New folder 프레임(card-add-projects, card-first-run, save-panel, notice-*, after-create)을 링크 1이 적용된 모양으로. 사용자가 2026-11-14 시각적으로 확인했다.
   - tasks 1의 PoC(macOS 저장 창의 Replace)를 먼저 돈다. 결과가 '이미 있음' 문구를 바꾸게 하면 초안 수정과 사용자 확인을 거친다.

## 시작 점검

링크 1을 시작하기 전에 리드가 사용자와 한 번에 정하고, 승인을 '인계 기록'에 적는다. 그 뒤 컨덕터는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. project-step-actions는 별도 `/feature-review` 없이 간다(부작용 점검이 그 역할을 했다).
2. 초안 최종 확인: 초안과 두 문서의 대조를 마친 뒤의 초안을 확정본으로 본다.
3. 링크 1의 `/design-sync`·`/runtime-test`에서 격리 앱으로 만들 수 없는 상태(로컬 git 서버가 필요한 클론 실패, CLI 거부가 필요한 설정 실패, 첫 실행 Project 단계)는 단위 테스트와 문서화된 차이로 둔다.
4. 두 링크 모두 provider 로그인이 필요 없다.

## 상시 권한

- 리드는 각 링크의 PR을 리뷰와 `gate`가 통과하면 링크 순서대로 develop에 병합하고 다음 링크를 시작한다.
- **모델 경계**: 사용자가 2026-11-14 이 체인의 두 링크 모두에 Codex 워커를 허가했다. 컨덕터는 Claude다. 컨덕터는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고, 각 링크의 `orch.md`에 쓴 범위를 적는다. 워커 모델 조합은 메모리 규칙을 따른다(Claude가 주, Codex를 섞음).

## 진행 규칙

[/chain](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기 루프는 `/orchestrate` §2를 따른다. Codex 워커는 용량 오류로 조용히 멈출 수 있다.
- `/agent-eval`은 두 링크 모두 해당하지 않는다. 에이전트가 읽는 문구(`cli/internal/cli/skill.md:53`, `active.go:30`, `open_rules.go:82`)가 바뀌는 라벨을 말하지 않는다. 각 PR 본문에 이유를 적는다.
- 같은 시각 리드는 `feat/cli-remove` 컨덕터도 돌린다. `app/src/main/index.ts`, `senderAllowed.ts`, `preload/index.ts`가 겹칠 수 있다. 나중에 병합되는 쪽이 `origin/develop`을 병합해 푼다.

## 링크 상태

| 링크 | 세션·워크트리 | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| project-step-actions | `project-step-actions-orch` (feat/project-step-actions), Claude 컨덕터 | 2026-11-14, bb4447737 | — | 진행 |
| new-project-folder | — | — | — | 대기 |

## 인계 기록

- 2026-11-14 리드 세션: 체인 파일을 썼다. 사용자가 시작 점검 1–4를 그대로 승인했다. 링크 1은 초안과 두 문서의 대조가 끝나 커밋된 뒤 시작한다.
