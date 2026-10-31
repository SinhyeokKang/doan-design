# design-system-canvases — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `69949c0a`(main)
- 통합 브랜치: `feat-design-system-canvases`
- 모델 경계: 사용자가 이 세션에서 Codex 워커를 허락했다("T8을 포함하여 Codex 워커 사용 허가"). 구현은 Claude가 맡는다. Codex는 교차 리뷰, eval 시나리오 배치, 문서 승격 배치, T8의 Codex 생성 벌에 쓴다.

## 결정 기록

- 지휘자 판단 — T8의 preset 수정은 지휘자가 품질 기준에서 원인과 고칠 방향을 정하고, preset 배치(BP)의 워커가 `document.md`에 적용한다. 근거: 지휘자는 배치 코드를 고치지 않는다(orchestrate). design.md '품질 기준'의 "지휘자가 고친다"는 판단과 방향을 정한다는 뜻으로 읽는다.
- 지휘자 판단 — T8 생성 세션 두 개는 orchestration 워커로 띄운다. brief에는 다음만 적는다.
  - Home의 `document` 추천과 같은 요청 문장("Document the design system of doan-design")과 preset 이름
  - branch CLI를 `PATH` 앞에 두는 환경 설정
  - 쓰기 범위: `.doan/ds/`와, preset이 이끄는 규칙 문서. 어떤 규칙 문서를 고쳤는지 보고한다.
  - `docs/features/`를 읽지 않기. 그 안에 원하는 분할 단위가 적혀 있어 결과를 오염시키기 때문이다.
  - preset이 사용자에게 물으라고 하면 지휘자에게 `ask`로 묻고, 지휘자가 사용자 대신 답한다.
  - commit과 handoff

  분할 방법은 적지 않는다(tasks T8).
