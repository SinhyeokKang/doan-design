# audit-261025 수정 지휘

- 수행일: 2026-10-25
- 시작 커밋: `eb33f92` (앱·CLI·eval 기준 `28615ca`)
- 통합 브랜치: `feat-audit-261025`
- 원본: [코드 감사](report.md), [UX 감사](../ux-audit-261025/report.md)
- Run: `run_d5096c0e0da3`
- 순서: 두 리포트 인수 완료 → audit 근거 검토·수정·검증·병합 → ux-audit 검토·수정·검증·병합. UX 수정 워커는 audit 병합 뒤 시작한다.
- 사용자 승인: 수정 지휘·푸시·병합 및 필요시 Claude 워커 사용. 현재 리뷰 워커는 Codex를 사용한다.

## 결정 및 검토 원칙

- 보고서의 확정 표시는 정적 판단이다. 재현하지 못한 실행 주장을 통과로 바꾸지 않는다.
- 지휘자가 각 항목을 채택·기각·결정 대기·미재현으로 정리한다. 추측에 기반한 수정, 인접 리팩터링, 문서화된 의도의 임의 변경을 금지한다.
- A-M1: 불확실한 저장 요청의 전용 종료 경고를 사용자에게 질문했다. 응답 전에는 해당 동작을 구현하지 않는다.
- A-L15: 저장 후 attempts를 단순 삭제하면 요청 불변성과 중복 저장 방지가 깨질 수 있다. 불변식을 보존할 수 있는지 먼저 검토한다.
- A-L1·A-L9·A-L16 및 UX 결정 항목은 기존 결정과 대조한다. 이미 정해진 동작은 새로 묻지 않는다.
- 런타임·전체 검증·stress는 지휘자가 직렬로 예약한다. 검토 워커는 실행이 필요하면 근거와 최소 재현 절차를 보고한다.

## 배치

| 배치 | 항목·파일 소유권 | 선행 | 모델·effort와 근거 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|
| R-contract | A-M1~M5, A-L1~L3, L6, L9, L10, L14~L16. 소스 읽기와 `.scratch/audit-integration-261025/review-contracts.md`만 작성 | 두 리포트 인수 | Codex gpt-6-astra medium. 저장 불확실성·경로·수명 주기 계약의 독립 판단 | 항목별 근거, 기존 결정, 최소 수정, 검증 방법, 거짓 양성 명시 | 준비 |
| R-harness | A-M6, A-L4~L5, L7~L8, L11~L13, L17~L25. 소스 읽기와 `.scratch/audit-integration-261025/review-harness.md`만 작성 | 두 리포트 인수 | Codex gpt-6-astra medium. 실행 경계·평가 판정·회귀 검증의 독립 판단 | 모든 지정 ID의 판정, 실행 없이 확정할 수 없는 범위 구분 | 준비 |
| C | CLI 경로·init 수정. `cli/` 및 직접 필요한 fixture | R-contract 지휘자 판정 | 미정: 확정 범위에 맞춰 선택 | red→green Go 회귀 테스트, Go test/vet, 필요시 agent-eval | 대기 |
| E | eval 격리·정상 대안 판정. `eval/` | R-harness 지휘자 판정 | 미정 | red→green runner/scenario tests, self-test | 대기 |
| A | 앱 계약·수명 주기 수정. `app/src/` | 리뷰 및 필요한 사용자 결정 | 미정 | red→green 단위 테스트, 통합 runtime | 대기 |
| H | e2e 검증 허점. `app/e2e/` | R-harness 지휘자 판정, A의 테스트 소유권 확정 | 미정 | 하네스 회귀 근거, full runtime의 자체 PASS·exit 0 | 대기 |
| IR | 각 구현 diff 독립 code-review. 소스 수정 금지 | 구현 handoff | 미정 | 실제 커밋·handoff 대조, red 0까지 소유자 수정 | 대기 |
| G | 통합·문서·푸시·병합 | 모든 구현·리뷰 | 지휘자 | `/verify --runtime --eval`, 필요한 실제 agent-eval, 스크린샷 확인 | 대기 |

## 병렬·직렬 및 커버리지

R-contract와 R-harness는 같은 checkout에서 소스를 읽고 서로 다른 scratch 파일만 쓴다. 구현 파일 소유권과 모델은 리뷰 후 확정해 이 문서에 먼저 커밋한다. 구현 워커는 소유 파일이 겹치지 않게 자식 worktree를 사용한다. 이 문서의 R 배치에 A-M1~M6과 A-L1~L25를 모두 배정했다. UX 발견과 중복된 항목의 해결 여부는 UX 단계에 전달한다.

## 실행 기록

- 두 최종 보고서를 인수했고 보고서별 커밋 `024b229`, `eb33f92`를 main에 push했다.
- 코드 수정과 실행 검증은 아직 시작하지 않았다.
