# orchestrate chain — 2026-11-03

규칙: [`/orchestrate` §6 'Linked runs'](../../../.agents/skills/orchestrate/SKILL.md), AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 순서는 고치는 파일이 겹치는 feature를 앞뒤로 붙여, 뒤 링크가 앞 링크의 결과 위에서 시작하도록 정했다.

1. `canvas-hand-tool` — [spec](../canvas-hand-tool/spec.md)·[design](../canvas-hand-tool/design.md)·[tasks](../canvas-hand-tool/tasks.md). `/feature-review`와 초안 확정(D1)을 마쳤다. 가장 작다. `CanvasController.ts`·`canvasScript.ts`·`App.tsx`를 먼저 정리해 링크 4의 locate 작업이 그 위에서 시작한다.
2. `project-settings` — [spec](../project-settings/spec.md)·[design](../project-settings/design.md)·[tasks](../project-settings/tasks.md). buzz-restyle의 자식 13번이다(부모 규칙을 따른다). `ShellSidebar.tsx`·`App.tsx`·가이드 `skill.md`를 고친다. 링크 5도 `ShellSidebar.tsx`의 행 메뉴와 `skill.md`를 고치므로 그보다 먼저 둔다.
3. `canvas-open-offer` — [spec](../canvas-open-offer/spec.md)·[design](../canvas-open-offer/design.md)·[tasks](../canvas-open-offer/tasks.md). 이 파일을 쓸 때 `/feature-review`가 진행 중이었다(spec만 intake했다). 가이드 규칙 J, 턴 프롬프트(`prompt.ts`), 앱 소켓 v4, 에이전트 설정을 바꾼다. 링크 4도 `prompt.ts`에 규칙 J 링크를 언급하는 한 줄을 넣으므로, 규칙 J를 먼저 바꿔 링크 4가 새 규칙 위에서 그 줄을 쓰게 한다.
4. `agent-reply-chips` — [spec](../agent-reply-chips/spec.md)·[design](../agent-reply-chips/design.md)·[tasks](../agent-reply-chips/tasks.md). `/feature-review`를 마쳤다. D1 초안 `agent-reply-chips.html`은 시작 점검에서 그리고 확정했다. 링크 1의 locate·`openCanvas`와 링크 3의 규칙 J 위에서 시작한다. intake에서 T5의 "규칙 J의 링크는 최종 답의 캔버스 목록으로 그대로 둔다"를 링크 3의 결과에 맞게 고친다.
5. `canvas-row-menu` — [spec](../canvas-row-menu/spec.md)·[design](../canvas-row-menu/design.md)·[tasks](../canvas-row-menu/tasks.md). P1·P2(문구, 초안)를 마쳤다. 가장 크다(Go `doan export`, viewer, 휴지통 IPC, 사이드바). 앞 링크들이 고친 사이드바와 가이드 위에서 마지막으로 정리한다. design의 전제였던 terminal-agent-activity는 이미 main에 있다.
6. `setup-via-onboarding` — [spec](../setup-via-onboarding/spec.md)·[design](../setup-via-onboarding/design.md)·[tasks](../setup-via-onboarding/tasks.md). 2026-11-03에 체인 작성 세션이 `/feature`로 만들고 링크로 더했다(사용자). `/feature-review`는 시작 점검에서 마쳤다(5521360b). 가이드 'Onboarding'과 `doan init` 줄을 고치고 새 eval O3를 더한다. 링크 2·3·5가 고친 가이드와 출력 예산 위에서 마지막으로 정리한다. UI가 없어 초안이 없다.

## 시작 점검 (첫 지휘자, 2026-11-03 사용자)

첫 지휘자는 링크 1을 시작하기 전에 체인의 모든 feature(링크 1–6)를 점검하고, 사용자에게 한 번에 승인을 받는다. 승인 뒤에는 링크마다 멈추지 않는다. 점검에서 끝낼 것:

- 모든 feature의 `/feature-review`가 끝났는지 확인한다. 링크 3(canvas-open-offer)은 이 파일을 쓸 때 리뷰 중이었고(뒤에 465c5fa9로 마침), 링크 6(setup-via-onboarding)은 리뷰 전에 더해졌다.
- 사람이 확인해야 하는 초안을 모두 확정한다: 링크 2의 `buzz-project-settings.html`(2026-11-03에 수정됨, feature 문서에 확정 기록 없음), 링크 4의 D1 새 초안(`/design-draft`로 그린다). 링크 1·5의 초안은 확정됐다.
- 문서에 남은 열린 점을 사용자 결정으로 닫는다. 예: 링크 1 design '열린 점'(위조된 클릭 선택 메시지가 composer 포커스를 가져가는 문제의 대응).
- 체인 전체에 필요한 provider 로그인을 만든다(아래 '로그인').
- 위 결과와 남은 결정을 사용자에게 한 번에 보이고 일괄 승인을 받는다. 승인 내용은 이 파일의 '인계 기록'에 적는다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-03 사용자)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **Codex 작업자**: 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고(예: `claude-dashboard:check-usage`), 남은 양에 맞춰 Codex에 줄 배치를 정한다. 주 구현은 Claude가 맡고, Codex는 독립 리뷰와 일부 기계적 배치에 쓴다. 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 사용한 범위는 각 링크의 orch.md에 적는다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (2026-11-03 사용자)

