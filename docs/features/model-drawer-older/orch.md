# model-drawer-older — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인 [chain-261106](../chain-261106/chain.md)의 링크 1.
- 시작 hash: `a5e8196c`(turn-activity 병합 `d936d157` 위의 시작 점검 커밋).
- 통합 브랜치: `feat/model-drawer-older`.
- 지휘자: Claude Code(Opus), Orca worktree `model-drawer-older-orch`.

## 결정 기록

- 열린 결정 없음 — 지휘자 판단: spec·design의 동작은 모두 사용자 결정 또는 `/feature-review` 반영으로 정해져 있고(`e8d9cd33`), 초안은 사용자가 확정했다(`b7fe41ea`).
- Codex 작업자를 쓰지 않는다 — 지휘자 판단: 가장 최근 Codex rollout에 주간(10080분) 창이 없어 남은 양을 확인할 수 없고, 이 링크는 작다.
- task 1–3을 한 batch로 묶는다 — 지휘자 판단: 2는 1의 `ModelOption.older`를, 3은 2의 view를 쓴다. 나누면 작업자가 서로 기다린다.
- task 4a와 4b를 한 batch로 묶는다 — 지휘자 판단: 둘 다 build한 앱을 격리해 띄우고, 4b는 4a가 고친 뒤의 모양을 본다.
- task 5(승격)는 지휘자가 통합 뒤 문서 커밋으로 한다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 1, 2, 3 | `app/src/main/conversation/models.ts`(+test), `app/src/renderer/homeComposer.ts`(+test), `newConversationSettings.ts`(+test), `ComposerParts.tsx`(+test), `SettingsAgents.tsx`(+test), `styles.css`, fixture | — | Claude Opus medium: 분류 규칙의 경계와 Radix 메뉴의 포커스·scroll 보정은 판단이 들지만 범위가 좁다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| RA | A의 `/code-review` | 읽기만 | A | Claude Opus medium: 모델 선택이 Default로 돌아가는 회귀를 잡아야 한다 | 보고 | 대기 |
| B | tasks 4a, 4b | 4a가 고치는 A의 renderer 파일, `docs/DESIGN.md`, `.scratch/` probe | A 통합 | Claude Opus medium: computed style 비교와 IPC handler 교체 probe는 단계가 많다 | `/design-sync` 보고, `/runtime-test` 스크린샷·probe 결과 | 대기 |
| — | task 5 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, feature 디렉터리 삭제 | B 통합 | 지휘자 | tasks 5의 검증 | 대기 |

## 겹침과 순서

A → RA → (A 수정) → 통합 → B → 통합 → `/verify` → task 5 → rebase·`/verify` → push·PR → 병합. 모든 batch가 renderer 파일을 함께 고치므로 직렬이다.
