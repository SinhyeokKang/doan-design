# 검사 범위 — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261126-1](../chain-261126-1/chain.md) 링크 1(check-scope). 권한과 로그인 규칙은 체인 파일을 따른다.
- 시작 해시: `7e8f22f75` (origin/develop과 같다)
- 통합 브랜치: `feat/check-scope` (lead가 만들었다)
- 전제: comment-trim은 develop에 머지됐다(`fa680f913`, PR #396).

## 결정 기록

- 기능 문서에 '확인 필요' 항목이 없다. 사용자에게 미리 물을 것은 없다 — conductor 판단, 근거: 체인 '시작 점검'.
- 배치 나누기와 모델 선택 — conductor 판단, 근거: 아래 배치 표의 파일 소유와 난이도.
- 새 eval 시나리오 id는 `/agent-eval` 스킬의 id 규칙대로 워커가 정한다 — conductor 판단, 근거: tasks T4 "예: W14".
- T5(통합 검증, `/agent-eval`)와 T6(승격)은 conductor가 한다. 실제 Claude 턴 전에 체인 '로그인' 절차로 로그인을 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T0, T1, T2 | `cli/internal/check/`, `cli/internal/cli/check.go`·`check*_test.go`·`run.go`·`sessions*.go`, 새 golden fixture | — | Claude Opus high. 공유 CSS 중복 제거와 범위 판정이 맞물려 틀리면 결과가 조용히 사라진다 | `go test ./...`, `go vet ./...`, red→green, T0 golden 불변 | 대기 |
| B | T3 | `cli/internal/cli/skill.md`·`skill_test.go`, `cli/internal/designskill/presets/`·`design_skill_test.go`, `schema/fixtures/cli-envelope/design-skill/`, `app/src/main/conversation/prompt.ts`와 그 테스트 | — | Codex `gpt-6.1-sol` medium. 문구를 같은 형태로 바꾸는 기계적 작업이다 | `go test ./...`, `npm --prefix app test` | 대기 |
| C | T4 | `eval/` (새 시나리오, `eval/lib/transcript.ts`와 테스트) | A 통합(시나리오 pass fixture가 범위 검사를 쓴다) | Codex `gpt-6.1-sol` high. 판단보다 단계가 많다(seed, 검사, fixture 둘, self-test) | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 대기 |
| 리뷰 | 배치마다 | 읽기 전용 | 각 배치 완료 | 배치 A: Claude Opus medium, B·C: Claude Sonnet medium | `/code-review` 🔴 0 | 대기 |
| T5 | 통합 검증, `/agent-eval` | `docs/usability-eval/` | A·B·C 통합 | conductor | `verify.mjs --eval`, 새 시나리오 두 계열 통과 | 대기 |
| T6 | 승격과 정리 | PRODUCT, ARCHITECTURE, README, 기능 디렉터리 삭제 | T5 | conductor | 세 문서에 새 규칙, 디렉터리 없음 | 대기 |

## 파일 겹침과 순서

- A와 B는 같은 패키지 `cli/internal/cli/`를 건드리지만 파일이 겹치지 않는다(A는 check·run·sessions, B는 skill). 병렬로 돈다.
- C는 A가 통합된 뒤 시작한다. B와는 겹치지 않는다.
- answer-popover 링크와는 겹치지 않는다(체인 '순서').

## 모델 계열 교차

- 체인 '상시 권한'의 허가로 배치 워커에만 Codex를 쓴다: B(Sol medium), C(Sol high). 리뷰 워커와 A는 Claude다.
- 링크 시작 시 Codex 사용률: 5h 2%, 7d 1%.
