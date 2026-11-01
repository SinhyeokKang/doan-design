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
| 6 | 이 PR에 별도 배치 G를 더한다. `doan init`과 앱 프로젝트 설정이 `.gitattributes`에 `.doan/** linguist-documentation`을 함께 써서, 사용자 저장소의 GitHub 언어 통계에서 초안 캔버스를 뺀다. ARCHITECTURE §1 "the only Git configuration Doan writes"와 PRODUCT의 "one `.gitattributes` line"을 바꾼다 | 사용자 승인(2026-11-01, "이 PR에 같이 들어가도 괜찮아") |
| 7 | "설정됨"은 지금처럼 config가 있는지로만 정한다. config가 있는 저장소는 다시 "설정 필요"가 되지 않고 `init`도 아무것도 쓰지 않으므로 새 줄을 받지 않는다. config가 없는 저장소의 변경 목록은 두 줄 중 하나라도 빠지면 `.gitattributes`를 넣는다. `init`은 빠진 줄만 채운다 | 지휘자 판단 — 표시용 속성 하나로 기존 프로젝트를 미설정으로 되돌리지 않는다. 처음 문장이 모호해 G가 병합 줄만으로 목록을 정했고, 수정 1차로 바로잡는다 |
| 8 | G 통합 뒤 `/agent-eval`을 설정에 닿는 시나리오(O1, O2, D9, D10, D10c, D10d, D12)로 돌린다 | 지휘자 판단(RV-G 지적 수용) — 처음엔 "파일 내용만 바뀐다"며 생략하려 했으나, 병합 줄만 있는 미설정 저장소에서 `init`의 `created`와 onboarding inspect의 `changes` 값이 달라진다. AGENTS는 CLI 출력 변경을 eval 대상으로 정한다 |
| 5 | `.scratch/provider-profile/userData`를 이 실행이 끝나도 로그아웃하거나 지우지 않는다. `buzz-canvas-conversation` V2가 이어서 쓴다 | 사용자 지시(2026-11-01) |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | P1 | `.scratch/account-identity/`, `design.md` §1 Codex 절(측정 결과 줄) | — | Codex `gpt-6.1-sol` medium — 스크립트를 돌려 숫자를 적는 기계적 일 | 스크립트 5회 출력, design §1 결과 | 통합 `90641ef1`. 중앙값 100.252ms·최대 102.668ms로 5초 예산 유지. 워커 해제·worktree 제거 |
| B | T1, M1 | `app/src/main/agentAuth/identity.ts`·`identity.test.ts`·`providers.ts`·`manager.ts`·`manager.test.ts`, `app/src/renderer/agentAuthView.ts`(주석) | — | Claude Opus high — 취소·hold·커밋 경계가 얽힌 동시성과 자격증명 처리 | `npm --prefix app test`, `npm --prefix app run typecheck`, `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts` | 통합 `668732bb..6febfb0b`(수정 1차 `8041e4df` 포함: 가짜 타이머 취소 테스트, 그룹 대기 고정). 소유 밖 `storage.ts` `readWorking` 추가는 수용. 워커 해제·worktree 제거 |
| RV-B | B 리뷰 | 없음(보고만) | B | Codex `gpt-6-astra` medium — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료: 🔴0 🟡2 ⚪1(`.scratch/briefs/aai/review-B.md`). 🟡2(5초 상한 문구)는 지휘자가 spec·design에서 고쳤다. 워커 해제 |
| C | R1 | `.scratch/runtime-test/agent-account-identity/`, `design.md` §1·§3 'PoC 의존' | B 통합 | Claude Opus medium — 실제 HOME·키체인을 쓰는 probe라 안전 판단이 필요 | tasks R1 통과 기준 | 통합 `ff000ced`. 14/14 통과, 두 이메일 표시, metadata sha256 유지, 키체인 대화상자 없음. 조회만 떼어 낸 시간은 못 잼(status check 포함 Codex 1.5–2.0초, Antigravity 4.1–8.4초). 워커 해제·worktree 제거, 프로필 유지 |
| G | 결정 6·7 | `cli/internal/cli/init.go`와 테스트, `app/src/main/onboarding/`, `app/src/renderer/ProjectSetupDialog.tsx`, `eval/lib/`·`eval/scenarios/`의 `.gitattributes` 기대값, `cli/internal/cli/skill.md`(필요할 때), PRODUCT·ARCHITECTURE의 해당 문장 | — | Claude Opus medium — CLI·앱·eval 계약을 함께 맞추는 중간 난도 | `node .agents/skills/verify/scripts/verify.mjs --eval` | 10커밋 `55e7caa9..12fa14c1`(수정 1차 4커밋 포함), verify --eval PASS. 통합 `6d309ebb..cee7bc25`. RV-G 🔴0 🟡1("two lines"가 부분 설정 폴더에서 틀림, 수정 2차로 해소) ⚪1(가짜 앱의 실패 순서, 범위 밖). 워커 해제·worktree 제거 |
| G2 | 설정 문구 | `ProjectSetupDialog.tsx` 한 줄 | G | Claude Sonnet low — 지휘자가 정한 문구로 바꾸는 한 줄 | app test, typecheck | 통합 `3c1cd886`. 지휘자가 clarify 프리셋으로 "missing Doan lines"를 검수해 "two lines, if missing"으로 정함(사용자 요청). 워커 해제 |
| E | 결정 8 | `docs/USABILITY-EVAL.md` | G2 | Claude Opus medium — 실패 분류 판단 | `/agent-eval` 라운드 기록 | 진행 |
| P | G 격리 앱 probe | `.scratch/` | G2 | Claude Sonnet medium — 정해진 단계를 따르는 probe | 화면 문구, `.gitattributes` 바이트 | 진행 |
| 지휘자 | V1, Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 이 디렉터리 삭제 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, Z1 `rg` 확인 | V1: `cee7bc25`에서 verify --eval PASS(G2 뒤 재실행 필요). Z1: ARCHITECTURE `cd9b8e88`, PRODUCT `163fbe78`. 디렉터리 삭제는 E·P 뒤 |

