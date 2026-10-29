# doan-design-skills — orch

원본 계획은 [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md)이다. 이 파일은 배치 분할·결정·진행만 기록한다.

- 시작 hash: main `5230657`(2026-10-29)
- 통합 브랜치: `feat-doan-design-skills`(주 checkout `/Users/sinhyeok/code/doan-design`)
- 지휘자: Claude Code(Opus 5.5)
- 모델 교차: 사용자가 Codex 작업자 사용을 허가했다(2026-10-29). 구현은 주로 Claude가 하고 Codex는 기계적 배치와 독립 리뷰에 섞는다(사용자 메모 2026-10-26).

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | Codex 작업자를 쓸 수 있다 | 사용자 결정(2026-10-29) |
| D2 | A1-R의 원본 69개 소스 대조표는 프리셋 소스 옆 영어 문서 `cli/internal/designskill/SOURCES.md`로 커밋한다. 바이너리에는 넣지 않는다 | 사용자 결정(2026-10-29). feature 디렉터리가 삭제된 뒤에도 파일별 출처·변경 기록(spec §4.7)이 남는다 |
| D3 | D3의 다섯 공급자 로그인은 격리 userData에서 하고, 지휘자가 ego-lite의 사용자 계정으로 승인한다. 실제 userData는 건드리지 않는다 | 사용자 결정(2026-10-29) |
| D4 | 새 Go 패키지는 `cli/internal/designskill/`, 공용 fixture는 `schema/fixtures/cli-envelope/design-skill/`에 둔다. 카탈로그는 Go 코드와 분리한 데이터 파일로 둔다 | 지휘자 판단 — 온보딩 fixture 선례(`cli-envelope/onboarding/`)를 따른다. 카탈로그를 데이터로 분리해야 2차에서 P가 본문·카탈로그를, G2가 Go 코드를 겹치지 않게 나눠 소유한다 |
| D5 | 프리셋 본문·카탈로그 문구·고지 변경 표시는 영어로 쓴다 | 지휘자 판단 — AGENTS 언어 정책(코드·제품 텍스트는 영어) |
| D6 | tasks의 "command undecided" 검증은 다음으로 정한다. 문서 검증(A0·Z1)은 수동 대조, 실제 앱 probe(D2·D3·E1)는 `/runtime-test` 절차에 따라 `.scratch/` probe와 AGENTS Commands의 격리 실행 명령을 쓴다 | 지휘자 판단 — AGENTS 'Verification policy'(2026-10-27)가 화면별 e2e 대신 `.scratch/` probe를 정했다 |
| D7 | A0(PRODUCT §6 기록)·D4(ARCHITECTURE §7 초안과 buzz-restyle 인계)·Z1(승격)은 지휘자가 문서 커밋으로 한다 | 지휘자 판단 — `.scratch/design-tools-poc/`는 주 checkout에만 있고, 이 셋은 문서 신선도 커밋 범위이다 |
| D8 | A1-R에서 공개 20개나 `document` 표시 이름을 바꿔야 하면 G1은 바꾸지 않고 질문으로 올린다. 지휘자가 사용자에게 묻는다 | spec §3.1: 선정은 사용자 결정이다 |
| D9 | A1-R 재검토 결과 공개 20개 ID를 유지한다. `document`의 표시 이름은 `Document the design system`이다 | 사용자 결정(2026-10-29), G1 권고 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| G1 | A1-R, A2(Go·fixture), B1a | `cli/internal/designskill/**`(새: Go 코드, 카탈로그 데이터, `clarify`·`context` 본문, `LICENSE`·`NOTICE` 고지, `SOURCES.md`), `schema/fixtures/cli-envelope/design-skill/**`(새) | 없음 | Claude Opus high — 라이선스 고지·공개 계약·validator가 이후 모든 배치의 기준이다 | `verify.mjs` | 진행(`ctx_91a9bc81a3c6`) |
| S | C2, B3(앱 `turnPrompt` 안내) | `app/src/main/onboarding/SKILL.md`와 onboarding 테스트, `app/src/main/agentAuth/providers.ts` 테스트, `app/src/main/conversation/prompt.ts`·`service.ts`와 테스트 | 없음 | Claude Opus medium — 설치 경쟁 회귀와 앵커 비신뢰 경계를 지켜야 하지만 변경은 문구 중심이다 | `verify.mjs` | 진행(`ctx_9cdacb16a68a`) |
| R | E2a | `eval/lib/scenario.ts`·`judge.ts`와 테스트, 필요하면 `eval/lib/transcript.ts` | 없음 | Codex `gpt-6.1-sol` medium — 기존 패턴을 확장하는 기계적 runner 변경 | `verify.mjs --eval` | 진행(`ctx_353641535557`) |
| G2 | B2(Go), B3(가이드 `skill.md` 매핑 규칙·짧은 목록 생성), C1 | `cli/**`(`cli/internal/designskill/`의 카탈로그 데이터·`*.md` 본문·`SOURCES.md` 제외) | G1 | Claude Opus high — CLI/MCP parity, `init` `nextSteps`, 가이드 계약 | `verify.mjs` | 대기 |
| P | B1b | `cli/internal/designskill/`의 카탈로그 데이터, 나머지 18개 본문, `SOURCES.md`, `schema/fixtures/cli-envelope/design-skill/`의 목록 fixture | G1 | Claude Opus high — 원본을 각색하며 엔진 절차 제거·출처 보존·프리셋 간 연계를 판단한다 | `verify.mjs` | 대기 |
| A | A2(TS), B2(TS 앱 결과 해석), D1 | `app/src/main/`의 새 designSkills 모듈과 테스트, `app/src/main/index.ts`·`senderAllowed.ts`·`cli.ts`(필요한 연결만), `app/src/preload/index.ts`와 테스트 | G1 | Claude Opus high — 신뢰된 호출자 경계와 실패를 빈 성공으로 바꾸지 않는 해석 | `verify.mjs` | 대기 |
| E | E2b, E2c, E2d | `eval/scenarios/`의 새 시나리오와 fixture, `docs/USABILITY-EVAL.md` | G2, P, S, R 통합 | Claude Opus high — 사례별 허용 선택·금지 수정 rubric 설계와 실제 round 실행 | `verify.mjs --eval`, `node eval/run.ts --self-test`, 실제 round | 대기 |
| V | D2, D3, E1 | 보고만 한다. `.scratch/` 근거 | 모든 구현 통합 | Claude Opus medium — 격리·정리 절차가 길지만 판단보다 단계가 많다. D3 로그인 승인은 지휘자(D3 결정) | `/runtime-test` | 대기 |
| 지휘자 | A0, D4, E3, Z1 | `orch.md`, PRODUCT, ARCHITECTURE, DIRECTORY, buzz-restyle 문서, 통합 커밋 | A0: 없음. 나머지: 전부 | — | 통합 HEAD `verify.mjs --eval` | 대기 |

