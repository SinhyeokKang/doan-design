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

(DX · DC가 끝나면 비교 결과와 고른 근거, 가져온 부분을 적는다)

## 진행 기록

(배치가 진행되면 추가한다)
- 2026-10-25: Run `run_359b36a6d1f1`. 1파 시작 — DX(`ctx_093e979c49d0`, Codex Astra high), DC(`ctx_b847abb7d217`, Claude Opus high), A1(`ctx_3f5a39709ce3`, Codex Astra medium), A2(`ctx_dab1218179e6`, Claude Sonnet high). 네 워커 모두 `launch.effective`가 요청과 같다.
- 2026-10-25: A1 완료(`b1fd6bd` test, `07d1213` feat, 브랜치 `SinhyeokKang/ph-a1`). `go test`·`go vet` 통과 보고. 교차 리뷰 R-A1(`ctx_fa92402422c6`, Claude Opus high)을 띄웠다. B1(`ctx_85f01e5e411d`)은 A1 터미널을 그대로 이어 쓴다(같은 패키지·같은 모델). R-A1 지적은 B1 진행 중 후속 메시지로 보낸다.
- 2026-10-25: A2 완료(`8310558`, 브랜치 `SinhyeokKang/ph-a2`). typecheck·test 통과 보고(59 files, 1340 tests). 차이: `/ship`의 red 선확인과 별도 `/code-review`·`/refactor`를 건너뛰었다. `classifyPick`에 `refuse` 결과를 더했다(`error`·`cliError`는 기존 `openDecision` 규칙을 따름). 교차 리뷰 R-A2(Codex Astra medium)가 리뷰 단계를 대신한다. A2는 B2를 막지 않도록 먼저 통합하고, 리뷰 지적은 A2 워커가 후속 커밋으로 고친다.
- 2026-10-25: A2를 통합했다(`af2aae3`). 통합 HEAD에서 typecheck·test(1340) 통과. R-A2(`ctx_2099fac0462e`, Codex Astra medium), B2(`ctx_1560d42af729`, Claude Opus high, worktree `ph-b2`) 시작.
- 2026-10-25: R-A1 결과 🔴 0 · 🟡 1(submodule·bare·separate-git-dir I/O 픽스처 누락) · ⚪ 5. A1을 그대로 통합하고, 🟡1과 ⚪2~5는 B1에 후속 메시지로 보냈다. 보고서: `.scratch/orch/projects-home/review-A1.md`.
