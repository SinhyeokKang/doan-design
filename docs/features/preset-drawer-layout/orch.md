# preset-drawer-layout — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261128-1](../chain-261128-1/chain.md) 링크 2(병렬 그룹)
- 시작 hash: 7ffe758fa (origin/develop, canvas-message PR #430 머지 뒤)
- 통합 브랜치: `feat/preset-drawer-layout`
- lead: Orca 터미널 `term_5c6f3df9-e154-40fd-8bed-93db4aac80a1`

## 결정 기록

- 새로 물을 제품 결정 없음 — 컨덕터 판단: spec '확정한 결정'과 design '드래프트에서 정한 것'이 구조, 폭, 머리, 높이, 문구를 모두 정했다.
- T1(드래프트)은 끝났다(a0f779e46, 3574c42c8). 이 run은 T2–T5를 맡는다.
- README Presets 이미지(T5)는 확정 드래프트를 기준으로 구현과 병렬로 그린다 — 컨덕터 판단: 파일이 겹치지 않고, 드래프트가 이 화면의 기준이다. design-sync에서 드래프트와 다른 점이 생기면 이미지를 다시 맞춘다.
- `/agent-eval` 필요 없음(tasks.md: 에이전트가 보는 것이 바뀌지 않는다).

## 모델 계열 넘기

- 허락: chain 상시 권한(링크 2의 모든 작업에 Codex 사용 가능).
- 시작 때 Codex 주간 사용량 16%(`~/.codex` 최신 rollout `window_minutes: 10080`, 2026-11-28 10:45).
- 실제로 쓴 범위: 아래 배치 표의 Codex 행.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T2, T3, T4 `/design-sync` | `app/src/renderer/homeComposer.ts`, `ComposerParts.tsx`, `styles.css`(프리셋 드로어 구역), `ds/surfaces.css`, 관련 테스트, `drawnTarget.test-support.ts`, `ds/checks.test.ts`, `docs/design/conversation.md`, `docs/DESIGN.md` | 없음 | Claude Opus high — sticky·role=group·키보드·hover 선택자 등 여러 화면에 걸친 판단, 틀리면 Quick Open·`/` 목록 회귀 | `npm --prefix app test`, `typecheck`, `lint`, design-sync 측정 | 대기 |
| B | T5 README Presets 프레임 | `.doan/canvases/readme-features.html`(Presets 프레임), `docs/assets/readme/presets.png` | 없음 | Codex Sol medium — 확정 드래프트를 옮겨 그리는 기계적 작업, 판단이 적다 | `doan check`, 이미지 500 KB 이하 | 완료(2a8f22e07, 0f27e6f0a), 리뷰 대기 |
| R | A·B 리뷰 | 없음(보고만) | A, B | Codex Astra medium — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| 컨덕터 | T4 `/runtime-test`, `/verify`, T5 PRODUCT·BACKLOG 승격과 기능 디렉터리 삭제 | `docs/PRODUCT.md`, `docs/BACKLOG.md`, 이 디렉터리 | A, B, R | — | `verify.mjs`, 실기 probe | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다.
- 링크 2의 다른 컨덕터와는 `styles.css`만 겹친다(구역이 다르다). 나중에 머지되는 PR이 `origin/develop`을 받는다.
- 실기 GUI probe(A의 design-sync, 컨덕터의 runtime-test)는 링크 2 컨덕터들과 Orca 메일로 순서를 맞춘다.

## tasks 대응

- T1 → 끝남(이 run 밖). T2, T3, T4 design-sync → A. T4 runtime-test·verify → 컨덕터. T5 README → B. T5 PRODUCT·`docs/design/conversation.md`·`docs/DESIGN.md`·BACKLOG·삭제 → 컨덕터(conversation.md·DESIGN.md의 측정값은 A가 design-sync에서 고친다).

## 진행

- Orca run `run_f406066db68e`. A: dispatch `ctx_de92796bad81`, worktree `pdl-a`(브랜치 `SinhyeokKang/pdl-a`), claude-opus-5-5 high. B: dispatch `ctx_7df66d2b6911`, worktree `pdl-b`(브랜치 `SinhyeokKang/pdl-b`), codex gpt-6.2-sol medium(`models_cache.json`의 최신 Sol). 둘 다 4d420c4bc에서 시작했다.
- 링크 2 컨덕터 터미널(lead 메일): subagent-progress `term_a5aad700-…`, board-motion-guide `term_dab6eb10-…`, canvas-thumbnail-frame `term_4e90d3c8-…`. 실기 probe는 시작 전에 알린다. board-motion-guide가 `/agent-eval`을 도는 동안 격리하지 않은 Doan.app을 띄우지 않는다(격리 Playwright는 괜찮다).

- B 완료: `doan check` 오류 0, frame id 9개 그대로, PNG 1900 × 1226 RGB 373,526 B. `doan export --frame`은 `--prototype`(HTML)만 받아, Playwright Chromium 1.25배 요소 캡처 + oxipng로 내보냈다. 컨덕터가 PNG를 직접 봤다.