## 실행 기록

- Orca run `run_f23ded7e4e1f`.
- A: dispatch `ctx_4b9c396f8ca1`, worktree `aai-A`, `gpt-6.1-sol` medium(effective 확인).
- B: dispatch `ctx_a5fc7b6c1426`, worktree `aai-B`, Claude `opus` high(effective 확인).
- RV-B: dispatch `ctx_d830864e5bc3`, `gpt-6-astra` medium(effective 확인), B worktree에서 읽기만.
- B 수정 1차: dispatch `ctx_491e261a9110`, 같은 터미널 재사용.
- G: dispatch `ctx_281813449dab`, worktree `aai-G`, Claude `opus` medium(effective 확인).
- RV-G: dispatch `ctx_402f9e88969a`, `gpt-6-astra` medium(effective 확인), G worktree에서 읽기만.
- G2 `ctx_77d0868627b0`, E `ctx_e8154c905efb`, P `ctx_bdd611ff74c4`(모두 effective 확인).
- C: dispatch `ctx_155776a9a15c`, worktree `aai-C`, Claude `opus` medium(effective 확인).
- G 수정 1차: dispatch `ctx_fed84459911d`, 같은 터미널 재사용.

## 파일 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. B는 `design.md`를 고치지 않는다.
- A가 최대 2.5초 이상을 재면 지휘자가 design §2 '시간 예산'을 다시 정하고 B에 알린다.
- C는 A·B 통합 뒤에 시작한다. A와 C가 모두 `design.md`를 고치지만 순서가 갈려 겹치지 않는다.
- tasks의 체크 항목 P1·T1·M1·R1·V1·Z1이 모두 위 표의 한 행에 있다.
