# project-settings — orch

출처: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 부모: [buzz-restyle](../buzz-restyle/design.md) '자식 진행 규칙'. 체인: [chain-261103](../chain-261103/chain.md) 링크 2.

- 시작 해시: `7119e66e`(origin/main)
- 통합 브랜치: `feat/project-settings`
- 지휘자: Claude Code 세션 06b8fea0, worktree `project-settings-orch`
- 권한(체인 파일): 이 링크의 PR을 main에 병합한다. Codex 작업자를 섞어 쓸 수 있다.

## 결정 기록

- 초안: `buzz-project-settings.html`(61d515e8)은 체인 시작 점검에서 사용자가 확정했다(tasks '선행 조건'). `/design-sync`(T9)의 기준이다.
- Codex 사용: 지휘자 판단으로 이 링크에서는 Codex 작업자를 쓰지 않는다. 근거: 링크 1 끝에 Codex 상태줄의 주간 남은 양이 12%로 체인 기준(10%)에 가깝고, T8 `/agent-eval`이 실제 Codex를 돌려 같은 한도를 쓴다. 리뷰는 Claude 서브에이전트(Sonnet, 판단이 무거운 diff는 Opus)로 한다.
- 시작 시 사용량: Claude 7일 76%(2026-11-04 13:59 KST 초기화), Codex 대시보드 18%. Opus는 App 연결(A2)에만 쓴다.
- T10 문서 승격: 지휘자 판단. PRODUCT·ARCHITECTURE·BACKLOG와 DESIGN의 설명 문장은 지휘자가 통합 뒤에 쓴다. DESIGN의 측정값은 `/design-sync`를 맡은 배치 C가 쓴다. 근거: orchestrate §5와 design-sync skill. 링크 1과 같다.
- 사이드바 프로젝트 메뉴: 링크 1이 사이드바에서 여는 메뉴에 불투명 예외 `.shell-side-menu`를 붙였다. A2가 메뉴 항목을 바꿀 때 이 클래스를 유지한다(체인 인계 기록).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A1 | T1, T2, T3 | `app/src/renderer/addProjectsNav.ts`·`projectSettingsRules.ts`·새 `ProjectSettingsPage.tsx`와 각 테스트, 페이지 스타일(`styles.css`의 새 규칙만) | 없음 | Claude Sonnet high: 순수 함수와 연결 전 컴포넌트라 판단 범위가 좁지만 상태·포커스 표가 많다. Claude 사용량을 아낀다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| B | T7 | `cli/internal/cli/skill.md`, `cli/internal/cli/skill_test.go` | 없음 | Claude Sonnet medium: 문서 다섯 곳과 고정 테스트. 사실은 design '가이드 수정'에 있다 | `go test ./...`, `go vet ./...` | 대기 |
| RA1 | A1 리뷰 | 읽기만 | A1 | Claude Sonnet 서브에이전트: 순수 함수·컴포넌트 diff | `/code-review` 보고서 | 대기 |
| RB | B 리뷰 | 읽기만 | B | Claude Sonnet 서브에이전트: 작은 문서 diff, 사실 대조 | `/code-review` 보고서 | 대기 |
| E | T8 | `docs/USABILITY-EVAL.md`, `.scratch/` | B 통합 | Claude Sonnet medium: 정해진 명령을 돌리고 기록한다 | `node eval/run.ts --scenarios O1,O2,D12,D9`, 직전 라운드 대비 | 대기 |
| A2 | T4, T5 | `app/src/renderer/`(`App.tsx`, `shellNavigation.ts`, `ShellSidebar.tsx`, `Home.tsx`, `ProjectOverview.tsx`, `CanvasController.ts`, `ProjectSetupDialog.tsx`, `configBridge.ts`, 다이얼로그 삭제, 각 테스트), `app/src/main/index.ts`, `app/src/preload/index.ts`, A1 파일의 연결에 필요한 수정 | A1 통합 | Claude Opus high: 잠금·origin·포커스·바깥 진입점이 얽힌 App 분기이고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, typecheck, build, `grep` 확인 | 대기 |
| RA2 | A2 리뷰 | 읽기만 | A2 | Claude Opus 서브에이전트: 잠금·포커스 회귀 판단 | `/code-review` 보고서 | 대기 |
| C | T6, T9 | `.scratch/`, `docs/DESIGN.md`의 측정값, design-sync가 고치는 앱 코드(그때 A2는 끝나 있다) | A2 통합 | Claude Sonnet high: 실제 앱 probe와 computed style 측정. 판단이 무거운 지적은 지휘자가 가른다 | probe 완료 표식·exit 0, real-state 전후 같음, `measure.mjs` | 대기 |
| 지휘자 | T10 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/DESIGN.md` 설명 문장, 이 디렉터리, 병합 뒤 부모 문서 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, T10 grep | 대기 |

리뷰 지적의 `/refactor`는 그 배치의 작업자가 한다.

## 파일 겹침과 순서

- A1과 B는 파일이 겹치지 않아 병렬로 돈다.
- E는 B를 통합한 feat에서 패키지를 빌드한다. GUI를 띄우지 않으므로 A2와 병렬로 둔다.
- A2는 A1의 파일과 `App.tsx` 등을 고치므로 A1 통합 뒤에 시작한다. T5는 T4와 같은 파일을 고쳐 같은 배치다.
- C는 A2 통합 뒤에 시작한다. 실제 앱 probe는 C만 돌린다.

## 기록

- 2026-11-03 Run `run_f6208075f892`. A1: task `task_106c3583acf7`, dispatch `ctx_cbbbc7bfc61b`, worktree `project-settings-a1`(브랜치 `SinhyeokKang/feat-project-settings-a1`), launch.effective claude sonnet high. B: task `task_e58f8c7d394e`, dispatch `ctx_cbbd464d3b06`, worktree `project-settings-b`(브랜치 `SinhyeokKang/feat-project-settings-task`), launch.effective claude sonnet medium. 둘 다 30ece8ae에서 시작했다.
