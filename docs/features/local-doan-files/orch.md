# local-doan-files — orch

- 원천: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 초안 `.doan/canvases/local-doan-files.html`(사용자 확정, design §3.4).
- 시작 hash: `c5ff2373`(origin/main). 통합 branch: `feat/local-doan-files`. chain 아님.
- 상시 권한(사용자, 2026-11-07): Codex worker 허용, 작업에 필요한 권한 전부(임시 repo의 실제 git 테스트, `/runtime-test`, `/design-sync`, T6의 실제 Claude Code·Codex `/agent-eval`), 통합 gate 통과·문서 승격·feature 디렉터리 삭제 뒤 최신 origin/main 위로 rebase하고 자기 PR을 merge.
- Codex 주간 사용량: 42%(rollout `rate_limits` `window_minutes: 10080`, 2026-11-07).

## 결정 기록

모두 지휘자 판단이다. 사용자에게 물을 새 제품·범위 결정은 없었다.

1. **CLI↔앱 계약 이름**(design §2.2가 `/tdd`로 미룬 이름; G와 A가 병렬이라 지금 고정한다. 근거: ARCHITECTURE §12 'Optional keys are omitted, never `null`'):
   - 플래그: `doan init --storage local|repo`, `doan config --storage local|repo`, `doan onboarding project select|clone --storage local|repo`. 기본은 `repo`.
   - `doan ls` 결과: `storage: "repo" | "local" | "unknown"`(항상 있음), `storageReason?: "not_git" | "git_unreadable" | "exclude_unwritable"`(없으면 키를 뺀다). Git 저장소가 아니면 `storage: "repo"`, `storageReason: "not_git"`.
   - `doan config` 결과: 읽기 전용 호출에도 같은 `storage`·`storageReason?`를 싣는다(Project Settings가 `doan config`로 읽음). `--storage` 쓰기 결과의 나머지 필드(쓴 파일 목록, 안내 문장)는 G가 정하고 handoff에 적는다. 앱은 그 필드에 기대지 않는다.
   - exclude 라벨: 문자열 `.git/info/exclude` 하나(`init` `created`, onboarding `changes`).
2. **onboarding v2 형식의 세부**(모드 필드 이름과 생략 시 기본, inspection의 `changes`를 모드별로 어떻게 싣는지, 로컬 셋업 거절의 실패 코드)는 F가 design §5와 위 1번 이름에 맞춰 정하고 handoff에 적는다. F를 통합한 뒤 G와 A가 그 schema를 따른다.
3. 기존 프로젝트는 exclude 쌍이 없으므로 Include in Git으로 읽힌다(마이그레이션 없음; spec 결정 8).
4. guide 크기: `doan skill` 출력은 약 20,696 B, 예산은 21,600 B(`cli/internal/cli/skill_test.go`)다. T6 변경은 약 900 B 안에 들어가야 하고, 넘으면 다른 곳을 줄인다. 예산 자체는 올리지 않는다.
5. `/runtime-test`와 `/design-sync`는 실제 CLI의 `--storage`가 필요하므로 G와 A를 둘 다 통합한 뒤 A worker의 후속 Task로 돈다.
6. `/agent-eval`(T6)은 CLI만 쓰므로 G worker가 자기 branch에서 `npm --prefix app run package` 뒤 돈다.
7. 모델(사용자 결정, 2026-11-07, Claude 7일 사용량 84%·Codex 주간 42%를 보고): G는 Codex `gpt-6-astra` medium, A는 Claude Opus high다. 리뷰는 구현과 다른 계열이다(F·A는 Codex `gpt-6-astra` medium, G는 Claude Sonnet high).
8. F 리뷰 🟡 1(구 CLI의 plain inspect가 이미 로컬인 프로젝트의 응답을 읽지 못함): 응답의 `storage`는 요청에 `storage`가 있을 때만 싣고, 새 CLI는 `--storage`가 주어졌을 때만 보낸다. 근거: ARCHITECTURE §4 'update stays in v3'(새 앱은 이전 요청을 모두 받는다). 지휘자 판단.
9. `init`·`config`의 저장 위치 실패도 onboarding 코드를 쓴다(exit 5, F가 `ExitCode`에 넣음): Git 아님은 `local_not_git`, exclude·Git 메타데이터 실패는 `local_exclude_failed`다. G는 처음에 `usage_error`와 `internal_error`(ARCHITECTURE §12에서 exit 1은 '버그')로 냈다. 그래서 앱이 셋업 전 폴더에서 이유를 코드로 가를 수 없었다(R-G 🟡3). design §2.3의 `usage_error`를 바꾼다. 지휘자 판단.
9a. 이미 로컬인 root에서 명시한 `init --storage repo`는 거절하고 `doan config --storage repo`를 안내한다. `init` 결과에 `storage`를 싣는다. 모드를 읽을 때는 최종 링크인 exclude도 따라 읽고(git과 같음), 쓸 때만 거절한다(`exclude_unwritable`). 플래그 없는 init은 모드를 정말 알 수 없을 때만 실패한다. `config --storage`는 다른 쓰기 플래그와 함께 쓸 수 없다. 근거: spec 결정 6(모드는 root 단위이고 셋업이 바꾸지 않음), 사용자가 명시한 값을 조용히 바꾸지 않음. 지휘자 판단(R-G 결정 A·C, 🟡5).
10. design §3.1 마지막 항목(re-root 안내가 그 저장소의 모드를 말함)은 A가 빠뜨렸으므로 A 수정 회차에 넣는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| F | T1 | `schema/app-socket.v2.schema.json`, `schema/fixtures/app-socket-v2/`, `app/src/formats/types.ts`의 onboarding 형식, 두 쪽 fixture 테스트, Go 쪽 v2 형식 정의(필요하면) | 없음 | Claude Sonnet high — 형식 하나지만 이전 CLI·앱과의 호환(`additionalProperties: false`)을 판단해야 한다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, typecheck | 통합 |
| G | T2, T3, T6 | `cli/**`(skill.md 포함), 필요하면 `eval/scenarios/` 새 시나리오, `docs/USABILITY-EVAL.md`의 기록 | F 통합 | Codex gpt-6-astra medium — 파일 경쟁·링크·원자적 쓰기가 틀리면 사용자 저장소를 망친다. 판단이 많아 Astra(결정 7) | `go test ./...`, `go vet ./...`, `/agent-eval` O1,O2,O3,O3b × claude,codex, eval을 바꾸면 `verify.mjs --eval` | 대기 |
| A | T4, T5 | `app/src/main/**`, `app/src/renderer/**`, `app/src/preload/**`(F가 고친 `types.ts` 부분 제외) | F 통합. runtime-test·design-sync는 G 통합 뒤 | Claude Opus high — 셋업 경로 네 곳, 잠금·focus·다시 읽기 규칙이 얽혀 있다 | `npm --prefix app test`, typecheck, build; 후속 `/runtime-test`, `/design-sync` | 대기 |
| R-F, R-G, R-A | 각 배치 `/code-review` | 보고만 | 해당 배치 완료 | R-F·R-A는 Codex gpt-6-astra medium, R-G는 Claude Sonnet high — 구현과 다른 계열의 판단 리뷰 | 🔴 0 | 대기 |
| T7 | 문서 승격, 디렉터리 삭제 | `docs/**`, README | 모든 배치 통합 | 지휘자 | `verify.mjs`(필요하면 `--eval`), `rg -n "local-doan-files" docs app cli .agents eval AGENTS.md` 없음 | 대기 |