- 지휘자 판단 — T8의 지우기(`buzz-ds.html`·`notice.html`), 고른 벌 가져오기, DESIGN.md·DIRECTORY.md 참조 수정은 지휘자의 통합 commit과 문서 commit으로 한다. 근거: 캔버스 파일과 문서만 바뀌고 배치 코드가 아니다.
- 지휘자 판단 — T9의 `/code-review`는 배치마다 독립 리뷰 워커로 한다(orchestrate §3). T8 preset 수정분은 BP 리뷰가 다시 본다. `verify.mjs --eval`은 통합 HEAD에서 지휘자가 돌린다.
- 지휘자 판단 — `/runtime-test`와 `/design-sync`는 해당 배치 워커가 한다. BA와 BS는 직렬이라 GUI probe가 겹치지 않는다.
- 지휘자 판단 — R-BC 🔴(symlink인 기본 서빙 디렉터리가 설정 없이 실제 대상 전체를 서빙): `.doan/ds`만이 아니라 기본 디렉터리 셋(`canvases`·`ds`·`assets`) 모두에서 symlink인 기본 경로를 기본 범위에서 뺀다. 명시한 `serve`는 그대로 둔다. 근거: ARCHITECTURE §3은 기본 디렉터리 밖의 자산을 설정하라고 하고, 같은 결함이 기존 기본 경로에도 있었다. BC 수정 1회차와 `/postmortem`으로 처리한다.
- 지휘자 판단 — catalog의 `document` 설명도 `.doan/ds/` 캔버스로 고친다(BP 후속 2). 근거: 본문과 목록 설명이 어긋나면 안 된다. 공용 fixture `list.json`도 BP가 맡는다.
- 지휘자 판단 — BA handoff의 계획 줄 해석을 받아들인다: 복사한 뒤 원본을 지우면 남은 행이 하나라 앱이 복사본을 따라가고, 중복 id 알림은 같은 id의 행이 둘일 때 나온다. tasks T5의 해당 줄은 계획의 오기다.
- 지휘자 판단 — R-BE 🟡1: D13은 상태 프레임을 새로 더하는 것을 허용한다(`document.md`의 "each topic or state group its own frame"과 맞춘다). 근거: 확인을 더 확실히 하는 쪽은 preset이 허용하는 선택을 checker가 떨어뜨리지 않는 것이다.
- 사용자 결정 — shell sidebar 너비를 260px에서 220px로 줄인다("220정도로 줄여줘"). 지휘자 판단: 정확히 220px로 하고, 배치 BW(Claude Opus medium)가 맡는다. 초안 캔버스는 고치지 않고 DESIGN.md에 측정값을 남긴다.
- 지휘자 판단 — T8 1회차(BR-c·BR-x)는 BW와 병렬로 돌려 preset 품질을 먼저 본다. 1회차 결과의 app shell은 260px을 담을 수 있으므로, 남기는 벌은 BW 통합 뒤의 회차에서 나와야 한다.
- 지휘자 판단 — T10 `/agent-eval`의 실제 에이전트 실행은 AGENTS.md '/agent-eval' 상시 예외로 진행한다. `node eval/run.ts`로 실행하고 실제 HOME에는 쓰지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| BC | T2 | `cli/internal/repo/`, `cli/internal/check/`, `cli/internal/cli/`의 ls·check·config 테스트 | 없음 | Claude Opus medium: 목록·범위·check 규칙을 넓히는 일이라 판단은 중간이고, 틀리면 앱과 eval이 모두 흔들려 테스트를 꼼꼼히 써야 한다 | tasks T2 검증 줄 | 통합 `8a00ae56..a88ff62b`(리뷰 2회, 🔴 1 해결) |
| BP | T3, T8 preset 수정 | `cli/internal/cli/skill.md`·`skill_test.go`·`design_skill_test.go`, `cli/internal/designskill/` | 없음 | Claude Opus high: `document.md`의 새 기본이 T8 품질을 정하고, 출력 예산 안에서 문장을 고쳐야 한다 | tasks T3 검증 줄 | 통합 `38371488..7eee432c`(후속 1, 리뷰 1회 🟡 1 해결, 수정은 지휘자가 diff 확인). T8 조정 대기 |
| BA | T4(`sidebarGroups`·`ui-state` 제외), T5 | `app/src/formats/`의 새 경로 모듈, `app/src/main/`(watch·designChange·shell·thumbnails·conversation), `app/src/renderer/`의 `homeComposer.ts`·`App.tsx` toast·`quickOpen.ts`·`ProjectSettingsDialog.tsx`, 각 테스트 | 없음 | Claude Opus high: 감시 계약(`Change.names`)을 바꾸는 일이고 POSTMORTEM의 감시 함정이 여럿 걸린다 | tasks T4·T5 검증 줄, `/runtime-test` | 통합 `0c8690ca..01b9b528`(구현 commit 둘을 하나로 합침). runtime probe 21/21. 미해결: 초기 1회 burst 교체 뒤 프레임 공백 15초(재현 안 됨, R-BA는 기존 기제로 판단, 차단 아님) |
| BS | T4의 `sidebarGroups`·`ui-state` sanitizer, T6, `/design-sync` | `ShellSidebar.tsx`, 새 `sidebarGroups` 모듈, `styles.css`, `QuickOpenDialog.tsx`, `app/src/restore/uiState.ts`, `app/src/main/uiState.ts`, `App.tsx`(묶음 열기 계기), `docs/DESIGN.md`(측정값), 각 테스트 | BA 통합 | Claude Opus high: 키 모델·저장·자동 펼침과 초안 맞추기에 판단이 들고, POSTMORTEM의 sidebar 함정이 걸린다 | tasks T6 검증 줄, `/runtime-test`, `/design-sync` | 통합 `d5466a51..99ef8dc4`(리뷰 1회 🟡 1, 측정 보완으로 해결) |
| BE | T7 | `eval/` | BC 통합 | Codex gpt-6-astra medium: 기존 시나리오 틀을 따르지만 checks·rubric 설계에 판단이 든다. 다른 계열이 시나리오를 쓰면 Claude 쪽 해석에 기대지 않는다 | tasks T7 검증 줄 | 통합 `2b57f79c..8819a4a7`(수정 1회). 통합 HEAD에서 eval unit 198 pass, self-test PASS |
| BR-c | T8 Claude 벌 | 자기 worktree의 `.doan/ds/` | BP·BS(`/design-sync` 포함) 통합 | Claude Opus high: 사용자 지시(모델별 생성) | handoff와 commit | 5회 생성, 5회차 벌 통합 |
| BR-x | T8 Codex 벌 | 자기 worktree의 `.doan/ds/` | BP·BS(`/design-sync` 포함) 통합 | Codex gpt-6-astra medium: 사용자 지시(모델별 생성) | handoff와 commit | 5회 생성, 채택 안 됨 |
| R-BC | BC 리뷰 | 없음(보고만) | BC | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료(1회: 🔴 1·⚪ 1, 2회: 지적 없음) |
| R-BP | BP 리뷰(T8 preset 수정분 포함) | 없음(보고만) | BP | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 1회 완료(🟡 1·⚪ 1). T8 수정분 리뷰 대기 |
| R-BA | BA 리뷰 | 없음(보고만) | BA | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료(🔴 0·🟡 0·⚪ 2) |
| R-BS | BS 리뷰 | 없음(보고만) | BS | Codex gpt-6-astra medium: 다른 계열의 독립 리뷰 | `/code-review` 보고 | 완료(🟡 1·⚪ 1) |
| R-BE | BE 리뷰 | 없음(보고만) | BE | Claude Opus medium: Codex가 쓴 배치를 다른 계열이 본다 | `/code-review` 보고 | 완료(🟡 3·⚪ 3, BE 수정 1회로 해결. 수정분은 지휘자가 gate로 확인) |
| G | T9 | 없음 | 모든 구현·T8 통합 | 지휘자 | `node .agents/skills/verify/scripts/verify.mjs --eval` exit 0 | 대기 |
| BW | 사용자 요청: sidebar 220px | `app/src/renderer/styles.css`, 너비를 박은 TSX, 관련 테스트, `docs/DESIGN.md` | BS 통합 | Claude Opus medium: 값 하나지만 파생 치수와 측정 기록이 따라온다 | app test·typecheck·build, 격리 앱 측정 | 통합(측정 23/23, 지휘자가 diff와 스크린숏 확인). 사용자가 워커와 worktree를 직접 닫음 |
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

