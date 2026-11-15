# prototype-link-export — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261115-1](../chain-261115-1/chain.md) 링크 3(마지막)
- 시작 해시: `92c8a1853` (`origin/develop`, 링크 1·2 병합 뒤)
- 통합 브랜치: `feat/prototype-link-export`
- 모델 교차: 체인 상시 권한(사용자 2026-11-15, 세 링크 모두 Codex 워커 허가). 링크 시작 때 Codex 주간 사용량 52%(`rate_limits` `window_minutes: 10080`, Orca `CODEX_HOME`의 최신 rollout). 쓴 범위는 아래 배치 표에 적는다.

## 결정 기록

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | 성공 토스트 문구 | 연결이 있으면 `Exported “<frame>” and N linked frames. The file also contains the rest of the canvas.`, 1개면 `and 1 linked frame`. 연결이 없으면 지금 문구 그대로. | 사용자(시작 점검 2) |
| 2 | `--json` 새 필드 | `linkedFrames`: 시작 프레임을 뺀 묶음의 프레임 수. `--prototype`일 때만 있고(`prototype: true`와 같은 규칙), 연결 없는 프레임은 0. 기존 `frames`는 그대로. | 사용자(시작 점검 2) |
| 3 | 사람용 텍스트 출력(`Exported … frame … to …`) | 바꾸지 않는다. | 컨덕터 판단 — spec은 `--json` 필드만 말하고, 기존 출력을 바꾸지 않는 쪽이 범위가 작다 |
| 4 | 가이드 문장 | 바꾸지 않는다. "plays only that frame"이 없는지만 확인한다. | spec '하지 않는 것', 완료 조건 13 |

## 배치

| 배치 | 항목 | 맡는 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| PoC | tasks 1 | `.scratch/prototype-link-export/`, design.md 관찰 | — | 컨덕터 | `node .scratch/prototype-link-export/poc.mjs` exit 0 | 대기 |
| X | tasks 2 | `cli/internal/cli/export.go`, `cli/internal/canvas/prototype_rules.go`(필요 시), `cli/internal/export/assemble.go`, `cli/internal/export/viewer/*`, `app/src/renderer/canvasExport.ts`, `app/src/renderer/canvasRowMessages.ts`, `app/src/main/exportViewer.test.ts`, Go export 테스트 | PoC | Claude Opus high — 링크 의미 복제, 기록·iframe 수명, 바이트 고정 테스트가 얽혀 판단이 많고 틀리면 받는 사람 파일이 깨진다 | tasks 2 검증 명령 | 대기 |
| X 리뷰 | X diff `/code-review` | 보고만 | X | Codex `gpt-6-astra` medium — 교차 계열 독립 리뷰 | 🔴 0 | 대기 |
| 통합·확인 | tasks 3–7 | 통합 커밋, 문서 승격 | X | 컨덕터 | 각 작업의 검증 | 대기 |

## 파일 겹침과 순서

배치 X 하나만 코드를 고친다. PoC 관찰(특히 sandbox iframe의 `window.name`)이 X의 전달 방식을 정하므로 PoC 다음에 X를 띄운다. 통합 확인(3–6)은 X 통합 뒤 직렬이다.

## tasks 대응

- 1 → PoC · 2 → X · 3–7 → 통합·확인