T0(초안)은 끝났다(사용자 확정).

## 겹침과 순서

- F → (G ∥ A). G는 `cli/**`, A는 `app/src/**`만 고쳐 겹치지 않는다. F의 `types.ts`·schema는 F만 고친다. A가 형식을 더 바꿔야 하면 멈추고 보고한다.
- G 통합 + A 통합 → A 후속(`/runtime-test`, `/design-sync`) → T7 → 통합 `/verify` → push·PR → merge.

## 진행 기록

- F: Sonnet high, `4ab12aaa`·`116e6075`, gate 전부 exit 0. R-F(Codex Astra medium): 🔴0 🟡1 → 수정 1회차 `5b8551c8`(gate exit 0). 통합: `aeca3488`·`c905e26c`·`b25b1e4b`.
- G·A 시작(`54b486f1` 기준). G의 verify `--eval`: main `00302c30`이 authStatus에 `generation`을 더해 생긴 기존 eval 테스트 drift를 G가 별도 커밋으로 고침. self-test의 실제 상태 비교가 사용자의 실행 중인 Doan.app(agent-auth 프로필 갱신) 때문에 실패 → 사용자 승인으로 지휘자가 Doan.app을 Quit(2026-11-07 03:36 KST). eval 끝나면 사용자에게 다시 열어도 된다고 알린다.
- G: Codex Astra medium, 커밋 6개(`8a2b3e3d`…`1b23af8f`). 실제 eval `ldf-g-261107` O1·O2·O3·O3b·O4 × claude·codex 10/10 통과, 실제 상태 변화 없음. guide 20,696 → 20,451 B. 사용자에게 Doan.app을 다시 열어도 된다고 알림. R-G(Claude Sonnet high): 🔴0 🟡6 🟢8 → 수정 1회차 보냄(결정 9·9a, guide에서 범위 밖으로 지운 문장 복원).
- A: Opus high, `ce8aba75`·`7e57eb60`, test 9181·typecheck·build exit 0. R-A(Codex Astra medium): 🔴1(설정이 커밋된 저장소를 clone하며 로컬을 고르면 무시됨) 🟡3(열린 Project Settings가 focus 다시 읽기를 반영하지 않음, 로컬 셋업 뒤 group 다시 읽기 없음, re-root 안내의 모드) 🟢1 → 수정 1회차 보냄(결정 9·9a 계약 반영 포함).