- 모든 링크는 실제 HOME(Keychain)의 provider 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 첫 지휘자가 시작 점검에서 체인 전체에 필요한 로그인(Claude Code, Codex 등 각 feature의 runtime-test 범위로 정한다)을 사용자 브라우저 승인으로 한 번에 만든다.
- 로그인한 userData는 링크 worktree가 아니라 main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 모든 링크가 이 프로필을 재사용한다. 프로필을 망가뜨릴 수 있는 probe는 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 로그아웃하고 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.

## 인계와 물러나기

- 각 링크는 새 Claude Code 세션과 최신 `origin/main`에서 만든 새 Orca worktree에서 시작한다(§6 'One session per link').
- 나가는 지휘자는 링크를 끝까지 마친다: 배치 통합, 최종 `/verify`, 문서 승격과 feature 디렉터리 삭제, PR push·병합, local main pull, 배치 worktree 정리. 그 뒤 이 파일에 결과(병합 커밋, PR, 확인하지 못한 항목, 다음 링크가 알아야 할 결정)를 적고 main에 push한다.
- 다음 링크 세션을 이 파일·다음 feature 문서·아직 적지 않은 사항을 가리키는 브리프로 띄우고, 새 세션이 브리프로 시작한 것을 확인할 때까지 질문에 답한다.
- 확인되면 물러난다(§6 'Retire'). 컨텍스트를 링크마다 새로 시작하기 위해서다. 새 세션의 것은 닫지 않고, 자기 worktree가 깨끗하고 main에 모두 들어갔는지(`git cherry`에 `+` 없음) 확인한 뒤 worktree를 지우거나 사용자에게 세션을 닫아 달라고 하고 보고한다.

## 운영 메모

- worker 대기 루프는 heartbeat·status를 조용히 ack하고 `worker_done`·`question`·`escalation`에만 깨운다. 작업자가 `worker_done` 없이 멈출 수 있으므로 idle 프롬프트나 working이 아닌 상태에서도 깨운다.
- `/agent-eval`을 도는 링크(2·3·4·5·6)는 패키지 앱을 빌드한 뒤 돌린다. 실제 에이전트 상태를 건드린다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 canvas-hand-tool | Claude Code 세션 ceb45427, worktree `canvas-hand-tool-orch` | 2026-11-03 | PR #75, 병합 a6d35fd2 | 완료 |
| 2 project-settings | Claude Code 세션 06b8fea0, worktree `project-settings-orch` | 2026-11-03 | PR #76, 병합 02952e32 | 완료 |
| 3 canvas-open-offer | Claude Code 세션 c935fb51, worktree `canvas-open-offer-orch` | 2026-11-03 | PR #77, 병합 3b6f9ed2 | 완료 |
| 4 agent-reply-chips | Claude Code 세션 0344e3fb, worktree `agent-reply-chips-orch` | 2026-11-03 | PR #78, 병합 35ecf91b | 완료 |
| 5 canvas-row-menu | Claude Code 세션 e4ed3c1b, worktree `canvas-row-menu-orch` | 2026-11-03 | PR #79, 병합 88f9ee97 | 완료 |
| 6 setup-via-onboarding | Claude Code 세션 d0c0b53b, worktree `setup-via-onboarding-orch` | 2026-11-03 | PR #80, 병합 e22b3c4e | 완료 |

## 인계 기록

- 2026-11-03 체인 작성 세션: 순서와 상시 권한을 사용자와 정해 이 파일을 main에 push했다. 첫 지휘자는 '시작 점검'부터 한다.
- 2026-11-03 첫 지휘자(링크 1, 세션 ceb45427): 시작 점검을 마치고 사용자의 일괄 승인을 받았다. 승인 내용은 다음과 같다.
  - `/feature-review`: 링크 1–5는 이미 끝나 있었다(링크 5는 6893929b). 링크 6은 product·tech·qa로 돌리고 사용자 결정을 반영했다(5521360b). 첫 실행이 끝났으면 select까지만 하고 O3b를 더한다. 앱에 닿지 못하면 init으로 가고 알린다. token CSS는 묻지 않는다. O3는 저장소 안에서 경로 없이 요청한다.
  - 초안: 링크 2 `buzz-project-settings.html`(61d515e8)을 확정했다. 링크 4 `agent-reply-chips.html`은 새로 그려 확정했다. 다른 캔버스 접미사는 잘리지 않고, layout이 없으면 목록 행의 프레임 제목을 쓰며, 칩의 로딩 토스트는 "Try again shortly."다.
  - 링크 1 열린 점: 위조된 선택 메시지는 앱이 마지막으로 본 포인터가 캔버스 영역 위일 때만 포커스를 옮긴다(a3ec28b3).
  - 로그인: 앱 프로필에는 Claude Code 하나만 연결했다(링크 1 T4의 에이전트 알림 확인용). 다른 링크의 runtime-test는 앱 로그인이 필요 없다. `/agent-eval`은 실제 HOME의 `claude`·`codex` 터미널 로그인을 쓰며, 둘 다 로그인되어 있다.
  - 지휘자 재량: 링크 3과 4가 둘 다 R8을 R8b로 바꾸므로 링크 4 intake에서 겹치지 않는 id로 바꾼다. 링크 5의 "terminal-agent-activity와 같은 PR" 전제(tasks 3–5행, Z1)는 #72 병합으로 지난 것이라 링크 5 intake에서 지운다. 링크 4 T5의 규칙 J 문장은 링크 4 intake에서 링크 3의 결과에 맞춘다. 링크 5의 실제 Safari 확인과 Put Back은 임시 파일로만 하며 묻지 않는다.
  - 사용량(시작 시점): Codex는 18%를 썼다. Claude는 7일 한도의 74%를 썼고 2026-11-04 13:59 KST에 초기화된다. 리뷰와 기계적 배치는 Codex 비중을 높인다.
