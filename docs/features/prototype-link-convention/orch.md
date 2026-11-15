# prototype-link-convention — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261115-1](../chain-261115-1/chain.md) 링크 1
- 시작 해시: `99c08d570`(origin/develop)
- 통합 브랜치: `feat/prototype-link-convention`(리드가 만들었다)

## 결정 기록

- 묻지 않고 정했다(컨덕터 판단). 근거는 spec·design이 이미 정한 범위다. 새 제품·범위 결정은 없었다.
  - 배치 나누기: Go(작업 1–3)를 한 배치로, TS(작업 4)를 그 뒤 한 배치로 둔다. fixture의 `codes`가 Go 규칙과 함께 정해지므로 fixture는 Go 배치가 만든다. TS 배치는 fixture가 통합된 뒤 시작한다(TS는 fixture를 읽기만 한다).
  - `/agent-eval`은 돌리지 않는다(체인 시작 점검 3, 사용자 확인).
- 모델 경계: 체인 상시 권한(사용자 2026-11-15)으로 Codex 워커를 쓴다.
  - 시작 시 Codex 주간 사용량: 46% 사용(`window_minutes: 10080`, Orca `CODEX_HOME`의 최신 rollout, 2026-11-14T21:34Z 기록).
  - 범위: TS 배치 구현(Sol, 기계적인 묶음 계산)과 Go 배치 독립 리뷰(Astra, 교차 계열 리뷰). Go 구현과 TS 리뷰는 Claude다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| G | 작업 1·2·3 | `schema/fixtures/prototype-links/cases.json`, `cli/internal/canvas/{canvas.go,canvas_test.go,links.go,links_test.go}`, `cli/internal/check/{check.go,check_test.go}` | 없음 | Claude Opus high: fixture 경우가 많고(surrogate, 판정 순서, 중첩 프레임 스택) 틀리면 링크 2·3이 모두 그 위에 선다 | `go test ./...`, `go vet ./...` | 대기 |
| G-review | G 리뷰 | 없음(보고만) | G | Codex gpt-6-astra medium: 판단이 필요한 교차 계열 리뷰 | `/code-review` 보고서 | 대기 |
| T | 작업 4 | `app/src/main/prototype/{links.ts,links.test.ts}` | G 통합(fixture) | Codex gpt-6.1-sol medium: fixture를 읽는 연결 요소 계산으로 판단이 적다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 대기 |
| T-review | T 리뷰 | 없음(보고만) | T | Claude Sonnet high: 작은 TS diff의 교차 계열 리뷰 | `/code-review` 보고서 | 대기 |
| 컨덕터 | 작업 5·6 | 통합 커밋, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, feature 디렉터리 삭제 | G·T 통합 | — | tasks.md 작업 5·6의 검증 | 대기 |

## 파일 겹침과 순서

- G와 T는 파일이 겹치지 않지만 T가 G의 fixture를 읽으므로 직렬이다: G → G 리뷰·수정 → 통합 → T → T 리뷰·수정 → 통합 → 컨덕터 작업 5·6.
- tasks.md의 체크 항목 1–6은 위 표의 행에 하나씩 대응한다(1·2·3 → G, 4 → T, 5·6 → 컨덕터).
