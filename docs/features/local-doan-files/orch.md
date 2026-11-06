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
7. 모델: 구현은 Claude, 독립 리뷰는 Codex `gpt-6-astra` medium(교차 리뷰, 사용자 상시 권한과 memory의 혼합 방식).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| F | T1 | `schema/app-socket.v2.schema.json`, `schema/fixtures/app-socket-v2/`, `app/src/formats/types.ts`의 onboarding 형식, 두 쪽 fixture 테스트, Go 쪽 v2 형식 정의(필요하면) | 없음 | Claude Sonnet high — 형식 하나지만 이전 CLI·앱과의 호환(`additionalProperties: false`)을 판단해야 한다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, typecheck | 대기 |
| G | T2, T3, T6 | `cli/**`(skill.md 포함), 필요하면 `eval/scenarios/` 새 시나리오, `docs/USABILITY-EVAL.md`의 기록 | F 통합 | Claude Opus high — 파일 경쟁·링크·원자적 쓰기가 틀리면 사용자 저장소를 망친다 | `go test ./...`, `go vet ./...`, `/agent-eval` O1,O2,O3,O3b × claude,codex, eval을 바꾸면 `verify.mjs --eval` | 대기 |
| A | T4, T5 | `app/src/main/**`, `app/src/renderer/**`, `app/src/preload/**`(F가 고친 `types.ts` 부분 제외) | F 통합. runtime-test·design-sync는 G 통합 뒤 | Claude Opus high — 셋업 경로 네 곳, 잠금·focus·다시 읽기 규칙이 얽혀 있다 | `npm --prefix app test`, typecheck, build; 후속 `/runtime-test`, `/design-sync` | 대기 |
| R-F, R-G, R-A | 각 배치 `/code-review` | 보고만 | 해당 배치 완료 | Codex gpt-6-astra medium — 다른 계열의 판단 리뷰 | 🔴 0 | 대기 |
| T7 | 문서 승격, 디렉터리 삭제 | `docs/**`, README | 모든 배치 통합 | 지휘자 | `verify.mjs`(필요하면 `--eval`), `rg -n "local-doan-files" docs app cli .agents eval AGENTS.md` 없음 | 대기 |

T0(초안)은 끝났다(사용자 확정).

## 겹침과 순서

- F → (G ∥ A). G는 `cli/**`, A는 `app/src/**`만 고쳐 겹치지 않는다. F의 `types.ts`·schema는 F만 고친다. A가 형식을 더 바꿔야 하면 멈추고 보고한다.
- G 통합 + A 통합 → A 후속(`/runtime-test`, `/design-sync`) → T7 → 통합 `/verify` → push·PR → merge.

## 진행 기록