독립 리뷰(`/code-review`, 보고만): G1·G2·A·P는 Codex `gpt-6-astra` medium, S·R·E는 Claude Opus medium. 구현과 다른 계열을 섞는다(D1). E3의 최종 리뷰는 통합 diff 전체를 Claude Opus high로 한 번 더 본다.

## 순서와 겹침

1. 1차 병렬: G1 · S · R. G1은 `cli/internal/designskill/`와 새 fixture, S는 onboarding·conversation, R은 `eval/lib/`만 고친다. 지휘자는 이때 A0를 한다.
2. 2차 병렬(G1 통합 뒤): G2 · P · A. G2는 Go 코드, P는 카탈로그 데이터·본문·`SOURCES.md`, A는 app main/preload만 고친다. G2가 카탈로그 데이터 형식을 바꿔야 하면 직접 고치지 않고 지휘자에게 묻는다.
3. 3차(G2·P·S·R 통합 뒤): E. A 통합 뒤 V(패키지·실제 앱 probe). 둘은 파일이 겹치지 않으나 GUI·패키지 빌드는 지휘자가 순서를 조정한다.
4. 마지막: 지휘자 D4·E3·Z1, push, PR. 병합하지 않는다.

- S의 stub 문구는 명령 이름(`doan design-skill`, MCP `design_skill`)을 design §2대로 쓴다. G2가 이름을 바꾸지 않는다.
- B3는 두 배치로 나눈다: 앱 `turnPrompt` 안내는 S, 가이드 `skill.md`는 G2.
- A2는 두 배치로 나눈다: fixture와 Go 소비 테스트는 G1, TS 소비 테스트는 A. G1의 목록 fixture에는 `clarify`·`context`만 있고, P가 나머지 18개를 카탈로그 데이터와 목록 fixture에 함께 추가한다. 다른 배치의 테스트는 20개를 가정하지 않는다.