- 2026-11-03 링크 1 지휘자(사용자가 자러 가기 전 정한 것):
  - 링크 5 T5에서 `doan export` 결과 파일이 실제 Safari에서 동작하지 않으면, 링크 5 지휘자가 두 브라우저에서 동작하는 가장 가까운 viewer 구조(예: srcdoc 대신 blob URL)를 골라 구현하고, 결정과 근거를 링크 5 orch.md와 이 파일에 적은 뒤 계속 진행한다. 아침 보고에 넣는다(사용자).
  - 링크 5의 새 행 메뉴는 공용 드롭다운 프리미티브(Radix + `doan-floating doan-menu`)를 쓴다(사용자). 다만 링크 1 배치 D가 실제 앱에서 잰 결과, 모든 드롭다운이 이미 같은 글라스(0.9 흰색 + blur 8px)였고, 사이드바 열 위에서는 창의 네이티브 vibrancy 때문에 웹 `backdrop-filter`가 뒤를 흐리지 못했다. 그래서 사이드바에서 여는 메뉴는 불투명 채움 예외 `.shell-side-menu`(`styles.css`)를 붙인다. 링크 5의 행 메뉴도 사이드바에서 열리므로 이 클래스를 붙인다. 근거: 링크 1 orch.md 배치 D.
  - 사용량: Codex 주간 한도가 10% 아래로 내려가면 이후 링크는 Codex를 쓰지 않고 Claude Sonnet으로 리뷰한다. Claude 한도에 닿으면 그 링크 세션이 멈추며, 초기화(2026-11-04 13:59 KST) 뒤 사용자가 재개한다. Opus는 판단이 무거운 배치에만 쓴다.
  - Keychain: 공용 프로필은 링크 1 worktree의 Electron이 만들었다. 프로필을 쓰는 probe에서 macOS 대화상자가 뜨면 누르지 않고 그 항목만 미룬다.
