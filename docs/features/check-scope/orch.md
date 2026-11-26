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
| A | T0, T1, T2 | `cli/internal/check/`, `cli/internal/cli/check.go`·`check*_test.go`·`run.go`·`sessions*.go`, 새 golden fixture | — | Claude Opus high. 공유 CSS 중복 제거와 범위 판정이 맞물려 틀리면 결과가 조용히 사라진다 | `go test ./...`, `go vet ./...`, red→green, T0 golden 불변 | 완료, 리뷰 🔴0 🟡0 ⚪5, 통합 |
| B | T3 | `cli/internal/cli/skill.md`·`skill_test.go`, `cli/internal/designskill/presets/`·`design_skill_test.go`, `schema/fixtures/cli-envelope/design-skill/`, `app/src/main/conversation/prompt.ts`와 그 테스트 | — | Codex `gpt-6.1-sol` medium. 문구를 같은 형태로 바꾸는 기계적 작업이다 | `go test ./...`, `npm --prefix app test` | 완료, 리뷰 🔴1 🟡1 → 수정 1회차로 해소, 통합 |
| C | T4 | `eval/` (새 시나리오, `eval/lib/transcript.ts`와 테스트) | A(시나리오 pass fixture가 범위 검사를 쓴다). A 리뷰와 겹치게 A 브랜치 끝에서 시작했다 | Codex `gpt-6.1-sol` high. 판단보다 단계가 많다(seed, 검사, fixture 둘, self-test) | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 완료, 리뷰 🟡2 → 수정 1회차로 해소, 통합 |
| 리뷰 | 배치마다 | 읽기 전용 | 각 배치 완료 | 배치 A: Claude Opus medium, B·C: Claude Sonnet medium | `/code-review` 🔴 0 | 대기 |
| T5 | 통합 검증, `/agent-eval` | `docs/usability-eval/` | A·B·C 통합 | conductor | `verify.mjs --eval`, 새 시나리오 두 계열 통과 | 대기 |
| T6 | 승격과 정리 | PRODUCT, ARCHITECTURE, README, 기능 디렉터리 삭제 | T5 | conductor | 세 문서에 새 규칙, 디렉터리 없음 | 대기 |

## 파일 겹침과 순서

- A와 B는 같은 패키지 `cli/internal/cli/`를 건드리지만 파일이 겹치지 않는다(A는 check·run·sessions, B는 skill). 병렬로 돈다.
- C는 A의 동작이 필요해서 A 브랜치 끝(`3169518f6`)을 기준으로 시작했다. 통합할 때는 C 자신의 커밋만 가져온다. B와는 겹치지 않는다.
- answer-popover 링크와는 겹치지 않는다(체인 '순서').

## 모델 계열 교차

- 체인 '상시 권한'의 허가로 배치 워커에만 Codex를 쓴다: B(Sol medium), C(Sol high). 리뷰 워커와 A는 Claude다.
- 링크 시작 시 Codex 사용률: 5h 2%, 7d 1%.

## 진행 기록

- A 결정(워커): `checkInput`의 internal_error에서도 읽은 캔버스로 세션을 기록한다(기존 세션 테스트와 spec 6의 인자 없는 동작 불변). 경로 오류에서는 기록하지 않는다. 리뷰에서 판단을 받는다.
- B: 범위 밖 `app/src/main/mcpConnectors/pty.test.ts:30`이 한 번 실패했다. 다시 돌려 보게 했다.
- C 시작 시 Codex 사용률: 5h 14%, 7d 2%.
- C seed(conductor 판단): tasks T4의 "두 캔버스가 함께 링크한 공유 CSS"로는 CSS 경로를 넘기면 오류 있는 관계없는 캔버스도 범위에 들어 exit 0이 될 수 없다. 대상 + 정상 동반 캔버스가 공유 CSS를 링크하고, 오류 있는 관계없는 캔버스는 링크하지 않는 세 캔버스 seed로 바꿨다. spec 완료 조건 10은 그대로 판정한다.
- A 리뷰(Opus medium): 🔴 0, 🟡 0, ⚪ 5. 고치지 않고 통합한다. 리뷰가 올린 두 결정은 conductor가 정했다.
  - 세션 기록: 경로 오류로 끝나면 기록하지 않고, `checkInput` 읽기 실패는 지금처럼 읽은 캔버스를 기록한다. 근거: spec 완료 조건 6·8. T6에서 ARCHITECTURE에 이 규칙으로 적는다.
  - `.doan/Config.json`과 지운 CSS 인자는 적힌 표기로 맞춘다(대소문자를 접지 않는다). 근거: spec 완료 조건 7은 CSS·설정에 심볼릭 링크와 루트 별칭만 풀라고 한다. 에이전트는 자기가 쓴 표기를 넘긴다.
