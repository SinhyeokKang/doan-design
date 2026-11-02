# canvas-hand-tool — orch

출처: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 1.

- 시작 해시: `aa59ada2`(origin/main)
- 통합 브랜치: `feat/canvas-hand-tool`
- 지휘자: Claude Code 세션 ceb45427, worktree `canvas-hand-tool-orch`
- 권한(체인 파일): 이 링크의 PR을 main에 병합한다. Codex 작업자를 섞어 쓴다.

## 결정 기록

- 위조된 선택 메시지와 포커스: 앱이 마지막으로 본 포인터가 캔버스 영역 위일 때만 포커스를 옮긴다(시작 점검에서 사용자, design '포커스').
- iframe → 앱 `key` 메시지 모양: 지휘자 판단. 기존 Alt(`key: "Alt", alt: boolean`)와 같은 꼴로 Space는 `{type: "key", key: "Space", down: boolean}`, V·H는 `{type: "key", key: "V"}`·`{type: "key", key: "H"}`다. `href`·`seq`·`viewport`는 다른 `key` 메시지처럼 함께 보낸다. 렌더러는 Space에서 seq를 쓰지 않는다(design '키' 'seq 없음'). 근거: 배치 A(파서)와 B(전송)가 병렬이라 계약을 먼저 고정해야 한다.
- Z1 문서 승격: 지휘자 판단. PRODUCT·ARCHITECTURE와 DESIGN의 설명 문장은 지휘자가 통합 뒤에 쓴다. DESIGN의 측정값은 `/design-sync`를 맡은 배치 C가 쓴다. 근거: orchestrate §5(지휘자의 문서 승격)와 design-sync skill(측정값 기록).
- 사용자 요청(2026-11-03, 링크 1에서 함께 처리): (1) 프리셋 팝오버의 카드 행에 hover 상태가 없다. 원인은 행이 Radix가 아닌 listbox 행이라 `[data-highlighted]`가 `/` 목록의 키보드 강조에만 붙는 것이다(`ComposerParts.tsx` `PresetOption`). (2) 프로젝트 드롭다운에 블러가 없어 보인다. 모든 드롭다운이 Radix + `doan-floating doan-menu`를 쓰지만 사이드바 프로젝트 메뉴는 예전 `menu` 클래스와 화면 전용 규칙이 더 붙어 있다. D가 실제 앱에서 드롭다운마다 computed `backdrop-filter`를 재고 공용 규칙으로 맞춘다. canvas-row-menu(링크 5)의 행 메뉴도 공용 프리미티브만 쓰도록 체인 인계 기록에 남긴다.
- 시작 시 사용량: Claude 7일 74%, Codex 18%. 리뷰는 Codex를 쓴다(체인 승인).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T3 | `app/src/renderer/`(`selection.ts` 또는 새 규칙 파일, `canvasMessage.ts`, `CanvasController.ts`, `CanvasTools.tsx`, `App.tsx`, `styles.css`, `ds/controls.css`, 각 테스트), `app/src/restore/uiState.ts`, `app/src/main/uiState.ts`(+test), `.doan/ds/tooltip.html` | 없음 | Claude Opus high: 포인터 캡처·포커스·키 순서·ui-state 복원 경쟁이 얽혀 있고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 49049539..0b4e2781 + 수정 6373a1bb·bf1ca08a, 재리뷰 🔴 0 |
| B | T2 | `app/src/main/canvasScript.ts`, `app/src/main/canvasScript.test.ts` | 없음(메시지 모양은 결정 기록) | Codex gpt-6-astra medium: 파일 하나지만 편집 대상 판정과 blur 처리에 판단이 필요하다. Claude 사용량을 아낀다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 a04a8711 |
| RA | A 리뷰 | 읽기만 | A | Codex gpt-6-astra medium: 다른 모델 계열의 독립 리뷰 | `/code-review` 보고서 | 완료: 🔴 1, 🟡 1 → A 수정 1회차 |
| RB | B 리뷰 | 읽기만 | B | Claude Sonnet medium: 작은 diff, 다른 계열 리뷰 | `/code-review` 보고서 | 완료: 🔴 0, 🟡 1(통합 확인으로 넘김) |
| D | 사용자 요청 디자인 이슈 2개(아래 결정 기록) | `ComposerParts.tsx`, `ShellSidebar.tsx`·`HomeComposerView.tsx`의 드롭다운 클래스, `styles.css`, `ds/surfaces.css`와 테스트, `docs/DESIGN.md` 해당 행 | A 통합(styles.css 겹침) | Claude Sonnet high: 범위가 작지만 실제 앱 computed style 측정이 필요하다. Claude 사용량을 아낀다 | `npm --prefix app test`, typecheck, 실제 앱 측정 | 통합 1f9a462a..b424a6ca, 리뷰 중 |
| C | T4(`/runtime-test`, `/design-sync`) | `.scratch/`, `docs/DESIGN.md`의 측정값, design-sync가 고치는 앱 코드(그때 A와 겹치지 않게 지휘자가 순서를 잡는다) | A·B 통합 | Claude Opus high: 실제 앱 probe, 측정과 판단 | probe 완료 표식·exit 0, real-state 전후 같음, `measure.mjs` | 진행 중 |
| 지휘자 | T5(리뷰 지적 분배), T6, Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` 설명 문장, 이 디렉터리 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, Z1 grep | 대기 |

T5의 `/refactor`는 지적이 나온 배치의 작업자가 한다.

## 파일 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. 둘 다 끝나면 통합하고 C를 시작한다.
- C의 `/design-sync`가 앱 코드를 고치면 A의 파일과 겹친다. 그때 A는 끝나 있어야 하고, 고칠 것은 C가 맡는다.
- App 테스트의 ui-state 하네스는 A만 고친다.

## 기록

- 2026-11-03 Run `run_389c91f1f364`. A: task `task_0e0391c2f766`, dispatch `ctx_146d8b772309`, worktree `canvas-hand-tool-a`(브랜치 `SinhyeokKang/feat-canvas-hand-tool`), launch.effective claude opus high. B: task `task_71946233c4e3`, dispatch `ctx_32712096eee5`, worktree `canvas-hand-tool-b`(브랜치 `SinhyeokKang/feat-canvas-hand-tool-2`), launch.effective codex gpt-6-astra medium. 둘 다 d5891519에서 시작했다.
- Codex 상태줄에 주간 한도가 12% 남았다고 나온다(대시보드의 18% 사용과 다르다). 리뷰 배치(RA)는 B가 끝난 뒤 남은 양을 보고 Codex 또는 Claude Sonnet으로 정한다.
- B: Space keyup 정책을 물어 와서 지휘자가 답했다. keyup마다 Space-up을 보내고, 편집 대상 밖에서만 preventDefault한다. bd7a7baa를 a04a8711로 통합하고 작업자를 release했다.
- RB(Claude Sonnet 서브에이전트, `/code-review`): 🔴 0. 🟡 하나는 Space를 누른 채 캔버스가 리로드되면 새 문서가 Space-up을 보내지 않는다는 것이다. 렌더러 쪽 정리(보드가 사라질 때, 창이 포커스를 잃을 때, `setWorkspaceActive(false)`)가 덮는지를 A 리뷰와 C probe에서 확인한다. ⚪: Shift+Space·Shift+V/H는 전달된다(design은 ⌘⌃⌥만 거른다). 렌더러 `toolShortcut`과 같은 규칙인지 A 리뷰에서 본다.
- A 완료: 커밋 5개를 49049539..0b4e2781로 통합했다. 작업자 보고는 테스트 5605/5605와 typecheck 통과다. 수정 라운드에 다시 쓰려고 작업자를 retain했다.
  - 지휘자 판단: Hand로 끌기 시작할 때(pointerdown) `.area`에 포커스를 준다(Space를 누르고 있으면 주지 않는다). spec 결정 5("캔버스를 클릭하면 포커스가 캔버스 영역으로")를 따른 것이다. design의 "레이어는 포커스를 가져가지 않는다"는 레이어 자신이 포커스 대상이 아니라는 뜻으로 읽는다. Z1에서 ARCHITECTURE에 적는다.
  - 지휘자 판단: `terminal-agent-activity.html`·`buzz-project-settings.html` 초안에는 지운 `.doan-picking-esc.doan-kbd` 규칙의 사본이 남아 있다. 초안은 자기 CSS를 품은 그림이고 앱 코드가 아니어서 고치지 않는다.
- RA: Codex gpt-6-astra medium(dispatch `ctx_9f5eb52eaca4`, worktree `canvas-hand-tool-ra`)으로 시작했다. 대시보드 기준 Codex 사용량은 18%다.
- D: Claude Sonnet high(dispatch `ctx_7142167b7441`, worktree `canvas-hand-tool-d`)로 시작했다. RA가 `styles.css` 수정을 요구하면 D가 끝난 뒤 A에게 보낸다.
- RA 완료(테스트 5610/5610, typecheck 통과): 🔴 Space 상태가 그것을 받은 문서·보드보다 오래 남는다. 리로드·전환·닫기 때 `spaceHeld`가 풀리지 않고, 보드가 없을 때 받은 Space-down이 로드 뒤 레이어를 띄운다. 🟡 렌더러의 대기 중 명령과 seq가 같은 클릭은 받아들여지지만 포커스를 옮기지 않는다. 사용자 결정 항목은 없다. A의 차이 #5·#6·#10은 유지한다(RA도 같은 판단). A에 수정 1회차를 보냈다(dispatch `ctx_e6707ea5ebc7`). RA 작업자는 release했다.
- 통합 HEAD 첫 테스트 실행에서 1개가 실패했고 다시 돌리니 5610/5610 통과했다. 실패한 테스트 이름은 출력이 잘려 남지 않았다. 동시에 작업자들이 `npm ci`를 돌리던 부하에서 난 flaky로 보고, 최종 `/verify`에서 다시 본다.
- A 수정 1회차(455df182·b6273089 → 6373a1bb·bf1ca08a 통합): 재리뷰(Claude Sonnet 서브에이전트) 결과 🔴 0, 🟡 0, ⚪ 3이다. 남은 한 가지는 대기 중인 pick-frame의 seq와 같은 순간에 그 프레임 루트를 클릭하면 응답으로 간주되어 포커스가 옮겨지지 않는 것이다. 지휘자 판단으로 받아들인다. 메시지 내용으로는 구별할 수 없고, 비용은 예전 동작(포커스 유지)뿐이다. A 작업자는 release했다(브랜치 끝 b6273089).
- D 완료(978853cd·a4464a50·a7f1de36 → 1f9a462a·bc0c945d·b424a6ca 통합, 테스트 5614 통과, 실제 앱 probe의 전후 real-state 같음). 작업자는 retain했다.
  - 프리셋 hover: 팝오버 행은 포인터가 움직이면 그 행에 포커스를 주고, 공용 `:focus` 채움으로 칠한다(frame list와 같은 방식). `/` 목록은 포인터가 하나뿐인 강조를 옮긴다. 홈·캔버스 모두 전에는 채움이 없었고, 뒤에는 한 행만 채워진다.
  - 블러: 드롭다운 13종을 실제 앱에서 쟀더니 모두 같은 글라스(rgba(255,255,255,0.9) + blur(8px))였다. 사이드바 프로젝트 메뉴도 프리미티브가 다르지 않았다. 블러가 안 보인 원인은 위치다. 창은 `vibrancy: "sidebar"`로 투명하게 비워 두었고, 그 위에서는 웹 `backdrop-filter`가 뒤를 흐리지 못한다. 그래서 사이드바에서 여는 메뉴만 불투명 `--surface-popover`에 블러 없음 예외(`.shell-side-menu`)를 둔다. 지휘자 판단으로 받아들이고 아침 보고에서 사용자에게 알린다. 되돌리기는 규칙 하나다.
  - 체인 파일의 링크 5 메모를 이 결과에 맞춰 고쳤다(main d6907e56).
- D 리뷰: Claude Opus 서브에이전트(D는 Sonnet이 했다).
- C: Claude Opus high(dispatch `ctx_062725a2717a`, worktree `canvas-hand-tool-c`)로 시작했다. 기준은 b424a6ca를 포함한 feat다.
