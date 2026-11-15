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
| G | 작업 1·2·3 | `schema/fixtures/prototype-links/cases.json`, `cli/internal/canvas/{canvas.go,canvas_test.go,links.go,links_test.go}`, `cli/internal/check/{check.go,check_test.go}` | 없음 | Claude Opus high: fixture 경우가 많고(surrogate, 판정 순서, 중첩 프레임 스택) 틀리면 링크 2·3이 모두 그 위에 선다 | `go test ./...`, `go vet ./...` | 통합(775e160ef–8b3b3da4b), 수정 1회(⚪ 문자 참조 fixture) |
| G-review | G 리뷰 | 없음(보고만) | G | Codex gpt-6-astra medium: 판단이 필요한 교차 계열 리뷰 | `/code-review` 보고서 | 완료: 🔴 0 · 🟡 0 · ⚪ 1 |
| T | 작업 4 | `app/src/main/prototype/{links.ts,links.test.ts}` | G 통합(fixture) | Codex gpt-6.1-sol medium: fixture를 읽는 연결 요소 계산으로 판단이 적다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` | 통합(38c16504a–70e65e24c), 수정 1회(⚪ 주석, 반복 `root`) |
| T-review | T 리뷰 | 없음(보고만) | T | Claude Sonnet high: 작은 TS diff의 교차 계열 리뷰 | `/code-review` 보고서 | 완료: 🔴 0 · 🟡 0 · ⚪ 3(⚪ 3은 조치 안 함: 경우 수 고정은 fixture 갱신마다 테스트를 고치게 한다) |
| 컨덕터 | 작업 5·6 | 통합 커밋, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, feature 디렉터리 삭제 | G·T 통합 | — | tasks.md 작업 5·6의 검증 | 대기 |

## 파일 겹침과 순서

- G와 T는 파일이 겹치지 않지만 T가 G의 fixture를 읽으므로 직렬이다: G → G 리뷰·수정 → 통합 → T → T 리뷰·수정 → 통합 → 컨덕터 작업 5·6.
- tasks.md의 체크 항목 1–6은 위 표의 행에 하나씩 대응한다(1·2·3 → G, 4 → T, 5·6 → 컨덕터).

## 통합과 검증 기록

- 작업 5 probe: 현재 소스로 빌드한 CLI(`go build -o <scratch>/doan ./cli/cmd/doan`)와 임시 저장소, 임시 `DOAN_RUNTIME`으로 `doan check --json`을 돌렸다. exit 4, `ok: true`. `goto_*` finding은 넷이다: `goto_target_not_found`(home, nowhere), `goto_target_shared`(home, dup), `goto_target_not_prototype`(home, plain), `goto_outside_prototype`(frame 없음, detail). 그 밖의 error는 예상한 `duplicate_frame_id`(dup)뿐이다. 정상 연결(home↔detail)은 finding이 없다.
- 워커 워크트리 `plc-g`, `plc-t`는 Orca로 지웠다. 브랜치 `SinhyeokKang/plc-g`(e6798f7ae)와 `SinhyeokKang/plc-t`(e1a118e3f)는 남겼다. handoff와 리뷰 보고서는 컨덕터 `.scratch/plc/`에 복사했다.