- B 리뷰(Sonnet medium): 🔴 1, 🟡 1, ⚪ 2. B에 수정 1회차를 보냈다(시작 시 Codex 5h 24%, 7d 4%).
  - 🔴 `eval/scenarios/R8d·R9b·R10·R11·R12/prompt.md`가 옛 턴 프롬프트 문장이라 `node --test 'eval/**/*.test.ts'`가 5건 실패한다. 프롬프트를 바꾼 B가 고친다. C와 파일이 겹치지 않으므로 B의 소유를 이 다섯 파일까지 넓혔다.
  - 🟡 `skill.md`의 줄인 `doan check` 설명은 리뷰가 낸 예산 안 문구로 바꾼다. ⚪1(경로 없는 표현 검사의 정규식 확장)도 고친다. ⚪2(규칙 설명 문장)는 그대로 둔다.
  - audit 프리셋(`audit.md:103`, 검토 전용): "감사한 캔버스와 CSS 경로"로 쓴다 — conductor 판단, 근거: spec 완료 조건 9의 같은 형태를 지키면서 편집이 없는 맥락에 맞춘다.
  - 캔버스·CSS·설정이 아닌 파일(`.doan/assets/`의 스크립트, 이미지)만 편집한 경우 넘길 경로가 없다. spec이 세 종류만 정했으므로 이번에는 문구를 두고 T6에서 BACKLOG 'Undecided'에 적는다.
- B 수정 1회차(`2a43e4861`)를 conductor가 직접 확인했다. 네 지적이 모두 반영됐다.
- T5 로그인(사용자 승인, 2026-11-26): 실제 HOME의 Claude 로그인은 아직 로그아웃이다. 사용자가 Doan 앱 프로필의 Claude 로그인(Keychain `Claude Code-credentials-9e813622`)을 refresh token까지 임시 `CLAUDE_CONFIG_DIR`과 임시 Keychain 항목에 복제해 `/agent-eval`에 쓰도록 허용했다. 끝나면 임시 홈과 항목을 지운다. 토큰이 갱신되면 Doan 앱의 Claude 로그인이 풀릴 수 있고, 사용자가 이 위험을 받아들였다.
- C 리뷰(Sonnet medium): 🔴 0, 🟡 2, ⚪ 3. C에 수정 1회차를 보냈다(시작 시 Codex 5h 45%, 7d 7%).
  - 나눠 돌린 단일 경로 검사도 인정한다: 성공한(exit 0) `doan check` 호출들의 경로 합집합에 편집한 두 경로가 있으면 통과다 — conductor 판단, 근거: 범위가 경로별 합집합이고(spec 1) exit는 돌려준 결과로만 정해지므로(spec 3) 보장하는 내용이 같다. tasks T4의 "어떤 실행이 두 경로를 넘겼다"는 이 판단으로 대신한다.
  - 실패한 검사 호출은 세지 않는다(🟡2). 편집 내용 자동 검사(⚪1)와 루트 별칭 경로 맞추기(⚪2)도 더한다.
  - 리뷰 환경에서 eval 실제 상태 가드가 `~/Library/Application Support/doan/ui-state.json`, `~/.gemini/antigravity-cli` 변경을 잡아 exit 1이었다. 실행 중인 설치 Doan 앱이 원인으로 추정되며 확인하지 않았다. T5 gate는 다른 앱이 조용할 때 돌린다.
- C 수정 1회차(`87f59e8ef`)를 conductor가 직접 확인했다. 워커의 마지막 게이트는 실제 상태 가드만 걸렸다(`canvas-seen.json`, `agent-auth`, `conversations`, 실행 중인 Doan 앱). T5에서 다시 돌린다.