- 범용성 우선(사용자 "이 리포에만 적합하게 되는 건 금물. 범용적인 게 더 우선하는 가치"): preset 수정은 어느 프론트엔드 코드베이스에도 맞는 규칙으로만 한다. 이 repo의 이름·경로·예시를 preset에 넣지 않는다. 이 repo에서만 고칠 수 있는 결함은 preset을 바꾸지 않고 기록만 한다. 지휘자는 preset 수정마다 '다른 프로젝트의 에이전트를 잘못 이끌지 않는가'를 함께 판정하고, T10의 다른 seed 시나리오(D10d·D11e·D13)를 범용성 확인으로 쓴다.
- 반복 종료 조건: 5회차를 마지막으로 한다(4회차 뒤 사용자 결정 "그렇게 가자"). 5회차의 더 나은 벌을 남기고, 남은 결함은 이 문서와 PR에 알려진 한계로 적는다. 근거: 남은 결함이 규칙의 빈틈보다 모델 해석 편차에 가깝고, preset 출력 예산 여유가 57 B라 규칙을 더하면 과적합 위험이 커진다.

### 1회차 (base `7cc18893`, BW 통합 전)

- 판정 방법: 두 worktree의 `.doan/ds/`를 정적 서버와 Chromium으로 렌더해 깨진 요청, console error, 로드된 글꼴, 프레임 밖으로 넘친 요소를 세고, 캔버스 스크린숏을 지휘자가 직접 봤다(color, typography, button, notice, shell·sidebar 계열). 근거는 지휘자 scratchpad의 `judge/r1-c`, `judge/r1-x`에 있다.
- BR-c(Claude Opus high): 캔버스 35개. 깨진 요청 0, 글꼴 Geist, 넘침 0, 새 캔버스의 `doan check` 지적 0(남은 error 6은 main에 있던 `Sidebar.tsx` 참조).
  - 충족: 단위별 분할, 값이 `tokens.css`와 같음, 프레임마다 `data-doan-implements`, 상태 표본, 캔버스마다 구체적인 미정 항목, shell이 지금 코드(묶음, 썸네일, Add Projects·Projects·Settings)와 같다.
  - 못 미침: 여러 화면이 쓰는 `ProjectSetupDialog`를 클래스 사용처만 보고 뺐다. shell이 260px이다(BW 전 base).
- BR-x(Codex gpt-6-astra medium): 캔버스 48개. 깨진 요청 0, 글꼴 Geist, 넘침 0, 새 캔버스의 `doan check` 지적 0.
  - 못 미침: shell·sidebar·header가 지금 코드와 다르다(없는 Design·Conversation 탭, 묶음·썸네일 없음). 모든 캔버스에 같은 안내 문단 두 개가 반복된다. 스스로 그리는 것이 없는 wrapper(`changed-time`)를 캔버스로 만들었다.
