# small-ui-tweaks — orch

- 계획: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261106](../chain-261106/chain.md) 링크 3.
- 시작 hash: `c0b6078e`(origin/main). 통합 branch: `feat/small-ui-tweaks`.
- 지휘자: Claude Code(small-ui-tweaks-orch). 작업자는 모두 Claude다. Codex 주간 한도 94% 사용(2026-11-11 초기화)이고 이 링크에 `/agent-eval`이 없어 Codex를 쓰지 않는다.

## 결정 기록

- 사람에게 물을 점은 없다. 해석이 갈리던 점은 design '결정' 1–9에 있고, `/feature-review` 생략과 R1 (b)의 대체는 체인 '시작 점검 승인' 6·7이다.
- R1 (b): 사람 확인 대신 녹화와 rAF 프레임 측정을 남기고, design §2.2 성능 기준(60fps, 프레임 간격 약 16ms)에 맞으면 지휘자가 병합한다(시작 점검 7). 16ms를 넘는 프레임이 늘면 원인을 보고 지휘자가 판단한다(시작 점검 4).
- 지휘자 판단 — batch 나누기: `styles.css`를 고치는 항목 1·3·4(A2·U1·U3·U4)를 한 batch(S)로, 점 무늬 항목 2(A1·U2)를 다른 batch(F)로 둔다. 두 batch는 파일이 겹치지 않아 나란히 돈다. 근거: orchestrate §0 4(같은 파일은 나란히 돌리지 않음).
- 지휘자 판단 — R1과 Z1은 한 작업자(RZ)가 통합 뒤에 한다. Z1의 DESIGN.md 값이 R1 측정값이기 때문이다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| S | A2, U1, U3, U4 | `homeComposer.ts`(+test), `ComposerParts.tsx`, `HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `styles.css`, `Home.test.tsx`, `ProjectOverview.test.tsx`, `CanvasConversationPanel.test.tsx`, `ShellSidebar.test.tsx`, `ds/checks.test.ts` | 없음 | Sonnet high — CSS와 문장 조각은 규칙이 정해져 있고, 세 화면을 같은 방식으로 바꾸는 일이라 판단은 적지만 단계가 많다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| F | A1, U2 | `dotField.ts`(+test), `agentIndicator.ts`(+test), `CanvasAgent.tsx`(+`CanvasAgent.test.tsx`, `CanvasAgent.hooks.test.tsx`) | 없음 | Sonnet high — 점대칭과 가까운 자리 계산은 design §2.2·§3에 식이 있고, 틀리면 테스트가 잡는다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| VS | S 리뷰 | 없음(보고만) | S | Opus medium — 세 화면의 접근 이름·key·tooltip이 그대로인지와 CSS 값을 독립으로 판단해야 한다 | `/code-review` 보고 | 대기 |
| VF | F 리뷰 | 없음(보고만) | F | Opus medium — reduced motion의 "자리 없음"과 겹친 곳 최대값을 독립으로 판단해야 한다 | `/code-review` 보고 | 대기 |
| RZ | R1, Z1 | `.scratch/runtime-test/small-ui-tweaks/`, `docs/DESIGN.md`, `docs/features/small-ui-tweaks/` 삭제(orch.md 제외, 지휘자가 지움) | S·F 통합 | Opus medium — 격리된 실제 앱 probe, 녹화, rAF 측정, 측정값을 DESIGN.md에 옮기는 판단 | `/runtime-test` 증거, Z1 `rg` 검증 | 대기 |
| — | R2 | 지휘자 | RZ | — | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

tasks의 체크박스 항목: A1·U2 → F, A2·U1·U3·U4 → S, R1·Z1 → RZ, R2 → 지휘자. D1a–D3은 이미 끝났다. 주인 없는 항목은 없다.

## 겹침과 순서

- S와 F는 파일이 겹치지 않아 나란히 돈다. App 테스트의 `window.doan` mock에는 `onConversationHandoff`가 있어야 한다(링크 2 인계).
- 리뷰(VS·VF)는 각 batch가 끝나는 대로 돈다. 🔴가 0이 되면 통합한다.
- RZ는 S·F를 `feat/small-ui-tweaks`에 통합한 뒤 그 branch에서 시작한다.
- 병합 전: `feat/small-ui-tweaks`를 최신 `origin/main` 위로 rebase하고, 그 HEAD에서 `/verify`를 돌린다(체인 '운영 메모').
