# keep-out-git-init 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- conductor는 Claude Code이고, 워커도 Claude 모델만 쓴다. 리드는 develop checkout 세션이다.
- 시작 hash: `2657b22a`(origin/develop). 통합 브랜치: `feat/keep-out-git-init`. Orca run: `run_7f2f69807208`.
- 공유 증거 위치: conductor checkout의 `.scratch/keep-out-git-init/`(절대 경로 `/Users/sinhyeokkang/orca/workspaces/doan-design/keep-out-git-init-orch/.scratch/keep-out-git-init/`). PoC 스크립트와 로그, 워커 handoff 사본을 여기 둔다.

## 결정 기록

- conductor 판단 — tasks 1: PoC는 conductor가 직접 돌렸다. 배치 코드가 아니고, 멈춤 조건 판단이 conductor 몫이기 때문이다. 결과는 tasks.md 'PoC 결과'에 있다. 멈춤 조건 두 개 모두 해당하지 않아 설계를 바꾸지 않는다. Homebrew git은 이 머신에 없어 확인하지 못했다.
- conductor 판단 — 사용자 상시 조건(리드 brief): 실제 앱 probe(`/design-sync`, `/runtime-test`)는 포커스를 가져가거나 창을 덮지 않게 백그라운드로 돌린다. computed style과 DOM 확인을 우선하고, 화면이 켜져 있어야 하거나 픽셀이 필요한 단계는 미루고 PR에 '하지 못함'으로 적는다. 에이전트 로그인은 요구하지 않는다.
- conductor 판단 — tasks 9: self-test(`node eval/run.ts --self-test --scenarios O4`)만 돌리고, 실제 라운드는 리드에게 먼저 묻는다. 새 시나리오 추가 여부도 리드를 거쳐 사용자에게 묻는다.
- conductor 판단 — CLI 환경 계약: Go CLI는 표준 환경 변수 `PATH`와 `DEVELOPER_DIR`를 `Context`로 받는다(design '실행' git 위치). 앱은 CLI를 띄울 때 로그인 셸 PATH와 clone이 쓰는 `DEVELOPER_DIR`를 이 이름으로 넘긴다. 별도 변수 이름을 만들지 않는다. 이 계약 덕분에 A·B 배치가 서로를 기다리지 않는다.
- 리드 지시: 사용자가 리드 세션에서 초안 `.doan/canvases/keep-out-git-init.html`의 design preset 검토(critique, audit, clarify, 보고만)를 돌린다. 초안이 바뀌면 리드가 develop에 push하고 알린다. 그 전에는 conductor와 워커가 캔버스를 고치지 않고, B의 renderer·design-sync 부분은 리드의 알림을 받은 뒤 시작한다. B가 그 전에 시작하면 main 부분(tasks 4 TS의 main 항목, 6)만 한다.
- 리드 알림: 검토 결과가 develop에 들어왔다(초안 `16a7420d`, design.md 결정 `e676bb46`). conductor가 `origin/develop`을 통합 브랜치에 병합했다(`f091ee8c`). A·B는 자기 브랜치를 통합 브랜치 위로 rebase한다. Go는 HOME 전용 message·NextSteps(`--git-init` 없음)를 더한다. B의 main은 HOME과 그 위에서 `notGit`을 계획에 쓰지 않는다. 바뀐 초안은 사용자가 아직 다시 확인하지 않았으므로, B의 2단계는 리드가 확인을 알릴 때까지 계속 보류한다.
- conductor 판단 — 통합 순서: B의 실제 CLI 테스트가 A의 Go를 기다리므로, A를 리뷰 전에 통합 브랜치에 먼저 cherry-pick했다. 리뷰에서 나온 수정은 A 워커가 추가 커밋으로 내고 conductor가 다시 cherry-pick한다. PR은 리뷰의 🔴가 0이 된 뒤에만 연다.
- A handoff의 계획과 다른 점: `types.ts`에는 CLI 오류 코드 union이 없어 `git_init_failed`는 `envelope.go`에만 있다. `Context` 주입은 표준 환경을 담은 `Context.Git`(`repo.GitHost`) 하나다. `.git` 확보 때 EEXIST는 `git_init_failed`다. `cleanup_failed` message에 절대 경로가 들어가므로 tasks 10에서 ARCHITECTURE §12 'Storage'의 "message에 경로 없음" 문장에 예외를 적는다.
- R-A 결과(`review-A.md`, conductor `.scratch/keep-out-git-init/`에 사본): 🔴 0, 🟡 3. 리뷰어가 사용자 결정으로 올린 두 항목은 conductor가 정했다.
  - conductor 판단 — HOME을 알 수 없을 때(`HOME`이 비거나 없음) `--git-init`은 거절한다(fail-closed). 근거: spec 완료 조건 7은 환경과 관계없이 HOME에서 만들지 않는다.
  - conductor 판단 — HOME과 그 위에서 `--git-init` 없이 `--storage local`을 실행해도 HOME 전용 `local_not_git`(NextSteps에 `--git-init` 없음)을 낸다. 근거: design.md '3. 실행'은 HOME에서 `--git-init`을 권하지 않는다. 권하면 사람에게 의미 없는 동의를 묻게 된다.
  - 수정 라운드 1은 새 워커 `ctx_b3bec9d29f8e`(`kogi-a`, Opus high)가 한다. 원래 A 터미널은 재사용할 수 없어(`agent_unconfigured`) release했다.
