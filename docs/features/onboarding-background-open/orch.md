# onboarding-background-open — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `7ac9cb46e66cd346451a2fdaa368d10f825bd653` (main)
- 통합 브랜치: `feat/onboarding-background-open`
- 모델: Claude만 쓴다(교차 허가 없음). `/agent-eval`은 AGENTS.md 상시 예외로 두 에이전트를 돌린다.

## 결정 기록

1. T0(a)의 `/usr/bin/open -g`, `lsappinfo`, `lsregister -dump` 사용을 승인한다. ⌘Tab·Dock 클릭은 worker가 computer-use(`orca computer`)로 하고, bounce 시각 확인만 사람에게 묻는다. (사용자 결정)
2. T0(b)는 지금 승인한다. worker가 T0 단계에서 실제 Doan을 잠시 종료하고, 지금 설치된 번들의 CLI로 실제 HOME·userData에서 `doan onboarding start --json`을 한 번 실행한다. 설치된 번들은 아직 `-g`를 쓰지 않으므로 이 실행은 실제 경로의 기준 동작(전후 상태, 맨 앞 앱)을 기록한다. 완료 조건 1의 새 동작은 T0(a) PoC와 T3 probe로 확인한다. (사용자 결정)
3. T1·T2·T3·T4는 T0이 통과한 뒤 시작한다. design §6이 "하나라도 실패하면 구현 전에 멈춘다"고 적었다. (지휘자 판단 — design §6)
4. T0과 T2·T3은 같은 worker·worktree가 맡는다. PoC 패치와 LaunchServices·computer-use 절차를 T3 probe에 그대로 쓴다. (지휘자 판단)
5. T5(문서 승격, feature 디렉터리 삭제)는 지휘자가 통합 뒤 직접 한다. 문서만 바뀐다. (지휘자 판단 — orchestrate §5)
6. Dock bounce는 부차적이다. 확인의 중심은 온보딩이 뒤에서 제대로 진행되는지(맨 앞 앱 불변, 세션 진행, 활성화 때 창과 포커스)다. bounce는 반환값과 사용자의 시각 확인(T0 중 "빠운스됨")만 기록하고, Dock 자동 숨김 사례는 확인하지 않은 것으로 남긴다. (사용자 결정)
7. CLI는 앱을 깨끗한 환경으로 실행한다(`onboarding start`, `doan open` 모두). T0(b)로 다시 뜬 실제 Doan(pid 14002)이 실행한 Orca 터미널의 환경(`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_SESSION_ID`, `ORCA_*`)을 그대로 가졌다(`ps eww`). `/usr/bin/open`이 호출한 쪽 환경을 앱에 넘긴 것이다. 그래서 앱이 실행한 터미널의 프로필로 이어하기를 판단했고, 이어할 수 없는 Orca 세션에도 이어하기가 떴다가 보낼 때 실패한 것으로 보인다(사용자 보고). 이어하지 못하는 세션은 보이지 않는다는 기존 규칙(PRODUCT §3)은 그대로다. batch B 후속(B2)으로 넣는다. (사용자 결정)
8. 실행 중인 앱에 `open -g`가 가면 앱이 앞으로 오는 문제(T0 항목 4)는 이번 범위에서 고치지 않고 BACKLOG에 남긴다. 고치려면 비목표인 Dock 클릭(`activate`) 동작을 바꿔야 한다. (지휘자 판단)
9. 터미널에서 아직 열려 있는 Codex 세션은 이어하기를 제안하지 않는다. Claude는 `sessions/<pid>.json`으로 미리 거르지만 Codex는 사전 검사가 없어 제안했다가 보낼 때 실패한다. batch E가 PoC로 살아 있는 세션의 표지를 찾고, 결과가 긍정적이면 이 run에서 구현한다. 부정적이면 BACKLOG에 남긴다. (사용자 결정)
10. Codex PoC(batch E, codex 0.166.0)는 긍정이다. `<CODEX_HOME>/thread-writer-locks/<threadId>.lock`을 writer가 배타 flock으로 쥐고, 세션이 열린 채 `thread/resume`을 보내면 `-32600 already has an active writer`로 거절된다. 구현: 디렉터리 없음은 free(지원 writer 0.164.0+는 lock 전에 디렉터리를 만든다), 이상한 디렉터리는 unknown, lock 파일 없음은 free, 있으면 `lsof`로 연 프로세스가 있으면 occupied, 없으면 stale이라 free, `lsof` 실패는 unknown. `lockf` 검사는 Codex 자신의 resume을 거절시킬 수 있어 쓰지 않는다. `/exit` 뒤 약 1분 동안 데몬이 lock을 쥐므로 그동안 이어하기가 숨는다. (지휘자 판단 — 사용자 결정 9의 '긍정이면 이 run에')
11. 앱도 자신을 띄운 터미널의 환경을 login shell 검사와 실행하는 에이전트에 넘기지 않는다. B2는 CLI 실행 경로만 막으므로, 사람이나 에이전트가 터미널에서 `open -a Doan`, 실행 파일, `npm run dev`로 띄우는 경로가 남는다. Dock 실행과 같은 launchd 환경만 남긴다. 실행 환경에만 준 `CLAUDE_CONFIG_DIR`/`CODEX_HOME`은 더 이상 프로필을 정하지 않는다(셸 설정 파일의 값은 그대로 쓴다). batch F. (사용자 결정)
12. 통합 뒤 실제 앱 확인에는 사용자의 실제 로그인 세션(실제 HOME의 Claude·Codex)을 써도 된다. userData는 임시로 둔다. PoC·probe 사본의 LaunchServices 등록 정리(`lsregister -u`)도 승인됐다. (사용자 결정)
13. 통합 HEAD의 `verify.mjs --eval` 통과 뒤 `npm --prefix app run package` 빌드를 `/tester-build` 4단계처럼 ad-hoc 재서명(`--identifier design.doan.app`, `codesign --verify` 통과)해 실제 `/Applications/Doan.app`을 교체하고, 그 앱과 실제 HOME·userData·로그인으로 실제 앱 확인을 한 뒤 그대로 둔다. Applications에서 실행하므로 Agent setup이 실제 HOME에 돈다(ARCHITECTURE §7 'Agent setup'). (사용자 결정)

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T0(a)(b) PoC, tasks.md '확인 결과' | `app/src/main/index.ts`(커밋하지 않는 패치만), `docs/features/onboarding-background-open/tasks.md` '확인 결과' 절 | 없음 | Opus high — 실제 상태와 GUI를 다루고 실패 판단이 spec 모양을 바꾼다 | design §6 1~4 판정, real-state 지문 불변 | 대기 |
| C | T2 main 순수 규칙, T3 main 연결 | `app/src/main/backgroundReveal.ts`(+test), `app/src/main/index.ts`, `app/src/main/index.test.ts` | A | Opus high — 활성화·포커스·창 상태 경로가 얽히고 틀리면 창이 끝내 안 보인다 | `npm --prefix app test`·typecheck·build, LaunchServices probe(완료 조건 2~4, 6) | 대기 |
| B | T1 CLI 실행 방식, B2 깨끗한 실행 환경(결정 7) | `cli/internal/cli/onboarding.go`, `open.go`, `run.go`, `onboarding_test.go`, `open_test.go` | A | Sonnet medium — argv 하나와 인자 전달, 설계가 정해져 있다 | `go test ./...`, `go vet ./...` | 대기 |
| D | T4 guide와 eval | `cli/internal/cli/skill.md`, `eval/scenarios/O2/`, `docs/USABILITY-EVAL.md` | A | Sonnet high — 문구는 짧지만 크기 예산과 실제 eval 라운드 판정이 단계가 많다 | `go test ./...`, `verify.mjs --eval`, O2 self-test, `/agent-eval` O1·O2·O3·O3b | 대기 |
| E | Codex 터미널 점유 PoC, 긍정이면 구현(결정 9) | `app/src/main/conversation/io.ts`, `prepare.ts`와 테스트 | 없음 | Opus high — 실제 Codex 프로세스 관찰과 fail-closed 판단이 필요하다 | PoC 보고 뒤 사용자 판단, `npm --prefix app test`·typecheck·build | 진행 |
| F | 앱의 실행 환경 정리(결정 11) | `app/src/main/onboarding/machine.ts`, `conversation/environment.ts`, `agentAuth/environment.ts`와 테스트, 새 모듈 하나 | 없음 | Opus high — 모든 에이전트 실행 경로의 환경을 바꾸고, 틀리면 Dock 실행이 깨진다 | `npm --prefix app test`·typecheck·build | 진행 |
| RC | C 리뷰 | 없음(보고만) | C | Opus high — C와 같은 이유 | `/code-review` | 대기 |
| RBD | B·D 리뷰 | 없음(보고만) | B, D | Sonnet medium — 작은 diff | `/code-review` | 대기 |
| T5 | 승격, 디렉터리 삭제 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, 이 디렉터리 | 통합 | 지휘자 | `verify.mjs`, tasks T5의 `rg` | 대기 |

## 파일 겹침과 순서

- A → (C ‖ B ‖ D). B와 D는 같은 디렉터리(`cli/internal/cli/`)지만 파일이 겹치지 않는다.
- GUI·패키지 조율: C의 LaunchServices probe와 D의 `npm --prefix app run package`가 겹치면 `design.doan.app` 등록이 여럿 생긴다(POSTMORTEM 2026-10-30). D는 앱을 실행하지 않고, C는 probe 전에 `lsregister -dump`를 확인하고 경로로 연다.
- 통합 순서: B → C → D(어느 순서든 충돌 없음), 통합 HEAD에서 `verify.mjs --eval`.

## 리뷰·검증 기록

(진행하며 채운다.)
