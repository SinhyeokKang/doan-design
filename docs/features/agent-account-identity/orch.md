# agent-account-identity — orch

원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md).

- 시작 hash: `b76cdf0d` (main)
- 통합 브랜치: `feat-agent-account-identity`
- 모델 경계: 이 세션에 한해 사용자가 Codex 워커를 허가했다(2026-11-01). 구현은 Claude, 측정·교차 리뷰는 Codex로 나눈다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| 1 | P1 검증 명령으로 `.scratch/account-identity/codex-account-read.mjs`를 쓴다. 스크립트가 기기에 남아 있지 않아 P1 워커가 design §1 실측 절차(같은 인자, `experimentalApi: true`, `account/read`)로 다시 만든다 | 지휘자 판단 — 빈 임시 `CODEX_HOME`만 쓰고 실제 상태를 건드리지 않는다 |
| 2 | R1을 지휘자가 승인한다. `.scratch/provider-profile/userData`(Codex·Antigravity 포함 5개 연결)를 쓰고, 실행 직전 사용자에게 키체인 대화상자 가능성을 알린다 | 지휘자 판단 — tasks R1이 승인 주체를 코디네이터로 정했고, 같은 프로필을 실측 PoC에서 이미 썼다. 로그인·로그아웃은 하지 않는다 |
| 3 | R1 검증 명령은 `.scratch/runtime-test/agent-account-identity/` probe(`app/runtime/` 지원)다 | 지휘자 판단 — AGENTS 'Verification policy'의 짧은 실제 앱 probe |
| 4 | V1과 Z1은 지휘자가 한다 | orchestrate §4·§5: 통합 `/verify`와 승격은 지휘자 몫이고 문서만 바뀐다 |
| 5 | `.scratch/provider-profile/userData`를 이 실행이 끝나도 로그아웃하거나 지우지 않는다. `buzz-canvas-conversation` V2가 이어서 쓴다 | 사용자 지시(2026-11-01) |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | P1 | `.scratch/account-identity/`, `design.md` §1 Codex 절(측정 결과 줄) | — | Codex `gpt-6.1-sol` medium — 스크립트를 돌려 숫자를 적는 기계적 일 | 스크립트 5회 출력, design §1 결과 | 대기 |
| B | T1, M1 | `app/src/main/agentAuth/identity.ts`·`identity.test.ts`·`providers.ts`·`manager.ts`·`manager.test.ts`, `app/src/renderer/agentAuthView.ts`(주석) | — | Claude Opus high — 취소·hold·커밋 경계가 얽힌 동시성과 자격증명 처리 | `npm --prefix app test`, `npm --prefix app run typecheck`, `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts` | 대기 |
| RV-B | B 리뷰 | 없음(보고만) | B | Codex `gpt-6-astra` medium — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| C | R1 | `.scratch/runtime-test/agent-account-identity/`, `design.md` §1·§3 'PoC 의존' | B 통합 | Claude Opus medium — 실제 HOME·키체인을 쓰는 probe라 안전 판단이 필요 | tasks R1 통과 기준 | 대기 |
| 지휘자 | V1, Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 이 디렉터리 삭제 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, Z1 `rg` 확인 | 대기 |

## 파일 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. B는 `design.md`를 고치지 않는다.
- A가 최대 2.5초 이상을 재면 지휘자가 design §2 '시간 예산'을 다시 정하고 B에 알린다.
- C는 A·B 통합 뒤에 시작한다. A와 C가 모두 `design.md`를 고치지만 순서가 갈려 겹치지 않는다.
- tasks의 체크 항목 P1·T1·M1·R1·V1·Z1이 모두 위 표의 한 행에 있다.
