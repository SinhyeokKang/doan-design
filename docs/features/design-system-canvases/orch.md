# design-system-canvases — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `69949c0a`(main)
- 통합 브랜치: `feat-design-system-canvases`
- 모델 경계: 사용자가 이 세션에서 Codex 워커를 허락했다("T8을 포함하여 Codex 워커 사용 허가"). 구현은 Claude가 맡는다. Codex는 교차 리뷰, eval 시나리오 배치, 문서 승격 배치, T8의 Codex 생성 벌에 쓴다.

## 결정 기록

- 지휘자 판단 — T8의 preset 수정은 지휘자가 품질 기준에서 원인과 고칠 방향을 정하고, preset 배치(BP)의 워커가 `document.md`에 적용한다. 근거: 지휘자는 배치 코드를 고치지 않는다(orchestrate). design.md '품질 기준'의 "지휘자가 고친다"는 판단과 방향을 정한다는 뜻으로 읽는다.
- 지휘자 판단 — T8 생성 세션 두 개는 orchestration 워커로 띄운다. brief에는 사람의 요청 문장, branch CLI를 `PATH` 앞에 두는 환경 설정, `.doan/ds/`에만 쓰기, commit과 handoff만 적는다. 분할 방법은 적지 않는다(tasks T8).
- 지휘자 판단 — T8의 지우기(`buzz-ds.html`·`notice.html`), 고른 벌 가져오기, DESIGN.md·DIRECTORY.md 참조 수정은 지휘자의 통합 commit과 문서 commit으로 한다. 근거: 캔버스 파일과 문서만 바뀌고 배치 코드가 아니다.
- 지휘자 판단 — T9의 `/code-review`는 배치마다 독립 리뷰 워커로 한다(orchestrate §3). T8 preset 수정분은 BP 리뷰가 다시 본다. `verify.mjs --eval`은 통합 HEAD에서 지휘자가 돌린다.
- 지휘자 판단 — `/runtime-test`와 `/design-sync`는 해당 배치 워커가 한다. BA와 BS는 직렬이라 GUI probe가 겹치지 않는다.
- 지휘자 판단 — R-BC 🔴(symlink인 기본 서빙 디렉터리가 설정 없이 실제 대상 전체를 서빙): `.doan/ds`만이 아니라 기본 디렉터리 셋(`canvases`·`ds`·`assets`) 모두에서 symlink인 기본 경로를 기본 범위에서 뺀다. 명시한 `serve`는 그대로 둔다. 근거: ARCHITECTURE §3은 기본 디렉터리 밖의 자산을 설정하라고 하고, 같은 결함이 기존 기본 경로에도 있었다. BC 수정 1회차와 `/postmortem`으로 처리한다.
- 지휘자 판단 — catalog의 `document` 설명도 `.doan/ds/` 캔버스로 고친다(BP 후속 2). 근거: 본문과 목록 설명이 어긋나면 안 된다. 공용 fixture `list.json`도 BP가 맡는다.
- 지휘자 판단 — BA handoff의 계획 줄 해석을 받아들인다: 복사한 뒤 원본을 지우면 남은 행이 하나라 앱이 복사본을 따라가고, 중복 id 알림은 같은 id의 행이 둘일 때 나온다. tasks T5의 해당 줄은 계획의 오기다.
- 지휘자 판단 — R-BE 🟡1: D13은 상태 프레임을 새로 더하는 것을 허용한다(`document.md`의 "each topic or state group its own frame"과 맞춘다). 근거: 확인을 더 확실히 하는 쪽은 preset이 허용하는 선택을 checker가 떨어뜨리지 않는 것이다.
- 지휘자 판단 — T10 `/agent-eval`의 실제 에이전트 실행은 AGENTS.md '/agent-eval' 상시 예외로 진행한다. `node eval/run.ts`로 실행하고 실제 HOME에는 쓰지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| BC | T2 | `cli/internal/repo/`, `cli/internal/check/`, `cli/internal/cli/`의 ls·check·config 테스트 | 없음 | Claude Opus medium: 목록·범위·check 규칙을 넓히는 일이라 판단은 중간이고, 틀리면 앱과 eval이 모두 흔들려 테스트를 꼼꼼히 써야 한다 | tasks T2 검증 줄 | 통합 `8a00ae56..a88ff62b`(리뷰 2회, 🔴 1 해결) |
| BP | T3, T8 preset 수정 | `cli/internal/cli/skill.md`·`skill_test.go`·`design_skill_test.go`, `cli/internal/designskill/` | 없음 | Claude Opus high: `document.md`의 새 기본이 T8 품질을 정하고, 출력 예산 안에서 문장을 고쳐야 한다 | tasks T3 검증 줄 | 통합 `38371488..7eee432c`(후속 1, 리뷰 1회 🟡 1 해결, 수정은 지휘자가 diff 확인). T8 조정 대기 |
| BA | T4(`sidebarGroups`·`ui-state` 제외), T5 | `app/src/formats/`의 새 경로 모듈, `app/src/main/`(watch·designChange·shell·thumbnails·conversation), `app/src/renderer/`의 `homeComposer.ts`·`App.tsx` toast·`quickOpen.ts`·`ProjectSettingsDialog.tsx`, 각 테스트 | 없음 | Claude Opus high: 감시 계약(`Change.names`)을 바꾸는 일이고 POSTMORTEM의 감시 함정이 여럿 걸린다 | tasks T4·T5 검증 줄, `/runtime-test` | 통합 `0c8690ca..01b9b528`(구현 commit 둘을 하나로 합침). runtime probe 21/21. 미해결: 초기 1회 burst 교체 뒤 프레임 공백 15초(재현 안 됨, R-BA는 기존 기제로 판단, 차단 아님) |
| BS | T4의 `sidebarGroups`·`ui-state` sanitizer, T6, `/design-sync` | `ShellSidebar.tsx`, 새 `sidebarGroups` 모듈, `styles.css`, `QuickOpenDialog.tsx`, `app/src/restore/uiState.ts`, `app/src/main/uiState.ts`, `App.tsx`(묶음 열기 계기), `docs/DESIGN.md`(측정값), 각 테스트 | BA 통합 | Claude Opus high: 키 모델·저장·자동 펼침과 초안 맞추기에 판단이 들고, POSTMORTEM의 sidebar 함정이 걸린다 | tasks T6 검증 줄, `/runtime-test`, `/design-sync` | 진행 중 |
| BE | T7 | `eval/` | BC 통합 | Codex gpt-6-astra medium: 기존 시나리오 틀을 따르지만 checks·rubric 설계에 판단이 든다. 다른 계열이 시나리오를 쓰면 Claude 쪽 해석에 기대지 않는다 | tasks T7 검증 줄 | 통합 `2b57f79c..8819a4a7`(수정 1회). 통합 HEAD에서 eval unit 198 pass, self-test PASS |
| BR-c | T8 Claude 벌 | 자기 worktree의 `.doan/ds/` | BP·BS(`/design-sync` 포함) 통합 | Claude Opus high: 사용자 지시(모델별 생성) | handoff와 commit | 대기 |
| BR-x | T8 Codex 벌 | 자기 worktree의 `.doan/ds/` | BP·BS(`/design-sync` 포함) 통합 | Codex gpt-6-astra medium: 사용자 지시(모델별 생성) | handoff와 commit | 대기 |
| R-BC | BC 리뷰 | 없음(보고만) | BC | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료(1회: 🔴 1·⚪ 1, 2회: 지적 없음) |
| R-BP | BP 리뷰(T8 preset 수정분 포함) | 없음(보고만) | BP | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 1회 완료(🟡 1·⚪ 1). T8 수정분 리뷰 대기 |
| R-BA | BA 리뷰 | 없음(보고만) | BA | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료(🔴 0·🟡 0·⚪ 2) |
| R-BS | BS 리뷰 | 없음(보고만) | BS | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| R-BE | BE 리뷰 | 없음(보고만) | BE | Claude Opus medium: Codex가 쓴 배치를 다른 계열이 본다 | `/code-review` 보고 | 완료(🟡 3·⚪ 3, BE 수정 1회로 해결. 수정분은 지휘자가 gate로 확인) |
| G | T9 | 없음 | 모든 구현·T8 통합 | 지휘자 | `node .agents/skills/verify/scripts/verify.mjs --eval` exit 0 | 대기 |
| V | T10 | `docs/USABILITY-EVAL.md` | G | Claude Opus medium: `/agent-eval` 절차를 따르고 실패를 분류하는 데 판단이 든다 | tasks T10 검증 줄 | 대기 |
| D | T11(USABILITY-EVAL 제외) | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/DIRECTORY.md`, `README.md`, `docs/features/buzz-restyle/spec.md` | G | Codex gpt-6.1-sol high: tasks T11의 줄 목록을 따라 고치는 일이라 판단보다 단계가 많다 | tasks T11 검증 줄 | 대기 |
| R-D | D 리뷰 | 없음(보고만) | D | Claude Opus medium: 결정이 현재 규칙으로 바르게 옮겨졌는지 다른 계열이 본다 | 문서 리뷰 보고 | 대기 |

- 겹침과 순서
  - 첫 물결은 BC·BP·BA다. 셋은 파일이 겹치지 않아 병렬로 돌린다. BC와 BP는 `cli/internal/cli/`의 서로 다른 파일만 만진다.
  - BS는 BA 통합 뒤에 시작한다. 경로 모듈과 `App.tsx`가 겹치기 때문이다.
  - BE는 BC 통합 뒤에 시작한다. self-test가 `.doan/ds/`를 읽는 CLI를 빌드하기 때문이다. BS와는 파일이 겹치지 않는다.
  - BR-c·BR-x는 BP와 BS(`/design-sync` 포함)가 통합된 뒤 병렬로 돌린다. 두 벌은 서로 다른 worktree에 만든다.
  - V와 D는 G 뒤에 병렬로 돌린다. 두 배치는 파일이 겹치지 않는다. 기능 디렉터리 삭제는 V·D를 통합한 뒤 지휘자가 한다.
- tasks 항목 매핑
  - T1은 완료다.
  - T2 → BC, T3 → BP, T4 → BA·BS, T5 → BA, T6 → BS, T7 → BE
  - T8 → BR-c·BR-x·BP·지휘자
  - T9 → 리뷰 배치·G, T10 → V, T11 → D·지휘자
  - 주인이 없는 항목은 없다.

## T8 회차 기록

(회차마다 모델별 결과, 못 미친 기준, preset 수정, 고른 벌과 이유를 적는다.)
