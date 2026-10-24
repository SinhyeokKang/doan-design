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