## 진행 기록

- 2026-10-29: intake. 결정 D1–D8.
- 2026-10-29: run `run_a4cd59bab3c2`. 1차 G1(`dds-g1`)·S(`dds-s`)·R(`dds-r`, Codex) 시작, 세 작업자 모두 착수를 확인했다. A0 완료(5bcbca9). PoC 파일에는 `doan check` 출력이 남아 있지 않아 그 사실을 PRODUCT §6에 함께 적었다.
- 2026-10-29: G1 질문 — ehmo MIT 원문이 고정 클론에 없다. 지휘자가 `gh api`로 ehmo/platform-design-skills `dc2be825`의 LICENSE를 받아 전달했다(저작권 줄에 권리자 이름 없음, 그대로 보존). R 질문 — child worktree의 `npm --prefix app ci`·package 실행을 허가했다.
- 2026-10-29: R 완료(4244ee6·96eeef2, verify --eval PASS). 리뷰 작업자 `ctx_dadb841537fe`(Claude Opus medium) 시작. 수정 라운드에 대비해 R 터미널은 retain했다.
- 2026-10-29: R 리뷰(`review-R.md`) 🔴0 🟡0 ⚪4. ⚪1(Claude 경로의 긴 본문 상한)·⚪2(조회 횟수는 transcript에서 따로 센다)는 E 브리프로 넘긴다. R을 통합한다.
- 2026-10-29: S 완료(82ffb93·ebdab82, verify PASS). 리뷰 작업자 `ctx_1701a0dd4e6c`(Claude Opus medium) 시작, S 터미널은 retain했다. R worktree `dds-r`는 Orca로 제거했다(handoff 사본 `.scratch/orch-dds/handoff-R.md`).
- 2026-10-29: G1 완료(f5b37f1·639efce·1b7fc76, verify PASS). 리뷰 작업자 Codex `gpt-6-astra` medium 시작, G1 터미널은 retain했다. 2차(G2·P·A)는 G1 리뷰와 통합 뒤 시작한다.
- 2026-10-29: S 리뷰(`review-S.md`) 🔴0 🟡2 ⚪4. 🟡1(turnPrompt 안내에 design §3 실패 규칙 누락)·🟡2(stub 승인 전 변경 테스트 없음)를 같은 S 터미널에 수정 라운드 1(`ctx_ddf5b5e5e07b`)로 보냈다.
- 2026-10-29: G1 리뷰(`review-G1.md`, Codex) 🔴0 🟡1 🟢3. 🟡(참조형 상대 링크가 validator를 통과)와 🟢 셋을 G1 수정 라운드 1로 보냈다.
- 2026-10-29: S 수정 라운드 1(2868851·63351f8)을 지휘자가 확인했다. 안내에 design §3 실패 규칙이 모두 있다. S를 통합한다.
- 2026-10-29: G1 수정 라운드 1(8f7dee3·7f56691)을 지휘자가 확인했다(참조형 링크 정의·후행 JSON 거부와 회귀 테스트). G1을 통합하고 2차 G2·P·A를 시작한다.
