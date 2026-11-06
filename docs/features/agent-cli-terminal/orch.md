# agent-cli-terminal — orch

- 계획 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md) (`/feature-review` 299a2547)
- 시작 해시: `87b02c9f` (origin/main, PR #106 머지 c0cbc210 포함)
- 통합 브랜치: `feat/agent-cli-terminal`
- chain: 해당 없음

## 결정 기록

- 모델 교차: Codex worker를 허용한다(사용자, 2026-11-06). 범위는 B·C 배치의 독립 코드 리뷰 worker(`gpt-6-astra` medium)로 한정한다. 구현과 fix round는 Claude worker가 맡는다. 리뷰를 다른 모델 계열이 맡으면 구현 worker와 같은 관점에 묶이지 않는다. — conductor 판단
- T1 실행 명령 `node .scratch/agent-cli-terminal/poc.mjs`를 승인했다(사용자). T1 PoC와 `/runtime-test`는 실제 계정의 Terminal.app을 LaunchServices로 열어도 된다(사용자).
- 실제 계정에서는 provider install·update 명령을 실행하지 않는다. PoC는 `echo`, `command -v`만 실행한다. runtime probe는 Return을 누르지 않고 Terminal 창을 닫은 뒤 실제 CLI 버전이 바뀌지 않았는지 확인한다(사용자).
- 사용자에게 묻고 멈출 지점: T1의 Gatekeeper·격리 대화상자, PATH 불일치, Copilot update 위치 불일치(design.md 'PoC 의존'), 새 의존성, 범위 밖 변경(사용자).
- tasks.md는 `/ship` 하나로 진행한다고 적었지만, 사용자가 `/orchestrate`로 실행했다. T1과 T2·T3는 파일이 겹치지 않으므로 병렬로 돌린다. Cursor 하한과 Copilot update 경로는 T1 결과를 받은 뒤 B에 후속 Task로 보낸다. — conductor 판단
- T5(승격과 정리)는 conductor가 통합 뒤 문서별 커밋으로 한다(`/orchestrate` §5). — conductor 판단
- main이 앞서 나가면: 통합 `/verify` 전마다 `git fetch origin`으로 origin/main을 보고, 움직였으면 `feat/agent-cli-terminal`을 rebase한 HEAD에서 gate를 돌린다. 충돌 시 main의 문서는 그대로 두고 feature 쪽만 고친다(사용자).

- T1에서 Copilot update 위치가 어긋났다: `copilot update`는 JS 패키지를 실제 HOME 캐시에 받고 PATH 바이너리를 교체한다. Doan은 HOME=<profileDir>로 띄워 바이너리만 쓰고, ToolFacts는 실제 HOME으로 버전을 읽는다. 바이너리 교체가 실패하면 facts와 실행 바이너리가 갈린다. → Copilot update는 설치 페이지로 둔다. Copilot install은 터미널 명령을 유지한다(사용자).
- `setup:open-install`이 page 경로에서 `openExternal`에 실패하면 `pageFailed`를 돌려준다. 결과는 `terminal | page | failed | pageFailed` 넷이다. — conductor 판단, 근거: spec 완료 기준 7, design.md '행 상태와 문구'의 `pageFailed` 행
- 스크립트는 실행 줄 앞에 `set -o pipefail 2>/dev/null`을 둔다. 보여 주는 명령은 바꾸지 않는다. — conductor 판단, 근거: spec 완료 기준 3. `curl | bash`에서 curl이 실패해도 bash가 0으로 끝나 Finished가 뜨는 것을 막는다.
- T1 격리 조건에서 app/dist 복사본에 quarantine을 붙이자 앱 자체가 "damaged"로 막혔다(ad-hoc 서명이 깨짐). → 임시 HOME 복사본을 tester-build 4단계처럼 재서명하고 quarantine 플래그 00c3(승인 상태)으로 다시 확인한다. 실제 System Settings는 건드리지 않는다(사용자).
- 검증에 필요하면 worker와 conductor 모두 computer use(`orca-computer-use`)를 쓸 수 있다(사용자).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1 PoC | `.scratch/agent-cli-terminal/`, `docs/features/agent-cli-terminal/design.md`('PoC 의존'만) | 없음 | Claude Opus high (실제 계정 Terminal을 열고 실제 상태를 지켜야 하며, 멈춤 판단이 필요하다) | 관찰 기록, real-state 미변경 확인 | 진행 (run_7b6c10f4e3e9, ctx_7b4526505f5c, worktree act-a-poc) |
| B | T2, T3 | `app/src/main/installCommand.ts`(+test), `app/src/main/index.ts`, `app/src/main/senderAllowed.ts`(+test), `app/src/main/agentAuth/ipc.ts`(+test), `app/src/main/settings.ts`(필요 시), `app/src/preload/index.ts`(+test), 관련 main test | 없음 (Cursor 하한·Copilot은 A 뒤 후속) | Claude Opus high (IPC 입력 경계와 파일 쓰기, 하한 판정이 틀리면 구버전 CLI가 `update`를 프롬프트로 받는다) | `npm --prefix app test`, typecheck, build | 진행 (ctx_89bd31a67ab5, worktree act-b-main) |
| B-review | B diff 리뷰 | 없음(보고만) | B | Codex gpt-6-astra medium (판단 위주 리뷰, 다른 계열 관점) | `/code-review` 보고 | 대기 |
| C | T4 | `app/src/renderer/agentStep.ts`(+test), `app/src/renderer/agentAuthView.ts`(+test), `app/src/renderer/Onboarding.tsx`, `app/src/renderer/SettingsAgents.tsx`(+test) | B 통합 (preload `openInstall` 타입) | Claude Opus high (마지막 요청 소유권, POSTMORTEM 2026-10-25 함정, 실제 앱 probe) | `npm --prefix app test`, typecheck, `/runtime-test` | 대기 |
| C-review | C diff 리뷰 | 없음(보고만) | C | Codex gpt-6-astra medium (상태 전이와 순서 판단) | `/code-review` 보고 | 대기 |
| T5 | 승격과 정리 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/BACKLOG.md`, `docs/features/agent-cli-terminal/` 삭제 | A·B·C 통합 | conductor | tasks.md T5 검증, `/verify` | 대기 |

- tasks.md 항목 대응: T1→A, T2·T3→B, T4→C, T5→conductor. 소유자 없는 항목은 없다.

## 파일 겹침과 순서

- A와 B는 겹치지 않는다 → 병렬.
- C는 B가 바꾸는 preload `DoanApi` 타입에 의존한다 → B 통합 뒤 시작.
- design.md는 A만 쓴다. B의 후속(Cursor 하한, Copilot update 경로)은 A 통합 뒤 B worker에 새 Task로 보낸다.
- 실제 앱 GUI probe는 A(PoC)와 C(`/runtime-test`)가 겹치지 않게 한다. C는 A가 끝난 뒤에만 시작하므로 겹치지 않는다.

## 리뷰·검증 기록

(진행하면서 적는다)
