# prototype-responsive — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261113-3](../chain-261113-3/chain.md) 링크 1a. 링크 1b `multi-handoff`와 병렬로 돈다. 권한은 체인 파일과 lead 브리프를 따른다.
- 시작 hash: `808252b4`
- 통합 브랜치: `feat/prototype-responsive` (lead가 `origin/develop`에서 만들었다)
- 런타임: conductor는 Claude Code다. 사용자가 체인의 모든 링크에 Codex 워커를 허가했다(체인 파일 '상시 권한'). 링크 시작 때 Codex 주간 사용량은 26%였다(`window_minutes: 10080`, Orca `CODEX_HOME`의 최신 rollout, pro).
- GUI probe(P, U의 `/design-sync`, R)는 워커가 띄우기 전에 conductor에게 `ask`하고, conductor가 lead에게 `GUI again`을 보내 허락을 받은 뒤 답한다. 끝나면 `GUI done`을 보낸다.

## 결정 기록

- 제품 결정은 spec '결정' 1–13에 모두 있다. 새로 물을 것은 없다(conductor 판단 — spec·design에 답이 있다).
- **`prototypeIframeBox`·`PROTOTYPE_NARROW_BELOW` 삭제 시점(conductor 판단)**: tasks 4는 순수 함수 배치에서 지우라고 하지만, 마지막 사용처 `PrototypeWindow.tsx`는 UI 배치(U)의 파일이다. C는 새 함수와 테스트를 더하고 `prototypeWindow.ts`의 캡처를 새 함수로 바꾸되 옛 함수와 그 테스트는 남긴다. U가 `ContentPanel`을 새 함수로 바꾸면서 옛 함수, 상수, 테스트를 지운다. 근거: 배치마다 typecheck가 green이어야 하고, 파일 소유가 겹치지 않아야 한다.
- **PoC와 C의 병렬(conductor 판단)**: 결정 1(Fit 축소)이 PoC에 기대지만, 순수 함수 1의 축소 계산은 PoC 결과와 상관없이 같은 꼴이고 나머지 함수는 PoC와 무관하다. PoC가 실패하면 C에 수정 Task를 보낸다. U는 PoC 통과 뒤에만 시작한다.
- 구현 배치는 Claude, 독립 리뷰는 Codex로 섞는다(conductor 판단 — 사용자의 이전 지시 '주 업무는 Claude, 리뷰에 Codex를 섞는다').
- Export 자리: `exporter`가 없으므로 이 링크에서는 Export 버튼을 그리지 않고 오른쪽 무리는 토글뿐이다(R 68, tasks 6).
- tasks 9의 `/verify`와 tasks 10 문서 승격은 conductor가 통합 뒤에 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 PoC | `.scratch/prototype-responsive/`, design.md 'PoC 의존' 아래 결과 | 없음 | Claude Opus medium — 격리 Electron에서 cross-origin sandbox iframe의 축소·포커스를 재는 조사형 작업. 판정에 판단이 든다 | `node .scratch/prototype-responsive/probe.mjs`(스크린샷) | 통합 `f971b196`(1회) |
| C | tasks 3·4(순수 함수 1–7, `ipc.ts` 타입), tasks 5(main·preload) | `app/src/main/prototype/**`(fit·ipc·requests·windowState·controller와 테스트), `app/src/main/prototypeWindow.ts`, `app/src/preload/prototype.ts`(+test), `app/src/renderer/prototype/host.ts`·`view.ts`(+test) | 없음 | Claude Opus high — 상태 기계(모드 유지, 로딩 중 전환의 gen·timeout), 캡처 사각형과 스냅숏 상자의 정수 계약 | `npm --prefix app test`, `run typecheck`, `run lint` | 통합 `f46afa1f`·`aeb74ba4`·`8902fae3`·`995bd060`(2회), worktree 정리 |
| T | tasks 6 중 프리미티브: `moveBetweenTools` → `toolbarKeys.ts`, `.doan-toggle-group`, `.doan/ds/toggle-group.html`, DESIGN.md 'Design-system canvases' 줄 | `app/src/renderer/toolbarKeys.ts`(새), `CanvasTools.tsx`(+test), `app/src/renderer/ds/controls.css`(+test), `.doan/ds/toggle-group.html`, `docs/DESIGN.md`의 그 줄 | 없음 | Claude Sonnet high — 옮기기와 CSS 프리미티브는 정해진 값이지만 ds 캔버스는 doan 규칙을 따라 그려야 한다 | `npm --prefix app test`, `run typecheck`, `run lint`, `doan check`·`doan ls` | 통합 `a48f5a76`–`65eb9e80`(1회), worktree 정리 |
| U | tasks 6의 나머지(헤더 오른쪽 무리·토글 연결, 이름의 둘째 줄, Reload 포인터 포커스, tooltip Esc, `ContentPanel` 상자, `overflow: clip`, 옛 함수 삭제), tasks 7 `/design-sync` | `app/src/renderer/prototype/PrototypeWindow.tsx`(+test), `WindowShell.test.tsx`, `app/src/renderer/styles.css`, `fit.ts`·`fit.test.ts`의 옛 함수 삭제, `docs/DESIGN.md` 'Frame prototype', `.scratch/design-sync/prototype-responsive/` | P 통과, C·T 통합 | Claude Opus high — 포커스·Esc·같은 요소 유지(POSTMORTEM 2026-11-13·11-07) 규칙이 많고 실제 앱 측정이 붙는다 | `npm --prefix app test`, `run typecheck`, `run lint`, `run build`, `node .scratch/design-sync/prototype-responsive/measure.mjs` | 대기 |
| VC | C diff 독립 리뷰(`/code-review`, 보고만) | 없음(읽기만) | C | Codex gpt-6-astra medium — 다른 계열의 눈으로 상태 기계와 캡처 계약을 본다 | 🔴 0 | 대기 |
| VT | T diff 독립 리뷰 | 없음 | T | Codex gpt-6.1-sol medium — 작은 diff, 정해진 값 대조 | 🔴 0 | 대기 |
| VU | U diff 독립 리뷰 | 없음 | U | Codex gpt-6-astra medium — 포커스·접근성 판단 | 🔴 0 | 대기 |
| R | tasks 8 `/runtime-test`(보고만) | `.scratch/runtime-test/prototype-responsive/`만 | U 통합 | Claude Sonnet high — 기대값이 tasks 8에 정해진 짧은 probe | probe 결과·스크린샷이 tasks 8과 같음 | 대기 |
| 9·10 | `/verify`, PRODUCT·ARCHITECTURE·DESIGN·BACKLOG 승격, feature 디렉터리 삭제 | 문서 | R | conductor | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

