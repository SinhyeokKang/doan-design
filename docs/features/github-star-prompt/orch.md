# github-star-prompt — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인: [chain-261113-1](../chain-261113-1/chain.md) 링크 1.
- 시작 해시: `28d0a3b3` (origin/develop).
- 통합 브랜치: `feat/github-star-prompt` (lead가 만듦, worktree `github-star-prompt-orch`).
- conductor 런타임: Claude Code. 모델 계열을 넘지 않는다.

## 결정 기록

- 사용자에게 새로 물을 것은 없다. 제품 결정은 spec·design에 있고, 시작 점검 승인은 체인 파일 '인계 기록'에 있다.
- conductor 판단 — 배치를 하나로 둔다. 근거: tasks 2–5가 모두 `app/src/main/index.ts`, `App.tsx`, `styles.css`, 토스트 파일을 건드려 나눌 수 없다.
- conductor 판단 — 토스트 나가는 모션의 방식(닫힘 120ms 미루기 또는 `display` allow-discrete)은 design.md가 `/tdd`에 맡겼으므로 워커가 정하고 handoff에 적는다.
- conductor 판단 — 승격 위치(PRODUCT §5 item 0 또는 item 1)는 승격 때 conductor가 정한다.
- conductor 판단 — GUI probe(`/design-sync`, `/runtime-test`) 전에 워커가 `ask`로 알리고, conductor가 lead에 `GUI again`을 보낸 뒤 답한다. GUI가 끝나면 conductor가 `GUI done`을 보낸다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2 (`/tdd`), 3 (`/implement`), 4 (`/design-sync`), 5 (`/runtime-test`), 자체 `/code-review`·`/refactor` | `app/` 전체, `docs/DESIGN.md`(측정값) | 없음 | Opus high — main·renderer 연결, 포커스·접근성, 모션, 상태 파일이 얽혀 판단이 많고 틀리면 사용자 화면이 깨진다 | `npm --prefix app test`·`typecheck`·`lint`·`build`, tasks 3의 `rg` 확인, design-sync 보고서, runtime-test 보고서·스크린숏 | 대기 |
| R | A의 diff 독립 검토(`/code-review`, 보고만) | 없음(읽기) | A | Opus high — IPC 허용 목록, 저장 파일 경쟁, 포커스 회귀를 판단해야 한다 | 🔴 0 | 대기 |
| conductor | tasks 6 (`/verify`), 7 (승격과 정리) | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/github-star-prompt/` 삭제 | A·R 통합 | — | `node .agents/skills/verify/scripts/verify.mjs` PASS, tasks 7의 `rg`·`test` 확인 | 대기 |

- tasks 1(초안)은 이미 끝났다(`5bfc1ec8`).
- 겹침: A만 코드를 바꾼다. 병렬 배치는 없다. R의 수정은 A 워커에게 돌려보낸다.
