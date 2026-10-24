# projects-home — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `c18b084`(main)
- 통합 브랜치: `feat-projects-home`(main에서 만듦)
- 지휘: Claude Code(Opus). 직렬 체인 1번 고리(`.scratch/handoff/orch-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-25 | Codex 워커를 넓게 쓴다. 배치마다 Opus와 Codex를 섞고, 각 배치는 다른 모델 계열이 리뷰한다 | 사용자: "codex 허가. 여기저기 많이 사용해도 됨"(체인 인계 규칙) |
| 2026-10-25 | 초안은 Codex(`gpt-6-astra` high)와 Claude(Opus high)가 같은 요청으로 각자 그린다. 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분을 붙인다. Astra high는 평소 상한(medium)을 넘지만 이 단계에 한해 허락받았다 | 사용자 요구(tasks.md '앞선 단계') |
| 2026-10-25 | **초안 게이트는 지휘자가 확정한다. 사용자의 앱 내 확인은 건너뛴다.** 초안을 고른 뒤 지휘자가 초안 워커와 완성도 피드백 루프를 돌려도 된다. 세 기능(projects-home·design-nav·app-setup)에 공통이다 | 사용자: "디자인 드래프트는 지휘자가 컨펌하고 진행하면 됨. 내 검토는 스킵해." |
| 2026-10-25 | task 10의 실제 Finder 드래그 앤 드롭은 격리된 dev 앱(임시 HOME·userData)에서 computer-use로 시도한다. 안 되면 보고서와 PR에 "수동 확인 필요"로 남긴다 | 사용자 답(추천안) |
| 2026-10-25 | 초안 요청: 캔버스 `design/projects-home.html`, canvas id `projects-home`. 프레임 id는 `home`, `home-empty`, `row-states`, `add-checklist`, `setup-confirm`, `toast`, `drop-overlay`, `workspace`다. 제거 초안 가드 문구(프로젝트·캔버스 이름)와 메뉴 활성 표는 `workspace` 프레임 안의 타일로 그린다 | 지휘자 판단 — tasks.md '앞선 단계'가 꼽은 상태 목록을 프레임으로 나눴다. 기존 초안(`onboard`, `select-inspect`)의 kebab-case id 관례를 따랐다 |
| 2026-10-25 | `/design-draft`가 사용자에게 묻도록 한 질문(단계 1)과 단계 4의 사용자 확인은 지휘자가 받는다. 초안 워커는 지휘자에게 `ask`로 묻는다 | 지휘자 판단 — 초안 게이트를 지휘자가 맡게 되었다 |
| 2026-10-25 | 작업공간 사이드바는 shipped 트리 모양과 섹션 제목 Projects를 유지하고 현재 루트만 받는다. Open Project… 버튼은 뺀다 | 지휘자 판단(DX 질문) — spec의 추가 진입점은 Add Project…(⌘O)와 홈의 + 버튼이다. 그 버튼이 부르는 `openFolder()`는 마법사용 단일 선택 계약이라 새 추가 흐름을 우회한다. 공정성을 위해 DC에도 같은 지침을 보냈다 |
| 2026-10-25 | 스캔 중 체크 목록: 후보가 'Checking…'(비활성)으로 차례로 채워지고 진행 줄(n of N checked)을 보인다. Add는 스캔이 끝날 때까지 비활성이다. Cancel은 남은 실행을 끝내고 대화상자를 닫으며 아무것도 저장하지 않는다 | 지휘자 판단(DC 질문) — design.md는 Cancel이 남은 실행을 끝낸다고만 정했다. 대화상자 Cancel의 보통 의미와 맞는 가장 단순한 쪽이다. DX에도 같은 지침을 보냈다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| DX | 앞선 단계(초안, Codex 쪽) | `design/projects-home.html`(자기 worktree) | — | Codex Astra high (사용자 지정) | `doan check` · `doan ls`(프레임 id 일치) | 대기 |
| DC | 앞선 단계(초안, Claude 쪽) | `design/projects-home.html`(자기 worktree) | — | Claude Opus high (사용자 지정, 공정 비교) | 위와 같다 | 대기 |
| A1 | 1 | `cli/internal/repo/` 새 파일(git 해석 순수 함수 + 테스트) | — | Codex Astra medium (경로 해석 함정이 많다 — POSTMORTEM 2026-10-21) | `go test ./...` · `go vet ./...` | 대기 |
| A2 | 2, 3 | `app/src/main/folders.ts`(+test), 새 순수 함수 파일(+test) | — | Claude Sonnet high (순수 함수, 규칙이 문서에 다 있다) | `npm --prefix app test` · `typecheck` | 대기 |
| B1 | 4 | `cli/internal/repo/`(I/O), `cli/internal/cli/`(`ls`, `Context`), MCP `ls` | A1 | Codex Astra medium (파일시스템 I/O·realpath·루프) | `go test ./...` · `go vet ./...` | 대기 |
| E | 5 | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/` | B1 통합 | Codex Sol high (절차가 길고 판단은 적다) | task 5 확인 | 대기 |
| B2 | 6, 7, 8 | `app/src/main/`(index·cli·view·folders 주변, 새 IPC 파일), `app/src/preload/`, `app/src/main/index.test.ts` | A2 통합 | Claude Opus high (IPC 보안 계약, 동시 스캔, 가드) | `npm --prefix app test` · `typecheck` | 대기 |
| C | 9, 10, 11 | `app/src/renderer/`, `app/e2e/`, `docs/DESIGN.md` | B2 통합, 초안 확정 | Codex Astra medium (UI 범위가 크다. B2와 다른 계열) | `npm --prefix app test` · `typecheck` · `e2e`(최종 PASS, exit 0), `/design-sync` 완료 조건 | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | 다른 계열: A1·B1·C → Claude Opus high, A2·B2 → Codex Astra medium | `/code-review`, 🔴 0 | — |
| F | 12 | 고침은 각 배치 소유자에게 돌린다 | 전부 통합 | 전체 `/code-review`: Claude Opus high. `/runtime-test`·DnD computer-use: 지휘자 | task 12 명령 모두 통과 | 대기 |
| G | 13 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 이 디렉터리 삭제 | F | Codex Astra medium (문서 정확성), 리뷰 Claude Sonnet high | task 13 확인 | 대기 |

tasks.md의 앞선 단계와 task 1~13은 모두 위 배치 중 하나에 속한다.

## 순서와 파일 겹침

- 1파: DX ∥ DC ∥ A1 ∥ A2. `design/` · `cli/internal/repo/` · `app/src` 순수 함수는 서로 겹치지 않는다. DX와 DC는 같은 파일을 각자 worktree에 그리고, 고른 쪽만 통합한다.
- 2파: B1(A1 뒤) ∥ B2(A2 뒤). Go와 `app/src/main` · preload는 겹치지 않는다. B2는 `FolderEntry.git`을 CLI 결과로 받기만 하므로 B1과 병렬로 돈다. 테스트는 고정 입력을 쓴다.
- E는 B1 통합 뒤에 B2 · C와 병렬로 돈다(`docs/USABILITY-EVAL.md`만 고친다).
- C는 B2 통합과 초안 확정 뒤에 돈다. task 9 → 10 → 11 순서다.
- 각 배치는 `--worktree new-child --base-branch feat-projects-home`로 만든 자기 worktree에서 돈다.

## 초안 리뷰

2026-10-25, 지휘자가 두 초안의 Chromium 스크린샷 8장씩(`.scratch/orch/projects-home/shots-DX/`, `shots-DC/`)과 인계 문서를 비교했다. 두 초안 모두 `doan check` 오류 0(기존 `mock.css` 경고 6), `doan ls`의 프레임 id 8개가 요청과 같다.

- **DC(Claude Opus, `213c0ff`)를 골랐다.** 그린 상태가 더 많다. 모노레포 카드, 키보드 포커스, 긴 이름·경로와 툴팁, 선택할 것이 없는 체크 목록, 상단 바 변형(캔버스 없음·detached·비 git·긴 값), 비 git 초안 가드 문구, 네이티브 메뉴 타일, 토스트 변형(일시정지·긴 라벨)을 그렸다. 홈 줄에 경로를 둘째 줄로 보여서 같은 이름의 워크트리를 구분하기 쉽다.
- DX(Codex Astra high, `6ed416e`)의 장점: 작업공간 오른쪽 패널을 shipped 그대로 옮겼고, 워크트리 전환기에 문제 상태 다섯 가지를 모두 비활성으로 그렸으며, 상태 줄에 Reading…까지 있다. 줄 상태를 표 하나에 설명과 함께 정리했다.
- DC에 붙일 것(수정 1차): ① 오른쪽 패널을 shipped Canvas·Comments 그대로 ② 전환기 문제 상태 다섯 가지 타일 ③ 상태 줄 Reading… ④ Open 줄의 긴 Selected 값. 모두 DX에서 가져온다.
- DC에서 고칠 것: ⑤ CLI 오류 이유 줄 삭제(design.md는 칩과 Retry·Remove만 정했다) ⑥ 상태 줄 동작을 문제 상태 표와 같게(Config error에 Details 추가).
- DC 질문에 대한 지휘자 결정: "<repo> and N worktrees"의 N은 줄 수 − 1이다. 모노레포 카드 이름은 design.md 규칙(`git.main`의 basename, 예 "web")을 유지하고, 바꿀지는 후속 후보로만 적는다. 줄이 하나인 카드의 브랜치 칩은 비활성으로 그린다.
- 수정 1차에서 실제 doan 앱(격리된 Playwright `_electron`)으로 초안을 열어 프레임별 스크린샷을 남기게 했다(`shots-DC-app/`).
- **수정 1차(`1738b62`) 확인, 2026-10-25 지휘자 확정.** ①~⑥이 모두 반영됐다. `doan check` 오류 0, `doan ls` 프레임 id 8개가 같다. 격리된 실제 앱에서 연 스크린샷(`shots-DC-app/`)으로 홈·작업공간·전환기·상태 줄·가드를 확인했고, 일반 Chromium과 배치가 같다. 남은 것: `drop-overlay` 프레임 뒤의 오른쪽 패널은 축약된 채다(오버레이가 덮어 비교 대상이 아니므로 그대로 둔다). 사용자 확인은 결정 로그대로 건너뛴다.
- DX 초안 사본은 `.scratch/orch/projects-home/draft-DX/`에 두었다. DX 커밋은 통합하지 않는다. `ph-dx` worktree는 기능이 끝날 때까지 남긴다.

## 진행 기록

(배치가 진행되면 추가한다)
- 2026-10-25: Run `run_359b36a6d1f1`. 1파 시작 — DX(`ctx_093e979c49d0`, Codex Astra high), DC(`ctx_b847abb7d217`, Claude Opus high), A1(`ctx_3f5a39709ce3`, Codex Astra medium), A2(`ctx_dab1218179e6`, Claude Sonnet high). 네 워커 모두 `launch.effective`가 요청과 같다.
- 2026-10-25: A1 완료(`b1fd6bd` test, `07d1213` feat, 브랜치 `SinhyeokKang/ph-a1`). `go test`·`go vet` 통과 보고. 교차 리뷰 R-A1(`ctx_fa92402422c6`, Claude Opus high)을 띄웠다. B1(`ctx_85f01e5e411d`)은 A1 터미널을 그대로 이어 쓴다(같은 패키지·같은 모델). R-A1 지적은 B1 진행 중 후속 메시지로 보낸다.
- 2026-10-25: A2 완료(`8310558`, 브랜치 `SinhyeokKang/ph-a2`). typecheck·test 통과 보고(59 files, 1340 tests). 차이: `/ship`의 red 선확인과 별도 `/code-review`·`/refactor`를 건너뛰었다. `classifyPick`에 `refuse` 결과를 더했다(`error`·`cliError`는 기존 `openDecision` 규칙을 따름). 교차 리뷰 R-A2(Codex Astra medium)가 리뷰 단계를 대신한다. A2는 B2를 막지 않도록 먼저 통합하고, 리뷰 지적은 A2 워커가 후속 커밋으로 고친다.
- 2026-10-25: A2를 통합했다(`af2aae3`). 통합 HEAD에서 typecheck·test(1340) 통과. R-A2(`ctx_2099fac0462e`, Codex Astra medium), B2(`ctx_1560d42af729`, Claude Opus high, worktree `ph-b2`) 시작.
- 2026-10-25: R-A1 결과 🔴 0 · 🟡 1(submodule·bare·separate-git-dir I/O 픽스처 누락) · ⚪ 5. A1을 그대로 통합하고, 🟡1과 ⚪2~5는 B1에 후속 메시지로 보냈다. 보고서: `.scratch/orch/projects-home/review-A1.md`.
- 2026-10-25: A1을 통합했다(`9c3cc41`, `8021f62`). 통합 HEAD에서 `go test ./...`·`go vet ./...` 통과. R-A1 워커는 해제했다.
- 2026-10-25: R-A2 결과 🔴 0 · 🟡 3(저장된 비 git 경로 중복 판정, 정상 비 git 행의 과거 common 재사용, 토스트 교체 후 focus 정지) · ⚪ 1(워크트리 하위 항목 기본 체크 해제 미검증 → B2에 전달). A2 워커에 A2-fix를 보냈다(이번에는 red 선확인을 요구). R-A2 워커는 해제했다.
- 2026-10-25: A2 터미널은 재사용이 거부되어(`agent_unconfigured`) 해제했다. 같은 worktree(`ph-a2`)에 새 Claude Sonnet high 워커로 A2-fix(`ctx_234db83dd97d`)를 시작했다.
- 2026-10-25: B1 완료(`ed1f596`, `55bac2c`, `257f15f`). R-A1의 🟡1과 ⚪2~4를 반영했다. `go test`·`go vet` 통과 보고. 교차 리뷰 R-B1(Claude Opus high)을 띄웠다. E(agent-eval)는 R-B1 뒤 통합한 HEAD에서 돈다(리뷰 수정으로 재실행하지 않도록).
- 2026-10-25: DC 초안 완료(`213c0ff`, worktree의 Claude 쪽). check 오류 0, 프레임 id 일치 보고. DX를 기다려 함께 비교한다.
- 2026-10-25: A2-fix 완료(`09cf689` test: red 4개 확인, `c41c63c` fix). 지휘자가 diff를 확인했다(변경 3줄, 리뷰 지적과 일치). 통합하고 A2 워커를 해제했다.
- 2026-10-25: A2-fix 통합(`be5cf55`, `c3bd3e4`), 통합 HEAD test 1345·typecheck 통과. `ph-a2` worktree를 `git cherry`로 확인한 뒤 제거했다.
- 2026-10-25: DX 초안 완료(`6ed416e`). 초안 비교 결과 DC를 골랐다(위 '초안 리뷰'). DX 워커는 해제했다. DC 터미널은 재사용이 거부되어(`agent_unconfigured`) 같은 worktree(`ph-dc`)에 새 Claude Opus high 워커로 DC-rev(`ctx_56230c95afca`)를 시작했다.
- 2026-10-25: R-B1 결과 🔴 0 · 🟡 1(워크트리 항목마다 `diskSpelling`이 디렉터리 전체를 다시 읽어 200개 상한이 I/O를 제한하지 못함) · ⚪ 5. B1 터미널에 B1-fix를 보냈다. 지휘자 결정: 없는 HOME이면 어휘 비교로 대신한다. 읽을 수 없는 `worktrees`는 "등록 없음"으로 보고 `git`의 나머지 필드는 유지한다(design.md "그 항목만 버린다"). 심볼릭 링크 HEAD는 branch·detached를 생략한다. R-B1 워커는 해제했다.
- 2026-10-25: B1-fix 완료(`a25c4c4` test, `576c55a` fix, `0dce325` postmortem). 지휘자가 git.go diff를 확인했다. B1 전체(6커밋)를 통합한다.
- 2026-10-25: B1 6커밋을 통합했다(`c2b9684`~`569b3dc`). 통합 HEAD에서 `go test`·`go vet`·앱 test(1345) 통과. B1 워커를 해제하고 `ph-a1`을 `git cherry`(+ 없음)로 확인한 뒤 제거했다. E(`ctx_11d216927dd4`, Codex Sol high, worktree `ph-e`) 시작.
- 2026-10-25: 초안 확정. DC 커밋(`213c0ff`, `1738b62`)을 통합한다. DC-rev 워커를 해제하고 `ph-dc`를 정리한다.
- 2026-10-25: B2 완료(`b37606e` test, `2c2bb3c` feat, `0a5acfc` refactor). test 1424, typecheck, e2e PASS(2c2bb3c 기준) 보고. 계획과의 차이: 추가 결과를 이벤트 하나(`folders:add-outcome`)로 보낸다, `folders:forget-removal`·`menu:state` IPC 추가, Locate는 스캔·확인이 필요한 폴더를 거부한다, Edit 메뉴를 role 대신 풀어 썼다. B2를 먼저 통합해 C를 띄우고, 교차 리뷰 R-B2(Codex Astra medium)를 병렬로 돌린다. 리뷰 지적은 B2 워커가 고친다.
- 2026-10-25: B2 통합(`059afc6`, `73fc472`, `163331e`). 통합 HEAD에서 typecheck·test(1429)·`go test` 통과. R-B2(`ctx_5a3bbcfd5bf6`, Codex Astra medium)와 C(`ctx_ae984f676a32`, Codex Astra medium, worktree `ph-c`) 시작. B2 워커는 해제했다(Claude 터미널 재사용이 거부되므로 수정은 같은 worktree의 새 워커가 맡는다).
- 2026-10-25: 통합 HEAD(`163331e` 위)에서 e2e 최종 `runtime-test: PASS`, exit 0(지휘자 실행).
- 2026-10-25: C 질문 — task 9의 e2e 게이트를 task 10과 합쳐 확인해도 되는가 → 된다. 기존 e2e의 검증 내용은 줄이지 않고 새 UI 경로로 옮긴다(지휘자 판단: 단일 루트 사이드바로 바뀌면 기존 복구 검증이 홈 UI를 필요로 한다).
- 2026-10-25: R-B2 결과 🔴 0 · 🟡 2(읽지 못한 부모 폴더를 저장소 없는 폴더로 판정해 설정 확인으로 보냄, 다음 제거의 저장이 끝날 때까지 이전 removalId가 유효) · ⚪ 2(Locate 수정의 postmortem 누락 등). B2-fix를 `ph-b2`의 새 Claude Opus high 워커로 보냈다. POSTMORTEM 항목은 충돌을 피하려고 인계 문서로 받고 지휘자가 넣는다. R-B2 워커는 해제했다.
- 2026-10-25: C 질문 — 체크 목록 표시 필드 부족. 지휘자 결정: 스캔 스냅샷에 원본 폴더(name/path)와 준비된 후보의 canvasCount를 더한다(B2-fix 추가 항목). 워크트리 하위 항목의 브랜치는 넣지 않고 폴더 이름 + 경로로 보인다(워크트리마다 `doan ls`를 더 돌리지 않기 위해). 초안과의 차이로 `docs/DESIGN.md`에 기록한다.
- 2026-10-25: E 완료(`1c91380`). 새 실패 0(24 pass, 기존 Codex R1b·R2 실패만 반복 재현), 실제 설정 11개 불변. 결과는 `.scratch/agent-eval/projects-home-ls*`로 복사했다. 후속 후보: R5 루브릭 경로 불일치(시나리오 문서 문제, 이 기능 범위 밖).
- 2026-10-25: C 질문 — e2e `readFolders` 이전 방식. 지휘자 결정: 루트별 캔버스 목록은 각 루트를 열어 역할·이름으로 검증한다. 다른 루트의 watcher 대기는 preload 구독이 아니라 Home 줄(캔버스 수·최근 변경)로 읽는다(R3로 선택이 유지되고, e2e는 역할·접근 이름으로만 읽는다는 2026-10-22 결정).
- 2026-10-25: B2-fix 통합(`bf7baa5`~`7a954bd`)과 지휘자 POSTMORTEM 커밋(항목 3개). 통합 HEAD typecheck·test(1437) 통과. C에 통합 사실과 새 필드를 알렸다. B2-fix 워커 해제, `ph-b2` 제거. 교차 리뷰 R-B2fix(Codex Astra medium) 시작.
- 2026-10-25: R-B2fix 결과 새 지적 없음. 두 🟡의 수정 전 실패를 독립 재현했다. 워커 해제.
- 2026-10-25: C 질문 — 고아가 된 `folders:close`·`closeFolder` 제거를 승인했다(B2 인계가 예고한 고아, C의 전환으로 생김). 별도 refactor 커밋으로 남긴다.
- 2026-10-25: C 질문 — 오류·loading 줄의 브랜치 표시. 지휘자 결정: 마지막 브랜치를 기억하지 않는다(Home은 경로 + ◌, 작업공간 오류 상태는 브랜치 칩 숨김). CLI 오류 원문은 code 서식 없이 둔다. 둘 다 `docs/DESIGN.md`에 초안과의 편차로 기록한다. task 9·10은 `78290f3`까지 e2e PASS·test 1441 보고.
- 2026-10-25: C가 독립 리뷰를 요청했다(`65e8eab...fb10d38`, 비교 근거 `evidence-C/`: 27상태·172쌍). R-C(Claude Opus high)를 띄웠다. design-sync가 요구하는 독립 리뷰를 겸한다.
- 2026-10-25: C 완료(`a21fccf`, 9커밋, B2 수정분을 merge 커밋 `d996c5e`로 받음). unit 1441·typecheck·go·전체 e2e PASS 보고. 측정 7912행 = 일치 7321 · 비표시 동등 483 · 문서화된 차이 108. R-C 결과를 받고 고친 뒤 `feat-projects-home`에 merge로 통합한다(merge 커밋이 있어 cherry-pick 대신).
- 2026-10-25: R-C 결과 🔴 1(체크 목록이 넘쳐도 스크롤되지 않음, 저장소 14개로 재현) · 🟡 6(캔버스 영역의 옛 사이드바 안내 문구, 상태 줄 Locate…가 홈으로 튕김, 가드 문구에 브랜치 없음, 닿는 상태 미측정, e2e `plain.hint` 동어반복, 고아 `ShellApi.close`) · ⚪ 8. C 터미널에 C-fix를 보냈다. R-C 워커는 해제했다.
- 2026-10-25: R-C가 물은 결정 4개는 기능 문서와 확정 초안으로 정했다(지휘자 판단). ① design-sync에 닿는 상태(체크 목록 ready 줄·워크트리 하위 줄, 상태 줄 Config error·Not set up, Added 토스트)를 더한다(design-sync 전제: 닿는 상태는 측정한다) ② 경로는 확정 초안대로 HOME 아래를 `~/…`로 줄인다(HOME은 main이 준다, 설정 확인만 절대 경로) ③ 사이드바 ×의 접근 이름을 "Remove <name> from doan"으로 바꾼다(동작이 제거·Undo로 바뀌었다) ④ 카드 키보드는 design.md대로 Tab은 카드 사이, ↑↓는 줄 사이, Enter로 연다. 줄 ··· 버튼은 Tab 순서에서 빼고 Shift+F10·ContextMenu 키로도 연다.
- 2026-10-25: C-fix 질문 — Home Selected 표시를 'button #target'에서 초안대로 'tag · id'로 바꾼다(spec '요소 태그·id', 확정 초안).
- 2026-10-25: C-fix가 후속 리뷰를 요청했다(`a21fccf...6232e74`, 측정 31상태·198쌍). R-Cfix(Claude Opus high) 시작.
- 2026-10-25: R-Cfix 결과 🔴 1(전체 e2e가 6232e74에서 exit 1, runtime.ts가 옮겨진 Config error 상세를 옛 구조로 읽음) · 🟡 2(제거·Locate 뒤 카드 행이 Tab 순서에서 빠짐, close() 테스트 삭제로 remove()의 늦은 읽기 경쟁 검증이 사라짐) · ⚪ 2. 진행 중인 C-fix에 후속 메시지로 보냈다. R-Cfix 워커 해제.
- 2026-10-25: C-fix 완료(`ce25b5d`). unit 1445·typecheck·go·전체 e2e PASS, 키보드 회귀 red→green 보고. 남긴 것: 설정 안 됨·오류 루트로 Locate하면 이전 캔버스 문구가 남는 ⚪(후속 후보). `SinhyeokKang/ph-c`를 merge로 통합한다.