- preset 수정 방향(BP에 보냄): (1) 공용 여부는 클래스가 아니라 그 컴포넌트를 렌더하는 화면 수로 판단한다. (2) 합성 화면은 지금 그 화면을 렌더하는 컴포넌트 코드에서 그린다. (3) 캔버스에는 그 캔버스에만 해당하는 한계를 적고, 공통 안내는 규칙 문서에 한 번만 적는다.
- 다음: preset 수정을 통합하고 BW(220px)가 들어간 base에서 두 모델이 다시 만든다.

### 2회차 (base `cf103162`: BW 220px, preset 1차 수정)

- BR2-c(Claude): 캔버스 42개. 깨진 요청 0, 넘침 0, `doan check`의 `.doan/ds/` 지적 0(지휘자가 다시 돌림).
  - 충족: shell이 220px과 묶음·상태·잠김·project menu까지 지금 코드와 같다. 여러 화면이 쓰는 대화상자(`project-setup` 등)를 포함했다. 캔버스마다 그 캔버스에 해당하는 설명만 있다.
  - 못 미침: 아이콘 경로 42개 가운데 2개(`chip`의 git-branch, `menu`의 settings)가 설치된 `lucide-react`와 다르다. 기억으로 그렸고 그 두 캔버스에는 표시하지 않았다. worktree에 `node_modules`가 없었던 환경 탓도 있다.
- BR2-x(Codex): 캔버스 46개. 반복 안내문은 없어졌다.
  - 못 미침: app shell 캔버스의 렌더가 깨진다(레이아웃이 프레임 밖으로 나가 겹친다. 에이전트가 렌더를 보지 않았다). 그리는 것이 없는 wrapper(`changed-time`)를 다시 캔버스로 만들었다. 아이콘을 글자로 바꿨다.
- 판단: BR2-c가 앞선다. 남은 결함 1건이라 3회차를 돈다.
- preset 수정 방향(범용): 아이콘은 프로젝트가 설치한 아이콘 패키지의 원본에서 옮긴다. 끝내기 전에 렌더된 캔버스를 보고 겹침·넘침을 고친다.
- 환경: 생성 worktree에서 의존성을 먼저 설치한다(`npm --prefix app ci`). 실제 개발 checkout과 같은 조건이다.

### 3회차 (base `548e1d60`: preset 2차 수정, 의존성 설치)

- BR3-c(Claude): 캔버스 35개. 깨진 요청 0, 넘침 0, `.doan/ds/` 지적 0, 아이콘은 설치된 `lucide-react`를 서버 렌더로 옮겼다(곡선 3개는 motion 표본). 상태가 풍부하다(대화상자의 기본·선택·오류·진행 중).
  - 못 미침: 앱 stylesheet 전체(91 KB)를 `.doan/assets/`에 복사해 링크했다(공개는 했지만 코드가 바뀌면 조용히 낡는다). 여러 화면이 쓰는 alert 아이콘 컴포넌트를 자기 캔버스 없이 다른 캔버스 안에만 그렸다.
- BR3-x(Codex): 캔버스 49개. 렌더 정상, 아이콘 lucide와 같음, app shell 구조가 지금 코드와 같다.
  - 못 미침: 묶음 라벨을 "Design System"으로 썼다(코드는 "Design system"). project setup 대화상자에 코드의 진행 중·오류 상태가 없다. button 캔버스 안에서 같은 설명이 프레임마다 반복된다.
- 판단: 아직 둘 다 결함이 있다. 상태 표현과 shell 충실도에서 BR3-c가 앞선다.
- preset 수정 방향(범용): 서빙 범위 밖 stylesheet는 캔버스에 필요한 규칙만 옮기고 파일 전체를 복사하지 않는다. 여러 화면이 쓰는 컴포넌트는 작거나 다른 캔버스 안에 함께 그려져도 자기 캔버스를 가진다. 같은 설명을 프레임마다 반복하지 않는다. 예산 여유가 94 B라 다른 문장을 줄여 자리를 만든다.

### 4회차 (base `57caf934`: preset 3차 수정)

- BR4-c(Claude): 캔버스 36개. 깨진 요청 0, 넘침 0, `.doan/ds/` 지적 0. stylesheet 통째 복사는 사라졌고 alert 아이콘이 자기 캔버스를 가졌다.
  - 못 미침: 앱 수준에서 한 번 마운트되지만 여러 화면에서 여는 대화상자(Quick Open, Project Settings, Project Setup)를 한 화면 것으로 분류해 뺐다(3회차에는 넣었다). project screen은 첫 단계만 그렸다.