## 파일 겹침과 순서

- P(`.scratch/`, design.md), C(main·preload·renderer의 `host.ts`·`view.ts`), T(`toolbarKeys`·`CanvasTools`·`controls.css`·ds 캔버스)는 겹치지 않으므로 함께 시작한다.
- U는 C의 타입·순수 함수, T의 프리미티브, P의 결과에 기대므로 셋을 통합한 뒤 시작한다.
- `docs/DESIGN.md`는 T('Design-system canvases' 한 줄)와 U('Frame prototype')가 바꾼다. U는 T 통합 뒤에 돌므로 겹치지 않는다.
- GUI probe는 한 번에 하나다(P → U의 `/design-sync` → R). 링크 1b와는 lead를 거쳐 맞춘다.

## tasks 매핑

- 0·2 → 완료
- 1 → P
- 3·4·5 → C (옛 함수 삭제만 U)
- 6 → T(프리미티브·키 이동·ds 캔버스) + U(나머지)
- 7 → U
- 8 → R
- 9 → 배치별 리뷰 VC·VT·VU, 고침은 각 소유 워커, `/verify`는 conductor
- 10 → conductor

## 진행 기록
- C 질문: IPC 필드를 필수로 더하면 소유 밖 `WindowShell.test.tsx`·`PrototypeWindow.test.tsx`·`PrototypeWindow.tsx`(snapshot box 전달)의 타입이 깨진다. 동작 변경 없는 최소 수정을 C에게 허락했다(conductor 판단 — U는 C 통합 뒤라 겹치지 않는다).
- P 완료: Electron 45.0.0에서 (a)–(h) 모두 통과했다. (c)는 conductor도 `c-text-scaled.png`를 눈으로 확인했다. 입력은 CDP 이벤트라 OS 실제 입력은 확인하지 않았다. 구현 관찰: 프로토타입 페이지 CSP가 주입 `<style>`을 막으므로 축소 상자는 인라인 style로 준다(U 브리프에 넣는다). 증거는 conductor checkout의 `.scratch/prototype-responsive/`와 `.scratch/handoff-P.md`로 복사했다.
- C 완료(커밋 3개, app test 11316·typecheck·lint 통과). 계획과 다른 점: `prototypeCaptureRect`가 `{rect, box}`를 돌려준다. 패널을 아직 재지 않은 Fit은 scale 0으로 표시 크기를 지킨다. `modeTooltip`은 `(mode, run)`을 받는다. 360 창이 둘째 줄이 되어 기존 `fitPrototypeWindow` 기대값 두 개가 바뀌었다. U가 C 위에서 시작할 수 있게 리뷰 전에 통합했다. 리뷰 고침은 C 워커의 후속 커밋으로 받는다. VC는 Codex gpt-6-astra medium으로 시작했다.
- VC 결과 🔴 0 / 🟡 1: Fit 축소에서 iframe의 실제 보이는 크기(744.45)와 캡처 정수 크기(744)가 어긋난다. C에 수정 Task를 보냈다(`prototypeViewportBox`가 정수 보이는 크기를 내고 캡처가 같은 값을 쓴다). renderer의 clip 래퍼는 U가 붙인다.
- T 완료(커밋 4개). 눌린 항목 selector를 (0,6,0)으로 올려 ds chrome `:active`를 구체성으로 이긴다. 첫 `npm test`에서 7건이 실패했고 원인은 확인하지 못했다(두 번 다시 돌려 통과). 통합 `/verify`에서 다시 본다. VT는 Codex gpt-6.1-sol medium으로 시작했다.
- VT 결과 🔴 0 / 🟡 1: 코드 결함은 없다. 첫 전체 테스트의 7건 실패는 이름과 오류가 남지 않아 diff와의 관련을 배제하지 못했다. T에 고칠 것은 없으므로 통합 `/verify`에서 재발하면 그 출력을 보존해 판단한다(conductor 판단 — 실패 출력이 사라져 다시 볼 수 없다).
- C 수정 라운드 1 통합(`995bd060`): `ViewportBox`에 `visibleWidth`·`visibleHeight`를 더했고 캡처 box가 같은 값을 쓴다. 이 라운드에서 quickOpen 시간 측정 테스트가 한 번 실패했다가 단독 두 번과 전체 재실행에서 통과했다(변경과 무관한 파일).
- U를 Claude Opus high로 시작한다(base `995bd060` 이후).
- U 완료(커밋 3개, test 11351·typecheck·lint·build, `/design-sync` 104행 차이 0, 문서화된 차이 3). 통합 `3de5c551`·`c5acaabc`·`6f88e36d`. 못 잰 것: 작업 영역 높이 823이라 406 × 952·360 × 952 타일, 상태·대화·둘째 줄 메뉴 타일 대조. U의 ⚪: Fit에서 iframe이 표시 크기(최대 99999) CSS 크기를 갖고 `.pw-panel`의 네 모서리 같은 radius clip 아래 있어 8192 CSS px를 넘으면 POSTMORTEM 2026-11-11과 같은 잘림이 생길 수 있다. R에 큰 표시(1440x9000, 9000x900) 확인을 더했다.
- VU(Codex gpt-6-astra medium)와 R(Claude Sonnet high, `pr-r`)을 병렬로 시작했다. VU 고침이 생기면 R 증거 중 영향받는 것만 다시 본다.
- VU 결과 🔴 0 / 🟡 2 / 🟢 1. 🟡1: Fit에서 8192 넘는 iframe이 `.pw-panel`의 네 모서리 같은 radius clip 아래에 있다(ARCHITECTURE의 불변, POSTMORTEM 2026-11-11 재발 조건). 🟡2: 취소된 Reload 누름(놓기 취소, 우클릭)이 포커스 기억을 남겨 뒤의 다른 run에서 iframe에 포커스를 준다. 🟢1: DESIGN.md Frame drawer 행의 옛 메뉴 좌표와 Tab 순서 문장. 셋 모두 U에 수정 라운드 1로 보냈다.