- 2026-11-03 링크 1 완료(세션 ceb45427): PR #75를 main에 병합했다(a6d35fd2). 통합 HEAD에서 `/verify` PASS. 그 뒤 main의 chain.md 커밋 위로 rebase만 했다.
  - 배치: A(T1·T3, Claude Opus high, 수정 1회), B(T2, Codex gpt-6-astra medium), D(사용자 요청 디자인 이슈 2개, Claude Sonnet high, 수정 1회), C(T4 runtime-test·design-sync, Claude Opus high). 리뷰: RA는 Codex gpt-6-astra medium, 나머지는 Claude 서브에이전트(Sonnet·Opus). Codex는 B와 RA 두 번만 썼다.
  - 확인하지 못한 것: 화면이 잠겨 native 입력 항목(OS 커서 grab·grabbing, 창 밖 native 드래그, native OOPIF 진입, 실제 IME, native ⌘H/⌘V)을 돌리지 못했다. CDP로 대신 확인했고, BACKLOG 'Not verified in the real app'에 적었다. 링크 1의 증거(native probe 포함)는 main checkout의 `.scratch/chain-261103/link1-evidence/`로 옮겼다. native probe는 그 안의 `evidence-c/runtime-test/canvas-hand-tool/native-probe.mjs`다.
  - 사용자 확인이 필요한 것(아침 보고): 사이드바 프로젝트 메뉴를 블러 대신 불투명 채움으로 바꿨다(`.shell-side-menu`). 원인은 창의 네이티브 vibrancy 위에서 웹 `backdrop-filter`가 효과가 없는 것이다. 되돌리기는 규칙 하나다.
  - 다음 링크가 알아야 할 것:
    - 새 IPC `pointer:get`(main window main frame only)과 캔버스 클릭 포커스 규칙(ARCHITECTURE §3 Input). 시작 점검의 '포인터 위치 조건'은 main의 OS 커서로 판정한다. 부모 문서는 OOPIF로 바로 들어가는 포인터를 보지 못하기 때문이다.
    - `doan-kbd`의 공용 변형 `data-ui-variant="on-prominent"`와 `data-ui-size="sm"`, 키가 있는 툴팁 `.doan-tooltip.has-key`(`ds/controls.css`, DESIGN).
    - 프리셋 팝오버 행: 포커스가 이미 목록 안에 있을 때만 포인터가 포커스를 옮긴다. 공용 규칙은 `ds/surfaces.css`의 listbox 행 `:focus`와 hover다.
    - `CanvasState.tool`은 `"select" | "hand"`로 바뀌었고 픽은 `picking: boolean`이다. App은 `setCanvasPage`로 캔버스 페이지 여부를 controller에 알린다(링크 4의 locate·`openCanvas`가 이 위에서 시작한다).
    - 공용 프로필 백업 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData.bak-hand`가 남아 있다. 마지막 링크가 프로필을 지울 때 함께 지운다.
    - 사용량(링크 1 끝): Claude 7일 76%(2026-11-04 13:59 KST 초기화), Codex 대시보드 18%(상태줄 주간 12% 남음).
- 2026-11-03 링크 1 지휘자: 링크 2 세션이 브리프로 시작해 시작을 push한 것(7119e66e)을 확인하고 물러났다. 링크 1 worktree는 깨끗하고 main에 모두 들어갔다(`git cherry`에 `+` 없음). 세션의 실행 checkout이라 지우지 않았고, 사용자가 세션을 닫은 뒤 지우면 된다.
- 2026-11-03 링크 2 완료(세션 06b8fea0): PR #76을 main에 병합했다(02952e32). 통합 HEAD에서 `/verify` PASS(테스트 5715). 부모 buzz-restyle의 C13 체크, spec 표 13번, 'DESIGN.md 절과 담당'의 Projects home 행을 갱신했다.
  - 배치: A1(T1–T3, Claude Sonnet high), B(T7 가이드, Claude Sonnet medium), E(T8 `/agent-eval`, Claude Sonnet medium), A2(T4–T5, Claude Opus high, 수정 1회), C(T6 `/runtime-test`·T9 `/design-sync`, Claude Sonnet high, 수정 1회). 리뷰는 Claude 서브에이전트(RA1·RC Sonnet, RA2 Opus)와 지휘자 직접 대조(B)로 했다. Codex 작업자는 쓰지 않았다. 링크 1 끝 상태줄의 주간 남은 양이 12%로 기준에 가까웠고, `/agent-eval`이 실제 Codex로 같은 한도를 썼다.
  - 확인하지 못한 것: 데스크톱이 잠겨 네이티브 입력 항목(메뉴 클릭 자체, OS 폴더 시트)은 CDP와 `Menu.getApplicationMenu()`로 대신 확인했다. `/agent-eval` 첫 실행에서 runner의 real-state 검사가 `keychain:provider-items` 해시 변화를 잡아 exit 1을 냈다(파일·`runtime.json`·`sessions.jsonl`은 그대로, 그때 사용자의 실제 Doan 앱이 떠 있었다). 원인은 확인하지 못했고 반복 실행에서는 바뀌지 않았다.
  - 사용자 확인이 필요한 것(아침 보고): 사용자가 확정한 시안과 구현이 달라 지휘자가 정한 것이 셋 있다. (1) 시안의 Saving 타일이 Remove from Doan을 비활성으로 그렸는데, design '잠금'을 따라 시안 타일을 활성으로 고쳤다. (2) Share 확인 뒤 컨트롤은 시안처럼 활성으로 그린다. (3) Share 확인의 경로는 저장 표기와 같은 상대 경로다. 시안 `alt-2-page` 계열의 사이드바(260px, Home 행 없음)는 셸의 옛 사본이라 DESIGN에 문서화된 차이로만 적었다. 사이드바 Home 행은 이제 Home에서만 current이고, Add Projects·Settings 페이지에서도 같다(PRODUCT §5 항목 3의 규칙에 맞춘 것).
  - 다음 링크가 알아야 할 것:
    - 가이드 `skill.md`가 바뀌었다(규칙 7의 승인 경로, Commands 서두의 `--repo`, onboarding `agents`의 `{revision, providers}`, `init`의 `.gitattributes`, CLI 링크 조건). 링크 3·5·6이 가이드를 고칠 때 이 위에서 시작한다. `skill_test.go`가 새 문구를 고정한다.
    - 사이드바 프로젝트 메뉴의 Project Settings는 페이지를 연다(`openProjectSettings(root)`). `ShellSidebar`에 `homeCurrent` prop이 생겼다. 메뉴는 여전히 `.shell-side-menu`를 쓴다. 링크 5의 행 메뉴가 이 위에서 시작한다.
    - 복구 라벨 표는 `homeCards.ts`의 `ROW_ACTION_LABELS` 하나다. 말줄임표가 없고 Remove는 "Remove from Doan"이다.
    - main `shell.replace()`가 Locate의 reroot focus를 보낸다. App은 워크스페이스에서 연 Locate만 `loadedRoot`를 옮긴다(POSTMORTEM 2026-11-03).
    - `doan check --repo .`에 이 링크와 무관한 기존 오류가 하나 있다: `select-inspect.html`의 `data-doan-implements`가 없는 `app/src/renderer/Sidebar.tsx`를 가리킨다.
    - 사용량(링크 2 끝): Claude 7일 78%(2026-11-04 13:59 KST 초기화), Codex 대시보드 18%.
- 2026-11-03 링크 3 완료(세션 c935fb51): PR #77을 main에 병합했다(3b6f9ed2). 통합 HEAD에서 `/verify --eval` PASS(앱 테스트 5922, eval 233, self-test 포함).
  - 배치: A(T1·T2·T4 Go, Claude Sonnet high, 수정 1회), B(T3·T5 앱, Claude Opus high, 수정 1회), C(T7–T9 설정·가이드·eval, Claude Sonnet high, 수정 1회), D(T6 `/runtime-test`·T10 `/agent-eval`, Claude Sonnet high, 2회차 1번). 리뷰는 Claude 서브에이전트(RA·RC Sonnet, RB Opus)로 했다. T11 문서 승격은 Sonnet 서브에이전트 초안을 지휘자가 검토해 커밋했다. Codex 작업자는 쓰지 않았다.
  - 확인하지 못한 것: 데스크톱이 잠겨 "다른 앱 창 뒤에 있는 Doan이 앞으로 옴"은 deferred다. Settings·Add Projects 잠금의 `busy`는 단위 테스트로만 확인했다. 꺼진 앱을 `doan open`이 여는 bootstrap은 단위 테스트로만 확인했고 BACKLOG 'Not verified in the real app'에 적었다. `/agent-eval`은 거절 보고(spec 완료 조건 5)를 재지 못한다(가짜 앱이 `busy`·`not_ready`를 답하지 않는다). USABILITY-EVAL에 미측정으로 적었다.
  - 사용자 확인이 필요한 것(아침 보고): 링크도 잠긴 페이지와 first run을 다이얼로그 닫기보다 먼저 본다. 이동하지 않는 결과는 같고, 어차피 거절될 이동 때문에 wizard 안의 다이얼로그를 닫지 않게 됐다(ARCHITECTURE §7 'Deep links'). W3b rubric에 "보고 뒤 마지막 줄에 따로 있는 제안은 묻힌 것이 아니다"를 그 자리에서 더했다(U-022). `/agent-eval` 첫 실행에서 runner가 또 `keychain:provider-items` 해시 변화만으로 exit 1을 냈다(사용자의 실제 Doan 앱이 떠 있었다). 재실행 두 번에서는 바뀌지 않았다.
  - 다음 링크가 알아야 할 것:
    - 규칙 J가 바뀌었다. 에이전트는 `doan://` 링크를 최종 답에 넣지 않고, 고친 캔버스를 열어 줄지 한 줄로 묻고, 사람이 원하면 `doan open`을 실행한다. `doan work done`은 여전히 `links`를 돌려주지만 사람이 달라고 할 때만 준다. 링크 4 T5의 "규칙 J의 링크는 최종 답의 캔버스 목록으로 그대로 둔다"와 spec의 J 전제(spec 17·22·54행 근처)는 이 결과에 맞게 intake에서 고친다.
    - `prompt.ts`의 턴 프롬프트 끝에 `OPEN_GUIDANCE` 한 줄이 있다(앱 대화에서는 열어 줄지 묻지 않고, 이 줄이 가이드의 제안 규칙보다 우선한다). 링크 4가 넣는 링크 줄은 이 줄과 함께 둔다.
    - R8은 이미 R8b가 됐고, W3는 W3b, 새 W4가 있다. 링크 4는 턴 프롬프트를 다시 바꾸므로 R8b를 R8c로 바꾼다(시작 점검의 "겹치지 않는 id").
    - 앱에 `doan open` 판정이 생겼다: main `resolveOpenTarget`(`deepLinks.ts`), renderer `decideOpen`(`app/src/renderer/openDecision.ts`, 잠긴 페이지 → first run → 다이얼로그 닫기 → 목록 재확인). 칩의 이동도 이 helper와 거절 처리를 쓸 수 있다(canvas-open-offer design '다른 feature와의 관계').
    - 가이드 출력 예산이 빠듯하다: `doan skill --json` 21,298 B + note 168 B로 한도 21,600 B까지 약 134 B 남았다. 링크 5·6이 가이드를 고칠 때 줄이는 쪽으로 쓴다.
    - Claude Code 허용 규칙이 셋이 됐다(`Bash(doan open *)`). About 안내도 셋을 든다.
    - Orca가 작업자 worktree를 지우면서 브랜치를 지우고, 다음 작업자가 같은 이름(`…-2`)을 다시 쓴 일이 있었다. 구현 브랜치는 배치 글자를 붙인 이름으로 다시 만들어 두는 편이 안전하다.
    - 증거: 이 링크의 `.scratch/orch/`(브리프, handoff, 리뷰, runtime-test, agent-eval 세 라운드, 최종 verify 로그)는 main checkout의 `.scratch/chain-261103/link3-evidence/`로 옮겼다.
    - 사용량(링크 3 끝): Claude 7일 79%(2026-11-04 13:59 KST 초기화). **Codex 주간 한도는 91%를 썼다(9% 남음, 2026-11-04 15:35 KST 초기화, `/agent-eval`의 Codex rollout 기록 기준).** 체인 규칙대로 링크 4부터 Codex 작업자를 쓰지 않고 Claude Sonnet으로 리뷰한다. 링크 4의 `/agent-eval`(R9·R8c)도 실제 Codex를 쓰므로, 남은 양으로 모자라면 Codex 쪽 실행만 초기화 뒤로 미루고 그 사실을 기록한다.