- BR4-x(Codex): 캔버스 58개. 렌더 정상, shell 구조는 코드와 같다.
  - 못 미침: 상태가 얕다(sidebar는 기본 상태만). 한 화면에서만 쓰는 부분(댓글 삭제 대화상자 등)까지 캔버스로 나눴다.
- 판단: 두 벌 모두 결함. 남은 원인은 '여러 화면이 렌더한다'의 해석(앱 수준 대화상자)과 단계·상태를 다 그리지 않는 것이다.
- preset 수정 방향(범용): 공용 여부는 사람이 그것을 보는 화면 수로 센다. 앱 수준에 한 번 마운트돼도 여러 화면에서 열리면 공용이다. 단계(step)가 있는 단위는 단계마다 그린다. 예산 여유가 57 B라 다른 문장을 줄인다.

### 5회차 (base `d6b62aee`: preset 4차 수정) — 마지막

- 판정 도구 보정: 지휘자 렌더의 viewport를 캔버스마다 `doan:width`에 맞췄다(1400px 고정이면 1440~1560px 캔버스가 넘친 것처럼 보였다).
- BR5-c(Claude): 캔버스 37개. 깨진 요청 0, 넘침 0, `.doan/ds/` 지적 0, 아이콘은 설치된 `lucide-react`.
  - 충족: shell-layout이 220px·묶음·상태(slot, 읽기 오류, 잠김)·project menu·body panel까지 지금 코드와 같다. 앱 수준 대화상자(Quick Open, Project Settings, Project Setup, add-to-serve, remove)를 공용으로 넣었다. 서빙 범위 밖 규칙은 캔버스마다 필요한 것만 옮겨 적었다(공용 바탕은 3.6 KB `ds-canvas.css`). 지휘자가 찾은 결함은 없다.
- BR5-x(Codex): 캔버스 58개. `conversation-strip`·`doany`의 이미지 링크가 깨졌다(워커는 깨진 이미지 없음으로 보고). 한 화면 것과 큰 단위의 일부까지 캔버스로 나눴다.
- 선택: BR5-c를 남겼다(통합 `c8b76a09`, `133fbc56`). 이유: 품질 기준을 모두 채우고 결함이 없다. BR5-x는 깨진 링크와 지나친 분할이 있다.
- 알려진 한계(PR에 적는다)
  - 한 화면에서만 쓰는 ds 기본 요소(textarea, checkbox, switch)는 preset 규칙대로 캔버스를 만들지 않았다.
  - 렌더 확인은 headless Chromium뿐이고 Doan 앱 안의 계산 스타일과 대비는 재지 않았다.
  - 캔버스 분할 정도는 모델마다 다르다(Codex 46~58개, Claude 35~42개). 사용자가 단위를 정하거나 솎는 방식은 이번에 반영하지 않았다(사용자 "일단 지금대로 가자").
  - preset 출력 예산 여유가 7 B다.
- 남은 옛 참조 정리: DIRECTORY.md와 초안 주석을 고쳤다(`5b08da95`). PRODUCT.md:291은 T11에서 지운다.

## T10 1차 라운드 (V, HEAD `379f1418`)

- 결과: 18/26 통과. 기준 실패.
  - D13: Claude·Codex 모두 `document`를 찾지 않았다(6/6, 새 issue U-018). `document` 설명이 갱신·유지를 말하지 않는다.
  - D10d-claude: partial 3/3(새 issue U-019). 미정 항목이 캔버스에 없다. T8 1회차 수정에서 "두 산출물이 같은 미정 항목"을 "문서가 캔버스의 미정 항목을 가진다"로 바꾸며 반대 방향이 빠졌다. 이 feature의 회귀다.
  - D11d-claude: 실패 1회 뒤 partial 2회. U-013 양상이다.
- 지휘자 판단: D11d-claude의 실패는 U-013으로 설명되므로 기준("U-013 외 실패 없음")에서 실패로 세지 않는다. 같은 양상이 buzz-home 라운드에도 기록돼 있다.
- 다음: BP가 U-018(설명)과 U-019(미정 항목 방향)를 범용적으로 고치고, D10d·D11d·D11e·D12·D13을 두 에이전트로 다시 잰다. D12는 설명을 넓혀도 init 요청에 `document`를 쓰지 않는지 확인하기 위해 넣는다.
