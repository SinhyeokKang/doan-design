# 보드 클릭·모션 안내 — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261128-1](../chain-261128-1/chain.md) 링크 2(병렬 그룹)
- 시작 hash: 7ffe758fa (origin/develop, canvas-message PR #430 머지 뒤)
- 통합 브랜치: `feat/board-motion-guide` (lead가 만들었다)

## 시작 실측

- guide 출력(번들 줄 166 B 포함): plain 21,807 B, `--json` 21,996 B. 예산 22,000 B라 `--json` 여유가 4 B다(design의 실측과 같다).
- Codex 주간 사용량: 16% 사용(rollout `rate_limits` window 10080, 2026-11-28).

## 결정 기록

- 사용자에게 새로 물을 결정은 없다. spec '확정한 결정'이 범위를 정했다.
- guide 규칙의 자리: 컨덕터 판단 — design이 "구현에서 예산을 보고 정한다"고 했으므로 B 워커가 정하고 리뷰에서 본다.
- W13 회귀: 컨덕터 판단 — W13의 `canvas_animated` 검사는 `data-doan-prototype` 표시와 무관하게 `@keyframes`·`animation`만 보므로, 새 규칙(한 번 도는 모션은 프로토타입)과 충돌하지 않는다. judge가 프로토타입으로 옮긴 hero를 감점하면 E가 보고하고 컨덕터가 rubric을 다시 본다.
- Codex 모델: `models_cache.json`의 최신인 `gpt-6.2-astra`(판단), `gpt-6.2-sol`(기계적)을 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T1a | `eval/scenarios/W15/**`, W15를 등록하는 데 필요한 `eval/` 파일, `docs/usability-eval/rounds-2026-11.md`(baseline 회차) | 없음 | Claude Opus high — 프로토타입 표시 없는 영역을 정적으로 가리는 check가 판단을 많이 요하고, 실제 에이전트 baseline 회차를 돌린다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W15`, baseline 회차 기록 | 진행 |
| B | T2 | `cli/internal/cli/skill.md`, `skill_test.go`, `cli/internal/designskill/presets/animate.md`, `delight.md`, `designskill_test.go` | 없음(C 결과에 따라 `:hover` 문장 조정) | Claude Opus high — 4 B 여유에서 문장을 줄이며 조건·예외를 지켜야 한다(postmortem 2026-10-29) | `go test ./...`, `go vet ./...`, `rg -n -i 'replay control\|visible trigger' cli/internal/designskill/presets` 비어 있음 | 진행 |
| C | T1b | `.scratch/`만 | 없음 | Claude Sonnet medium — 짧은 실기 probe, 판단 적음 | Select·Hand의 `:hover` computed style 관측값이 `.scratch/`에 있다 | 진행 |
| RA | A 리뷰 | 없음(보고만) | A | Codex gpt-6.2-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고 | 대기 |
| RB | B 리뷰 | 없음(보고만) | B | Codex gpt-6.2-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고 | 대기 |
| E | T3 | `docs/usability-eval/rounds-2026-11.md`(회차) | A·B 통합 | Claude Opus medium — eval 회차 실행과 판정 기록 | W15 양쪽 통과, 회귀 없음, 회차 기록 | 대기 |
| 컨덕터 | T4, 통합 `/verify --eval` | `docs/ARCHITECTURE.md`, `docs/USABILITY-EVAL.md`, 기능 디렉터리 삭제 | E | — | ARCHITECTURE §1에 규칙, 기능 디렉터리 없음 | 대기 |

## 겹침과 순서

- A·B·C는 파일이 겹치지 않아 병렬이다. A의 baseline은 B가 들어가기 전의 guide로 돌아야 하므로, A worktree에는 B를 넣지 않는다.
- E는 A·B를 통합한 `feat/board-motion-guide`에서 새 child worktree로 돈다. `rounds-2026-11.md`는 A가 먼저 쓰고 E가 이어 쓴다(직렬).
- 실기 GUI probe(C)는 링크 2의 다른 컨덕터들과 Orca mail로 시간을 맞춘다.

## Codex 사용 범위

- RA, RB(리뷰). 실제로 쓴 범위는 끝날 때 갱신한다.

## 진행 기록