- 2026-11-03 링크 4 완료(세션 0344e3fb): PR #78을 main에 병합했다(35ecf91b). 통합 HEAD 3c67b363에서 `/verify --eval` PASS(앱 테스트 6002).
  - intake: spec·design·tasks의 규칙 J 전제를 링크 3의 결과에 맞췄다(앱 대화에서는 `OPEN_GUIDANCE`가 링크와 열기 제안을 모두 막는다). R8b를 R8c로 바꿨다. 다른 캔버스 칩은 `openLink`와 같은 `decideOpen` 경로로 연다. main `resolveOpenTarget`은 root와 경로로 찾으므로 쓰지 않았다.
  - 배치: A1(T0–T2, Claude Sonnet high), A2(T3–T4, Claude Opus high, 수정 2회), B(T5–T6과 `/agent-eval`, Claude Sonnet high, 수정 2회), C(T7 `/runtime-test`, Claude Sonnet high, 재측정 1회). 리뷰는 Claude 서브에이전트(RA1·RB Sonnet, RA2 Opus)로 했고 🔴는 모두 0이었다. T8 verify와 Z1 문서 승격은 지휘자가 했다. Codex 작업자는 쓰지 않았다.
  - 확인하지 못한 것: 데스크톱이 잠겨 네이티브 입력(포인터 클릭, 답 안 칩의 실제 Tab 순서, Cmd-click)은 Playwright/CDP로 대신 확인했다. 칩 전용 토스트 "Project is still being read. Try again shortly."와 프로젝트 문제 토스트는 실제 앱에서 닿지 못해 단위 테스트로만 확인했다. 둘 다 BACKLOG 'Not verified in the real app'에 적었다. `/agent-eval` 첫 Claude 라운드에서 runner가 또 `keychain:provider-items` 해시 변화만으로 exit 1을 냈다. judge 없이 다시 돌린 확인에서는 exit 0이었다.
  - 사용자 확인이 필요한 것(아침 보고):
    - 긴 캔버스 이름: 다른 캔버스 칩도 180px가 상한이고, 라벨이 먼저 말줄임되며 캔버스 이름은 잘리지 않는다(초안과 같다). 캔버스 이름만으로 180px 칩에 들어가지 않을 때만 칩이 그만큼 넓어지고, 답 블록 너비를 넘으면 그 이름이 칩 안에서 말줄임된다. 시작 점검 결정이 다루지 않은 경우라 지휘자가 정했다. 이를 위해 `.conversation-thread .msg-agent`가 inline-size container가 됐다(답 블록 배치는 그대로임을 실제 앱에서 쟀다).
    - R9 검사: 처음에 지휘자가 '프레임 링크와 요소 링크가 하나 이상씩'을 요구했다. 그 때문에 고친 요소 둘을 정확히 링크한 Codex 답 두 개가 떨어졌다. spec 완료 조건은 고친 대상을 맞는 링크로 가리키는 것이라 그 조건을 빼고 검사기를 그 자리에서 고쳤다(U-023은 이슈가 아니라 시나리오 결함으로 기록). 다시 돌린 Codex R9는 3/3 pass다.
    - R8c는 Claude에서 judge만 partial이다(캔버스의 규칙 G 메모 누락, 기존 U-021과 같은 원인).
  - 다음 링크가 알아야 할 것:
    - 턴 프롬프트 끝은 `OPEN_GUIDANCE`, `LINK_GUIDANCE`, `doan check` 줄 순서다. 가이드(`skill.md`)는 이 링크에서 바뀌지 않았다. 출력 예산의 남은 양은 링크 3 기록(약 134 B) 그대로다.
    - eval: R8b는 R8c로 바뀌었고 R9가 새로 생겼다. `finalAnswer`와 `withoutCode`는 `eval/lib/answer.ts`에, `turn-prompt.ts`는 `eval/lib`에 있다. H4–H8은 새 경로를 import한다.
    - 앱: `parseReplyAnchor`(`app/src/main/conversation/replyAnchor.ts`, import 없음), renderer `replyUrlTransform`·`replyChipTarget`, `CanvasController.openCanvas`의 `{ frame } | { element }` 대상과 root·경로에 묶인 대기 locate, `Anchor.element.selector`는 선택 필드(사람 앵커는 여전히 selector를 요구한다). 링크 5가 `ShellSidebar`·사이드바 행 메뉴를 고칠 때 이 파일들과는 겹치지 않는다.
    - 운영: 대기 루프가 작업자의 `status` 메시지를 heartbeat처럼 넘겨 B가 약 45분 기다린 일이 있었다. 예시 `wait.sh`는 이제 `status`에도 깬다(증거 디렉터리). 지휘자 worktree에는 앱 의존성이 없으니 최종 verify 전에 `npm --prefix app ci`와 electron 내려받기를 먼저 한다. Orca가 작업자 브랜치 이름을 재사용해서(`…-2`, `…-3`), 구현 브랜치는 `agent-reply-chips-a1`·`-a2`·`-b`로 다시 만들어 남겼다.
    - 증거: 이 링크의 `.scratch/orch/`(브리프, handoff, 리뷰, runtime-test, agent-eval 라운드, 최종 verify 로그, feature 문서 사본)를 main checkout의 `.scratch/chain-261103/link4-evidence/`로 옮겼다.
    - 사용량(링크 4 끝): Claude 7일 80%(2026-11-04 13:59 KST 초기화). Codex 주간 91%(이 링크의 `/agent-eval` Codex 실행 뒤에도 그대로, 2026-11-04 15:35 KST 초기화). 체인 규칙대로 링크 5도 Codex 작업자를 쓰지 않는다.