- A 수정 라운드 1 통합: `bb4dde50`(🟡 3, ⚪ 1·5·6 반영, cwd `ls`의 `storageReason`은 원래 있었고 테스트만 더함).
- R-B1 결과(`review-B1.md`): B 1단계(app main)에 🔴 0, 🟡 4. 리뷰어가 사용자 결정으로 올린 한 항목은 conductor가 정했다.
  - conductor 판단 — 로그인 셸 probe가 실패하면 `--git-init` 실행의 PATH를 비워 Go가 `git_missing`으로 거절하게 한다. 근거: spec 완료 조건 8은 clone과 같은 규칙을 요구하고, clone은 probe 실패 때 `git_missing`이다. PRODUCT §3 'Launch environment'도 실행한 터미널의 PATH가 git에 닿지 않게 한다.
  - B가 2단계를 진행 중이므로 수정은 B의 `worker_done` 뒤 새 Task로 보낸다(2단계 리뷰 R-B2와 함께).
- 리드 알림: 사용자가 바뀐 초안(`16a7420d`)을 확인했다(`d2d54fb9`). conductor가 병합했고, B에 'UI go'를 보냈다.

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| (conductor) | 1(PoC) | `.scratch/keep-out-git-init/`, tasks.md 'PoC 결과' | 없음 | — | 로그와 결과 기록 | 완료 |
| (사용자) | 2(초안) | `.doan/canvases/keep-out-git-init.html` | — | — | 사용자 확인 | 완료(시작 전) |
| A | 3 전부, 4의 Go 항목, 5 | `schema/**`, `cli/**`(`skill.md`, `onboarding.go` 포함), `app/src/formats/types.ts`, 형식 fixture | 없음 | Opus high — 배타적 `.git` 확보, dev/ino 되돌리기, 환경 허용 목록, git 위치 판정처럼 틀리면 사용자 폴더를 망가뜨리는 경쟁·보안 판단이 많다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`의 schema·fixture 테스트, `npm --prefix app run typecheck` | 구현 완료, 통합(tasks 3 `c93bde4b`, tasks 4 Go `14ba8dda`, tasks 5 `5b8c88ce`), 리뷰 대기. 워커 `kogi-a` `ctx_d24068c0c6ce`는 수정 라운드용으로 retain |
| B | 4의 TS 항목, 6, 7(`/design-sync` 포함) | `app/src/main/**`(`formats/types.ts` 제외), `app/src/renderer/**`, `.scratch/design-sync/keep-out-git-init-*/` | A의 tasks 3 커밋 통합 | Opus high — 동의 근거별 `--git-init` 전달, Project Settings 확인 창의 잠금·deep link·포커스·외부 변화 처리, 첫 구현 design-sync | typecheck·lint·test, design-sync 측정 통과, `verify.mjs --eval` PASS | 진행(1단계 main, 2단계 'UI go' 보냄), 워커 `kogi-b` `ctx_48f44956b076`. 2단계는 리드 알림 뒤 'UI go' |
| R-A·R-B | 각 배치 `/code-review` | 보고만 | 해당 배치 | Opus high — 두 배치 모두 경쟁·동의 경계가 핵심이다 | 🔴 0 | R-A 🔴0 🟡3 → 수정 통합 `bb4dde50`. R-B1(1단계) 🔴0 🟡4 → B 2단계 뒤 수정. R-B2 대기 |
| T | 8(`/runtime-test`) | `.scratch/keep-out-git-init/runtime/`, 보고만 | A·B 통합 | Sonnet high — 정해진 probe 목록을 격리 조건으로 실행하는 단계가 많고 판단은 적다 | spec 완료 조건 1–9 probe 로그 | 대기 |
| (conductor) | 9(self-test, 실제 라운드는 리드 확인) | `docs/USABILITY-EVAL.md` | A 통합 | — | `self-test PASS`, exit 0 | 대기 |
| (conductor) | 10(승격과 삭제) | PRODUCT·ARCHITECTURE·DESIGN·USABILITY-EVAL, feature 디렉터리 삭제 | 8·9 | — | 문서 diff 검토, verify PASS | 대기 |

## 파일 겹침과 순서

- A 시작 → A가 tasks 3을 먼저 커밋 → conductor가 그 커밋을 통합 브랜치에 cherry-pick → B 시작(통합 브랜치 기준). 이후 A·B 병렬.
- A와 B의 파일은 겹치지 않는다. `app/src/formats/types.ts`와 `schema/`는 A만 쓴다. B가 형식을 더 바꿔야 하면 conductor에게 먼저 묻는다.
- tasks.md는 conductor만 쓴다. 워커는 결과를 handoff 파일에 쓰고, conductor가 통합 때 체크한다.
- 실제 앱 probe(B의 design-sync, T)는 conductor가 한 번에 하나씩 허락한다. 정적 게이트와 겹치지 않게 한다.
