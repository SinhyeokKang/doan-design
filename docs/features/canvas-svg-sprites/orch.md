# canvas-svg-sprites — 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261112](../chain-261112/chain.md) 링크 1(병렬 그룹, 링크 2 `claude-turn-end`와 동시 진행)
- 시작 hash: `8e9c33e9` (origin/develop, PR #177 포함)
- 통합 브랜치: `feat/canvas-svg-sprites` (lead가 만들었다. conductor worktree `canvas-svg-sprites-orch`)
- 워커: Claude만(모델 계열 교차 권한 없음). `/agent-eval`의 다른 계열 판정은 AGENTS.md 상시 예외다.

## 결정 기록

- 시작 점검(사용자 승인, 2026-11-12, lead 브리프): Safari 확인은 사용자가 export 파일을 열고 스크린숏을 남긴다. `/agent-eval` 실제 라운드 승인. 격리 앱 창이 작업 중에 떠도 된다.
- conductor 판단 — PoC(작업 1·2)를 한 배치로 묶는다. 같은 임시 repo·격리 앱·export 명령을 쓰고, 결과가 작업 3 이전의 설계 수정 여부를 정한다.
- conductor 판단 — 작업 3·4(`/tdd`·`/implement`)를 한 배치로 묶는다. 같은 파일(`cli/internal/canvas`, `check`, `export`, `cli/check.go`)을 쓰고 테스트 커밋과 구현 커밋 경계는 배치 안에서 지킨다.
- conductor 판단 — 작업 5(가이드·preset)는 작업 3·4와 파일이 겹치지 않으므로 PoC 뒤에 병렬로 돌린다. 가이드에 넣을 대체 형태는 PoC 결과를 따른다.
- conductor 판단 — 작업 6은 시나리오 작성(BE1)과 실제 라운드(BE2)로 나눈다. BE1은 `/code-review`와 병렬로, BE2는 리뷰 수정이 통합된 뒤 새 Task로 보낸다. 시나리오의 fixture 판정이 새 check 규칙에 기대므로 BE1은 BC 통합 뒤 시작한다.
- conductor 판단 — 작업 6의 마지막 항목(격리 앱으로 인라인 스프라이트 캔버스와 export 파일 재비교)은 BP 워커에게 후속 Task로 보낸다.
- conductor 판단 — 작업 7(승격과 정리)은 conductor의 문서 커밋으로 한다(`/orchestrate` §4·§5).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BP | 작업 1, 2 (PoC) + 작업 6 마지막 재비교(후속 Task) | `.scratch/canvas-svg-sprites/`, `tasks.md` 'PoC 기록' | 없음 | Opus high — 측정 설계와 판정이 결과를 좌우하고, 틀리면 설계 전체가 흔들린다 | 경우별 스크린숏·bbox·요청 로그, export 파일 경로(Safari용) | 대기 |
| BC | 작업 3, 4 (`/tdd`, `/implement`) | `cli/internal/canvas/`, `cli/internal/check/`, `cli/internal/export/`(`exporttest` 포함), `cli/internal/cli/check.go` | BP | Opus high — check·export 일치, reach 포함 관계, tokenizer `<template>` 함정이 있다 | `go test ./...`, `go vet ./...`, `verify.mjs`, repo 복사본 `doan check` 새 finding 0 | 대기 |
| BG | 작업 5 (가이드·preset) | `cli/internal/cli/skill.md`, `cli/internal/designskill/presets/document.md` | BP | Sonnet medium — 정해진 문장을 예산 안에 넣는 작업이다 | `go test ./...`(`TestSkillGuideFitsToolOutputCap`), `doan skill --json` 출력 | 대기 |
| R | 작업 6 `/code-review` (BC+BG 통합 diff) | 보고만 | BC, BG 통합 | Opus high — check·export 판정 일치와 고아 제거를 독립적으로 판단해야 한다 | 🔴 0 | 대기 |
| BE1 | 작업 6 시나리오 | `eval/scenarios/<새 id>/`, `eval/` 테스트(`checks.test.ts` 등) | BC 통합 | Opus medium — fixture와 실패 조건 설계에 판단이 들지만 범위가 좁다 | `node eval/run.ts --self-test` PASS·exit 0, `node --test 'eval/**/*.test.ts'`, `verify.mjs --eval` | 대기 |
| BE2 | 작업 6 실제 `/agent-eval` 라운드 + `docs/USABILITY-EVAL.md` | `docs/USABILITY-EVAL.md` | R 수정 통합, BE1 통합 | BE1 워커 재사용 | `npm --prefix app run package`, `node eval/run.ts --round <name>` 전체 시나리오 | 대기 |
| 승격 | 작업 7 | PRODUCT, ARCHITECTURE, BACKLOG, `docs/features/canvas-svg-sprites/` 삭제 | 전부 | conductor | 완료 조건 1~7 대조, `git diff --stat origin/develop -- app/` 빈 결과, `rg` 잔여 없음 | 대기 |

## 파일 겹침과 순서

- BP → (BC ∥ BG) → (R ∥ BE1) → 수정 라운드 → BE2 → 승격.
- BC와 BG는 파일이 겹치지 않는다. BE1은 `eval/`만 쓴다.
- GUI probe: BP와 BP 후속 Task만 격리 앱을 띄운다. 링크 2도 앱 창을 띄울 수 있으므로 짧게 돌린다.
- 링크 2와 겹치는 코드·테스트·초안 파일은 없다(체인 파일 '병렬 판단').

## 검토 기록

(리뷰 라운드에서 채운다.)