- 2026-11-03 링크 4 지휘자: 링크 5 세션(e4ed3c1b)이 브리프로 시작해 시작을 push한 것(5b96de98)을 확인하고 물러났다. 링크 4 worktree는 깨끗하고 main에 모두 들어갔다(`git cherry`에 `+` 없음). 세션의 실행 checkout이라 지우지 않았고, 사용자가 세션을 닫은 뒤 지우면 된다. 브리프는 main checkout의 `.scratch/chain-261103/brief-link5.md`다.
- 2026-11-03 사용자(링크 5 진행 중): 마지막 링크 6(setup-via-onboarding)은 Codex 작업자를 섞어 쓴다. 링크 1 지휘자가 남긴 'Codex 주간 한도가 10% 아래면 Codex를 쓰지 않는다' 규칙보다 이 지시가 앞선다. 주 구현은 Claude, Codex는 독립 리뷰와 일부 기계적 배치에 쓰고(상시 권한 'Codex 작업자'), 시작할 때와 배치를 나눌 때 Codex 주간 남은 양(rollout `rate_limits` window 10080분, 2026-11-04 15:35 KST 초기화)을 확인해 배치를 정한다. 한도로 Codex가 멈추면 그 배치만 Claude로 돌리고 orch.md에 적는다.
- 2026-11-03 링크 5 완료(세션 e4ed3c1b): PR #79를 main에 병합했다(88f9ee97). 통합 HEAD에서 `/verify --eval` PASS(앱 테스트 6206, eval 255, self-test 포함). 그 뒤에는 문서 커밋만 있었다.
  - intake: terminal-agent-activity 전제를 지우고, design의 행 번호를 이름 기준으로 바꿨으며, `shell-side-menu`와 가이드 예산을 적고, eval id를 `X1`로 정했다.
  - 배치: A1(T1–T3 Go 자산 해석·다시 쓰기, Claude Opus high, 수정 2회), B(T4 viewer, Claude Sonnet high, 수정 1회), C1(T6·T9 휴지통·export IPC, Claude Opus high, 수정 1회), A2(T5·T7·T8 조립·`doan export`·가이드, Claude Sonnet high, 수정 1회), C2(T10 행 메뉴 UI, Claude Opus high, 수정 1회), D(T11 eval X1, Claude Sonnet high), E(T12·T13 `/design-sync`·`/runtime-test`, Claude Sonnet high, 후속 1회). 리뷰는 Claude 서브에이전트(RA1·RC1·RA2·RC2 Opus, RB·RA1-fix1 Sonnet)로 했다. 🔴은 RC2의 1건(숨은 버튼이 `display:none`이라 메뉴를 닫으면 포커스가 body로 떨어짐)뿐이었고 고쳤다(POSTMORTEM 2026-11-03). Z1 문서 승격은 Sonnet 서브에이전트 초안을 지휘자가 검토해 커밋했다. Codex 작업자는 쓰지 않았다.
  - 확인하지 못한 것: 데스크톱이 링크 내내 잠겨 있었다. 그래서 **실제 Safari 확인(T13 e)과 Finder Put Back(T13 f)은 하지 못했다**. export 결과는 headless Chromium, Playwright WebKit(Safari 아님, 브라우저 바이너리만 `~/Library/Caches/ms-playwright`에 받음), Electron에서 확인했다. 네이티브 입력은 CDP로 대신 확인했다. 앱 대화 작업 중 Move to Trash 비활성, 권한 점, main만 내는 거절 토스트는 실제 앱에서 닿지 못해 단위 테스트로만 확인했다. 모두 BACKLOG에 적었다. `/agent-eval` X1은 성공 경로만 잰다.
  - 사용자 확인이 필요한 것(아침 보고):
    - **SVG `<use>`**: data: URL을 `<use href>`에 넣으면 Chromium·WebKit에서 그려지지 않는다(두 엔진에서 재현). 그래서 결과 파일에서는 참조한 SVG 파일을 숨긴 inline `<svg>`에 한 번 넣고 href를 `#id`로 바꾼다. 링크 1 지휘자가 남긴 'Safari에서 안 되면 가장 가까운 구조를 고른다' 결정과 같은 성격으로 지휘자가 정했다. fragment가 없거나 id가 겹치거나 sprite에 `<style>`이 있으면 export를 거절한다(inline한 `<style>`이 캔버스 전체에 적용되기 때문이다).
    - viewer에는 Geist를 넣지 않는다(결과마다 약 93 KB). shell 크롬은 시스템 글꼴 스택으로 보인다.
    - 가이드 예산 때문에 `doan open` 줄의 "A bundled CLI starts a closed Doan once."를 지웠다. 같은 사실은 Onboarding 1단계의 "Only `doan open` also opens the app"에 남아 있고, `skill_test.go`가 그 문장을 고정한다.
    - 초안 `canvas-row-menu.html`의 평소 행 버튼은 앱처럼 clip으로 숨기게 고쳤다(보이는 모양은 같다).
  - 다음 링크가 알아야 할 것:
    - **가이드 출력 예산: `doan skill --json` 21,405 B + note 166 B = 21,571 / 21,600 B(29 B 남음).** 링크 6이 가이드의 Onboarding과 `doan init` 줄을 고칠 때 줄이는 쪽으로 쓴다. Onboarding 1단계의 "Only `doan open` also opens the app" 문장을 바꾸면 `doan open`이 닫힌 앱을 연다는 사실을 다른 곳에 남겨야 한다(위 삭제 때문에 그 문장이 유일한 자리다).
    - eval: 새 시나리오 X1이 있다. `eval/lib/transcript.ts`가 `doan export`의 `-o`·`--force`를 읽는다. 기존 id는 D·H·O·R·W 계열과 R8c·R9·W3b·W4·X1이다. 링크 6의 O3는 겹치지 않는다.
    - 앱: 사이드바 캔버스 행 메뉴(`ShellSidebar.tsx` `canvasMenu` prop, `CanvasTrashDialog.tsx`, `canvasRowMessages.ts`), IPC `canvas:trashPlan`·`canvas:trash`·`canvas:export`·`canvas:revealExport`와 이벤트 `canvas:exportRunning`(ARCHITECTURE §7 'Canvas row menu IPC'). 링크 6이 고치는 Onboarding 파일과는 겹치지 않는다.
    - `/agent-eval` 첫 Claude 라운드는 이번에도 `keychain:provider-items` 해시 변화만으로 exit 1이었다. `--no-judge` 재실행은 exit 0이었다.
    - 운영: 지휘자 worktree에는 앱 의존성이 없으니 최종 verify 전에 `npm --prefix app ci`와 electron 내려받기를 한다. 리뷰 전에 배치를 feat에 먼저 cherry-pick해 다음 배치를 일찍 시작했고, 리뷰 수정은 새 커밋으로 받아 뒤 배치에 rebase를 보냈다. 격리 앱의 Keychain 접근이 `/agent-eval` real-state 검사와 겹칠 수 있어 runtime probe는 eval 라운드 뒤에 돌렸다. 대기 루프 `wait.sh`·`tail.py`는 증거 디렉터리에 있다.
    - Playwright WebKit 바이너리가 `~/Library/Caches/ms-playwright/webkit-*`에 남아 있다. 마지막 링크가 정리할 때 함께 지워도 된다.
    - 증거: 이 링크의 `.scratch/orch/`(브리프, handoff, 리뷰, design-sync·runtime-test·agent-eval 증거, 최종 verify 로그, feature 문서 사본)를 main checkout의 `.scratch/chain-261103/link5-evidence/`로 옮겼다. 구현 브랜치는 `canvas-row-menu-a1`·`-a2`·`-b`·`-c1`·`-c2`·`-d`·`-e`로 남겼다(로컬).
    - 사용량(링크 5 끝): Claude 7일은 링크 중간 작업자 상태줄 기준 82%였다(끝에는 대시보드가 값을 읽지 못했다, 2026-11-04 13:59 KST 초기화). Codex 주간 91%(X1 Codex 실행 뒤에도 그대로, 2026-11-04 15:35 KST 초기화). **링크 6은 사용자 지시대로 Codex 작업자를 섞어 쓴다**(위 사용자 기록).
