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
| A | T1, T3 | `app/src/renderer/`(`selection.ts` 또는 새 규칙 파일, `canvasMessage.ts`, `CanvasController.ts`, `CanvasTools.tsx`, `App.tsx`, `styles.css`, `ds/controls.css`, 각 테스트), `app/src/restore/uiState.ts`, `app/src/main/uiState.ts`(+test), `.doan/ds/tooltip.html` | 없음 | Claude Opus high: 포인터 캡처·포커스·키 순서·ui-state 복원 경쟁이 얽혀 있고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 진행 중 |
| B | T2 | `app/src/main/canvasScript.ts`, `app/src/main/canvasScript.test.ts` | 없음(메시지 모양은 결정 기록) | Codex gpt-6-astra medium: 파일 하나지만 편집 대상 판정과 blur 처리에 판단이 필요하다. Claude 사용량을 아낀다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 진행 중 |
| RA | A 리뷰 | 읽기만 | A | Codex gpt-6-astra medium: 다른 모델 계열의 독립 리뷰 | `/code-review` 보고서 | 대기 |
| RB | B 리뷰 | 읽기만 | B | Claude Sonnet medium: 작은 diff, 다른 계열 리뷰 | `/code-review` 보고서 | 대기 |
| D | 사용자 요청 디자인 이슈 2개(아래 결정 기록) | `ComposerParts.tsx`, `ShellSidebar.tsx`·`HomeComposerView.tsx`의 드롭다운 클래스, `styles.css`, `ds/surfaces.css`와 테스트, `docs/DESIGN.md` 해당 행 | A 통합(styles.css 겹침) | Claude Sonnet high: 범위가 작지만 실제 앱 computed style 측정이 필요하다. Claude 사용량을 아낀다 | `npm --prefix app test`, typecheck, 실제 앱 측정 | 대기 |
| C | T4(`/runtime-test`, `/design-sync`) | `.scratch/`, `docs/DESIGN.md`의 측정값, design-sync가 고치는 앱 코드(그때 A와 겹치지 않게 지휘자가 순서를 잡는다) | A·B 통합 | Claude Opus high: 실제 앱 probe, 측정과 판단 | probe 완료 표식·exit 0, real-state 전후 같음, `measure.mjs` | 대기 |
| 지휘자 | T5(리뷰 지적 분배), T6, Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` 설명 문장, 이 디렉터리 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, Z1 grep | 대기 |

T5의 `/refactor`는 지적이 나온 배치의 작업자가 한다.

## 파일 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. 둘 다 끝나면 통합하고 C를 시작한다.
- C의 `/design-sync`가 앱 코드를 고치면 A의 파일과 겹친다. 그때 A는 끝나 있어야 하고, 고칠 것은 C가 맡는다.
- App 테스트의 ui-state 하네스는 A만 고친다.

## 기록

- 2026-11-03 Run `run_389c91f1f364`. A: task `task_0e0391c2f766`, dispatch `ctx_146d8b772309`, worktree `canvas-hand-tool-a`(브랜치 `SinhyeokKang/feat-canvas-hand-tool`), launch.effective claude opus high. B: task `task_71946233c4e3`, dispatch `ctx_32712096eee5`, worktree `canvas-hand-tool-b`(브랜치 `SinhyeokKang/feat-canvas-hand-tool-2`), launch.effective codex gpt-6-astra medium. 둘 다 d5891519에서 시작했다.
- Codex 상태줄에 주간 한도가 12% 남았다고 나온다(대시보드의 18% 사용과 다르다). 리뷰 배치(RA)는 B가 끝난 뒤 남은 양을 보고 Codex 또는 Claude Sonnet으로 정한다.
