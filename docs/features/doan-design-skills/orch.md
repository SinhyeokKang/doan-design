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
| D10 | `doan init`·MCP `init`의 `context` 안내는 성공 result에 `nextSteps: string[]` 키 하나를 더해 싣는다. 기존 키와 envelope v1·schema는 바꾸지 않는다 | 사용자 결정(2026-10-29). G2 질문 — 성공 envelope에는 `nextSteps` 자리가 없다 |
| D11 | E1의 실제 에이전트 확인은 실제 HOME·`CLAUDE_CONFIG_DIR`를 읽기용으로 써서 사례마다 `claude -p`를 한 번씩 실행한다(세션 저장 없음, MCP 없음, `CODEX_HOME`·`DOAN_RUNTIME` 격리, 전후 비교). 새 stub과 구 CLI의 사례는 skill 로딩을 끄고 stub 본문을 system prompt로 주며, stub 설치 경로는 미검증으로 남긴다 | 사용자 허가(2026-10-29). Claude 인증은 Keychain에만 있어 격리 HOME에서는 로그인되지 않는다 |
| D12 | U-009: `document`은 이 대화에서 `context`를 읽지 않았고 프로젝트 맥락 문서가 없으면 `context`를 먼저 읽게 한다. D10으로 다시 잰다 | 사용자 결정(2026-10-29). D10에서 Claude 0/3·Codex 1/3만 `context`를 읽었다 |
| D13 | U-010(stub에 두 경로 모두 실패할 때의 규칙), D3·D7 Claude의 사실 지어내기(clarify·harden 규칙 보강)는 새 수정 배치 F가 고친다. D2·D11의 시나리오 결함은 아직 병합 전 시나리오라 E가 제자리에서 고치고 다시 잰다 | 지휘자 판단 — 셋 다 design §3과 spec §4에 이미 정해진 규칙을 반영하는 수정이다 |
| D14 | D3는 실제 HOME에 격리 userData·`DOAN_RUNTIME`·`TMPDIR`·fake SHELL을 써서 진행한다. 끝나면 sign-out으로 doan profile용 Keychain 항목이 지워지는지 확인한다 | 사용자 허가(2026-10-29). 격리 HOME에는 login keychain이 없어 Codex·Claude 인증을 저장하지 못한다(ARCHITECTURE §7, PoC 10) |
| D15 | `document`의 예외(제품 맥락 문서가 있으면 `context` 생략)는 유지한다. U-009는 제품 맥락 문서가 없는 새 시나리오 D10c로 잰다. Codex `approval: never`가 MCP `init`을 거부한 D10b-codex는 알려진 조건으로 기록한다 | 사용자 결정(2026-10-29), D10b는 지휘자 판단 — ARCHITECTURE §6이 MCP 쓰기 도구에 사람 승인을 남긴다 |
| D16 | 가이드의 프리셋 절을 id 한 줄과 조회 안내·압축한 규칙으로 줄이고, 가이드 본문 크기 상한 테스트와 '중간 잘림 표시가 보이면 나눠 다시 읽기' 안내를 가이드·stub에 넣는다(F2). 그 뒤 D3 Codex를 다시 확인하고, 가이드가 바뀌었으므로 마지막 통합 전에 `/agent-eval` 전체 suite를 돌린다 | 지휘자 판단(사용자 기준 '돌아가더라도 검증을 확실히'). D3에서 Codex exec가 6,000 token에서 가이드 가운데를 잘라 `clarify` 줄이 사라졌고 끝 마커는 남았다. 이 feature 전 가이드는 18,830B였다 |
| D17 | 최종 리뷰 🟡1(본문 출력 예산 테스트·본문 잘림 안내)·⚪2(엔진 grep 자동 테스트)·⚪4는 F4가 고친다. 🟡3은 지휘자가 `/postmortem`으로 남긴다. 🟡2(고지 파일을 앱 배포본에 읽을 수 있게 싣기)는 빌드 설정 변경이므로 이번에는 하지 않고 #9 `dist`의 결정 사항으로 PRODUCT §8에 남긴다. ⚪5(실제 HOME에서 앱 대화의 Codex가 사용자 전역 stub을 읽음)는 agent-auth의 기존 동작으로 PRODUCT §8에 남긴다. F4가 가이드 문장을 바꾸므로 E 전체 suite 뒤 W1·D1·D3b·D8·D10c를 다시 잰다 | 지휘자 판단 — 저장소는 비공개이고 공개 배포 전이며, AGENTS가 요청 없는 빌드 설정 변경을 금한다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| G1 | A1-R, A2(Go·fixture), B1a | `cli/internal/designskill/**`(새: Go 코드, 카탈로그 데이터, `clarify`·`context` 본문, `LICENSE`·`NOTICE` 고지, `SOURCES.md`), `schema/fixtures/cli-envelope/design-skill/**`(새) | 없음 | Claude Opus high — 라이선스 고지·공개 계약·validator가 이후 모든 배치의 기준이다 | `verify.mjs` | 통합(2640db4…97ecdea, 수정 1회) |
| S | C2, B3(앱 `turnPrompt` 안내) | `app/src/main/onboarding/SKILL.md`와 onboarding 테스트, `app/src/main/agentAuth/providers.ts` 테스트, `app/src/main/conversation/prompt.ts`·`service.ts`와 테스트 | 없음 | Claude Opus medium — 설치 경쟁 회귀와 앵커 비신뢰 경계를 지켜야 하지만 변경은 문구 중심이다 | `verify.mjs` | 통합(e2e1a24…478e2ca, 수정 1회) |
| R | E2a | `eval/lib/scenario.ts`·`judge.ts`와 테스트, 필요하면 `eval/lib/transcript.ts` | 없음 | Codex `gpt-6.1-sol` medium — 기존 패턴을 확장하는 기계적 runner 변경 | `verify.mjs --eval` | 통합(34ba678·98511c1) |
| G2 | B2(Go), B3(가이드 `skill.md` 매핑 규칙·짧은 목록 생성), C1 | `cli/**`(`cli/internal/designskill/`의 카탈로그 데이터·`*.md` 본문·`SOURCES.md` 제외) | G1 | Claude Opus high — CLI/MCP parity, `init` `nextSteps`, 가이드 계약 | `verify.mjs` | 통합(6d791cd…b219110) |
| P | B1b | `cli/internal/designskill/`의 카탈로그 데이터, 나머지 18개 본문, `SOURCES.md`, `schema/fixtures/cli-envelope/design-skill/`의 목록 fixture | G1 | Claude Opus high — 원본을 각색하며 엔진 절차 제거·출처 보존·프리셋 간 연계를 판단한다 | `verify.mjs` | 통합(c448cde…5133298, 수정 1회) |
| A | A2(TS), B2(TS 앱 결과 해석), D1 | `app/src/main/`의 새 designSkills 모듈과 테스트, `app/src/main/index.ts`·`senderAllowed.ts`·`cli.ts`(필요한 연결만), `app/src/preload/index.ts`와 테스트 | G1 | Claude Opus high — 신뢰된 호출자 경계와 실패를 빈 성공으로 바꾸지 않는 해석 | `verify.mjs` | 통합(bc89b5a…3eb7d21, 수정 1회) |
| E | E2b, E2c, E2d | `eval/scenarios/`의 새 시나리오와 fixture, `docs/USABILITY-EVAL.md` | G2, P, S, R 통합 | Claude Opus high — 사례별 허용 선택·금지 수정 rubric 설계와 실제 round 실행 | `verify.mjs --eval`, `node eval/run.ts --self-test`, 실제 round | 진행 |
| V | D2, D3, E1 | 보고만 한다. `.scratch/` 근거 | 모든 구현 통합 | Claude Opus medium — 격리·정리 절차가 길지만 판단보다 단계가 많다. D3 로그인 승인은 지휘자(D3 결정) | `/runtime-test` | 진행(D2·E1 먼저, D3는 같은 터미널 다음 Task) |
| F | U-009·U-010·D3/D7 보강(E 결과의 수정) | `presets/{document,clarify,harden,onboard}.md`, `SOURCES.md`, `get-clarify.json`, `app/src/main/onboarding/SKILL.md`와 stub 테스트 | E 1차 round | Claude Opus medium — 문구 수정이지만 stub 두 설치 경로와 앱 대화 지시의 충돌을 피해야 한다 | `verify.mjs` | 진행(`ctx_b0d12bf988e3`) |
| F2 | D3에서 찾은 가이드 잘림 회귀 수정 | `cli/internal/cli/skill.md`·`skill.go`와 가이드 테스트, stub과 stub 테스트 | V D3 | Claude Opus high — 모든 Codex 세션에 영향을 주는 가이드 회귀이고 상한 근거를 정해야 한다 | `verify.mjs` | 진행(`ctx_699109337b7d`) |
| F3 | U-011: `document`이 근거 없는 판단을 확정 규칙으로 쓰는 문제 | `presets/document.md`, `SOURCES.md` | E 재측정 2 | Claude Opus medium — 본문 한 절의 규칙 보강 | `verify.mjs` | 진행 |
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
- 2026-10-29: 2차 G2(`dds-g2`)·P(`dds-p`)·A(`dds-a`)를 통합 HEAD 97ecdea에서 시작했다. G1·S worktree는 Orca로 제거했다(handoff 사본은 `.scratch/orch-dds/`).
- 2026-10-29: 1차 통합 HEAD(d1c8b7b) `verify.mjs --eval` 첫 실행은 app-test 1건에서 FAIL했다. 주 checkout의 `app/node_modules`가 오래되어 SDK 0.3.310이 설치돼 있었다(manifest 0.3.312). `npm --prefix app ci` 뒤 다시 실행해 PASS했다.
- 2026-10-29: G2(46a5b1c·43ac5fe·69da0f3)·P(fea447b·8647d5a)·A(4edaea9·cffad35) 완료. 앱 argv `design-skill --json -- <id>`가 G2 CLI에서 동작함을 지휘자가 확인했다. 리뷰 작업자 셋(Codex `gpt-6-astra` medium)을 시작하고 세 작업자 터미널은 retain했다.
- 2026-10-29: 2차 7커밋을 임시 worktree에서 합쳐 보았다. 충돌 없이 합쳐졌고 `go test ./...` PASS, 앱 관련 vitest 4파일 PASS, 목록 20개, 목록 4,065B, 최장 단건 envelope critique 15,543B, `doan skill` envelope 25,230B였다(임시 worktree는 지웠다).
- 2026-10-29: G2 리뷰(`review-G2.md`, Codex) 🔴0 🟡0 🟢2. 🟢1(design·tasks의 'init result는 바꾸지 않음' 문구를 D10에 맞춘다)은 Z1에서 정리한다. G2를 통합한다.
- 2026-10-29: A 리뷰(`review-A.md`, Codex) 🔴0 🟡1 🟢2. 🟡(NUL이 든 id에서 spawn이 동기 예외를 던져 앱 실패 envelope를 우회한다)와 🟢 주석·handoff 문구를 A 수정 라운드 1로 보냈다. 앱 실패의 빈 `nextSteps`는 계획에 맞다고 판정됐다.
- 2026-10-29: P 리뷰(`review-P.md`, Codex) 🔴0 🟡2 🟢3. 🟡1(원본의 미학적 절대 금지가 document·polish·distill·quieter에 남음), 🟡2(generate의 다축 대안 규칙이 방향을 지정한 요청과 충돌)와 🟢 셋을 P 수정 라운드 1로 보냈다.
- 2026-10-29: A 수정 라운드 1(c3a5745)을 지휘자가 확인했다. `runDesignSkill`만 동기 spawn 예외를 실패 결과로 바꾸고 공용 `runCli`는 그대로이다. A를 통합한다.
- 2026-10-29: P 수정 라운드 1(9f24286·633cbde)을 지휘자가 확인했다(document의 시스템 폰트·glyph는 기본값으로, polish·distill·quieter 금지는 기존 시스템이 정당화하는 기본값으로, generate는 자유 탐색·방향 고정·departure로 분기). P를 통합하고 3차 E·V를 시작한다.
- 2026-10-29: 2차 통합 HEAD(90fa660) `verify.mjs --eval` PASS(9단계). 3차 E(`ctx_77e6356c97de`)·V(`ctx_3b2e3e0e7546`)를 시작했다.
- 2026-10-29: V 질문 — 격리한 CLAUDE_CONFIG_DIR에는 Claude 인증이 없다(Keychain 전용). 지휘자 판단으로 실제 CLAUDE_CONFIG_DIR를 읽기용으로만 쓰고 나머지는 격리하며, 전후 비교와 transcript로 읽은 SKILL.md를 판정하게 했다.
- 2026-10-29: E 1차 완료(168c9c35·2a208780, D1–D12, round 7개 38 run). 미완료: D10(U-009), D4-codex(U-010), judge partial D2·D3·D7·D11(Claude). 리뷰(Claude Opus medium, `ctx_513795091da0`)와 수정 배치 F를 시작했다. E 터미널은 재측정을 위해 retain했다.
- 2026-10-29: V 보고 — E1 실제 에이전트 두 사례 PASS. 실행 전후 비교에서 Keychain 'Claude Code-credentials-36e67382'의 수정 시각만 바뀌었다(E round와 같은 항목, OAuth 갱신으로 추정, 내용 미열람). doan 상태·skill·settings·MCP 등록은 그대로였다.
- 2026-10-29: V(D2·E1) 완료(`handoff-V.md`). D2 PASS(실제 격리 Electron, 목록·단건이 CLI와 같음, iframe·Settings sender는 `request_refused`, real-state 불변). E1 PASS(패키지 CLI 20개·고지 4파일, 두 호환 사례). 미검증: 제품 설치 경로(user skill)로의 발견, Codex. 범위 밖 발견: `app/runtime/environment.ts`의 `isolatedEnv`가 `onboarding.json`에 `{}`를 써서 현재 v1 완료 기록과 맞지 않아 첫 실행 마법사가 뜬다(probe에서 우회). D3는 F 통합 뒤 같은 터미널로 보낸다.
- 2026-10-29: E 리뷰(`review-E.md`) 🔴0 🟡4 ⚪4. 🟡: D3·D4의 우회 금지가 judge에만 걸림, D7 partial 1/3은 rubric 모호함, MCP `init` 경로 미검증 누락, U-009 근거 순서 오기. 지휘자 판단: 시나리오 결함은 저장소 관례대로 새 id(D2b·D3b·D4b·D7b·D11b)로 고치고, MCP `init` 경로는 D10b로 더한다. F 통합 뒤 E에 수정·재측정 라운드로 보낸다.
- 2026-10-29: F 완료(44782e82·6df2914d·1d9010e1)를 지휘자가 확인했다. stub에 두 경로 실패 규칙, document에 context 선행, clarify·harden에 미확인 결과 주장 금지·실제 다음 행동만 쓰는 빈 상태 규칙이 들어갔다. F와 E 1차(168c9c35·2a208780)를 통합한다.
- 2026-10-29: E 수정·재측정 라운드 1(`ctx_f6933a67e9a6`)과 V D3(`start-V-D3.json`)를 시작했다.
- 2026-10-29: E 수정·재측정 1(3555548f·65322bac·48ba14cd): U-010 fixed(D3b·D4b 양쪽 pass), D2b·D7b 양쪽 pass. U-009는 Claude가 README를 제품 맥락 문서로 보아 `context`를 생략해 0/3, D11b seed에 근거 없는 spacing 문구가 남았다. D10c·D11c로 재측정 2를 보냈다.
- 2026-10-29: V D3 완료: Cursor·Antigravity·Copilot PASS, Copilot 조회 실패 사례 PASS. Codex 미완료(가이드 가운데 잘림으로 `clarify` 줄 누락, 실제 HOME의 이전 user stub을 읽음). Claude는 사용자가 직접 로그인을 승인했으나 계정 주간 한도(10-31 13시 재설정)로 미검증. sign-out으로 profile Keychain 항목 2개가 지워졌고 2차 real-state는 불변. 관찰: Copilot·Claude의 권한 요청 요약은 실행 명령을 보여 주지 않는다, Antigravity 로그인은 5분에 만료된다. F2를 시작했다.
- 2026-10-29: E 재측정 1·2 통합(b4a997e9…36a9b813). U-009 fixed(D10c 4/4가 산출물 전에 `context`를 읽음), U-010 fixed, D2b·D3b·D4b·D7b 양쪽 pass. 남은 것: U-011(Claude가 새 디자인 시스템 문서에 근거 없는 판단을 규칙으로 씀) → F3, D11c seed에 근거 없는 링크 주장 1건 → 지휘자 판단으로 D11d를 만든다. F2·F3 통합 뒤 E가 D11d와 `/agent-eval` 전체 suite를 돌린다.
- 2026-10-29: F2 통합(ce9b6c7d·73b804af). 가이드 plain 24,528→20,696B, --json 25,230→21,354B, 크기 상한 21,600B(cap 90%) 테스트 추가. 프리셋 설명은 가이드에서 빠지고 id 한 줄과 규칙 5개만 남았다. V에 Codex D3 재확인을 보냈다. 하네스: 사용자 요청으로 AGENTS와 /design-draft·/ux-audit가 프리셋을 스스로 읽게 했다(9771273·a47c851·e25cf23).
- 2026-10-29: F3 통합(c62dbf21·1575bdab). E에 D11d와 `/agent-eval` 전체 suite를 보냈고(`ctx_785924863259`), 통합 diff 전체의 최종 리뷰(Claude Opus high)를 시작했다.
- 2026-10-29: V D3 Codex 재확인 PASS(F2 뒤 가이드 잘림 없음, `design-skill --json`→`design-skill clarify --json` 실제 호출, 대상 frame만 수정, check 0). 정리 실수로 남은 profile Keychain 'Codex Auth'는 `codex logout`으로 그 항목만 지웠다. 관찰: sign-out이 `stop_required`인 채 앱을 닫으면 profile Keychain 항목이 남는다. V worktree를 제거했다(근거 사본 `.scratch/orch-dds/handoff-V.md`, `runtime-test-V/`).
- 2026-10-29: 최종 리뷰(`review-final.md`) 🔴0 🟡3 ⚪6. D17로 처리를 정하고 F4를 시작했다.