- 2026-11-03 링크 5 지휘자: 링크 6 세션(worktree `setup-via-onboarding-orch`, Orca 터미널 term_eb13b7fe)이 브리프로 시작해 시작을 push한 것(4a5622eb)을 확인하고 물러났다. 링크 5 worktree `canvas-row-menu-orch`는 깨끗하고 main에 모두 들어갔다(`git cherry`에 `+` 없음). 세션의 실행 checkout이라 지우지 않았고, 사용자가 세션을 닫은 뒤 지우면 된다.
- 2026-11-03 링크 6 완료(세션 d0c0b53b): PR #80을 main에 병합했다(e22b3c4e). 통합 HEAD a20e110a에서 `/verify --eval` PASS(앱 테스트 6206, self-test 41개 시나리오). 그 뒤에는 문서 커밋만 있었다.
  - 배치: A(T1 eval 하네스·O3·O3b, Claude Sonnet high, 수정 1회), G(T3 가이드, Claude Opus high, 수정 1회), B(T2 기준선·T5·O3b 반복, Claude Sonnet high). 리뷰 RA·RG는 Codex gpt-6-astra medium이었다(사용자 지시대로 섞어 씀, 각 🔴 0·🟡 1, 모두 고쳤다). Codex는 리뷰 두 번에만 썼다. 기계적 배치로 뗄 만한 것이 없었고, eval은 실제 Claude·Codex를 띄워 Codex 샌드박스 안에서 돌리기 어렵다. T4 verify와 Z1 문서 승격은 지휘자가 했다.
  - 결과: 기준선 `o3-baseline`에서 O3는 6/6이었고, O3b는 0/6이었다(모든 실행이 `completed: true`를 받고도 `complete`를 불렀다, U-023). 가이드를 바꾼 뒤 `o3-guide`와 `o3-guide-o3b-repeat`에서 O3·O3b 모두 두 에이전트가 통과했다(O3b는 에이전트마다 3/3). O1·O2·D12·D9는 기준 라운드처럼 통과했다. D10h-claude는 judge만 partial이었는데, 이유가 기준 라운드와 같아 회귀가 아니다. runner는 매번 exit 0이었고 real-state도 그대로였다(이번에는 `keychain:provider-items` 변화가 없었다).
  - 확인하지 못한 것: 앱에 닿지 못할 때 `doan init`으로 가는 폴백은 eval 시나리오가 재지 않는다(가짜 앱은 항상 닿는다).
  - 사용자 확인이 필요한 것(아침 보고):
    - 결정 3("묻지 않고 init")과 init 줄의 "token CSS 경로를 먼저 묻는다"가 부딪혔다. 지휘자가 정했다: 명시적 `doan init` 요청에서만 token CSS를 먼저 묻고, 앱에 닿지 못할 때의 폴백에서는 묻지 않는다. 사용자가 말한 경로만 `--token-css`로 넘긴다.
    - 가이드 예산(29 B 남음) 때문에 'Onboarding' 첫 문단·step 1·init 줄만 줄여서는 449 B가 넘었다. 지휘자 판단으로 'Onboarding' 절 전체(step 2–8, 넘겨줄 때 문단, cancel·`--request` 문단)를 사실을 지키며 줄였다. 그중 하나로 step 5의 `changes` 파일 목록 괄호를 지웠다(init 줄과 실제 `changes`가 같은 파일을 말한다). 지금 `--json`+안내는 21,596 / 21,600 B라 다음 가이드 변경은 그만큼 줄일 곳을 찾아야 한다.
    - 공용 프로필 로그아웃: 화면이 잠겨 앱 GUI 대신, 앱 sign-out이 실행하는 것과 같은 `claude auth logout`을 그 프로필에 실행했다. 명령은 성공을 알렸지만 Keychain 항목 `Claude Code-credentials-5def49d2`는 남았다. 그래서 그 항목 하나만 `security delete-generic-password`로 지웠고, 항목이 없어졌음을 확인했다. 앱 sign-out도 서버 토큰을 회수하지 않으므로 결과는 같다. 그 뒤 `userData`·`userData.bak-hand`와 Playwright `webkit-2370`을 지웠다. 다른 `Claude Code-credentials-*` 항목은 건드리지 않았다.
  - 브랜치: `setup-via-onboarding-a`·`-b1`·`-b2`·`-g`(로컬)로 남겼다. 증거는 main checkout의 `.scratch/chain-261103/link6-evidence/`다.
  - 사용량(끝): Codex 주간 93%(2026-11-04 15:35 KST 초기화). Claude 7일은 작업자 상태줄 기준 83%였다(2026-11-04 13:59 KST 초기화).

