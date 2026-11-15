# prototype-link-play — orch

- 근거: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261115-1](../chain-261115-1/chain.md) 링크 2.
- 시작 해시: `32483e73d` (origin/develop, 링크 1 #204 병합 뒤)
- 통합 브랜치: `feat/prototype-link-play` (리드가 만듦, 워크트리 `prototype-link-play-orch`)
- 모델 경계: 체인 상시 권한으로 Codex 워커를 쓴다. 링크 시작 때 Codex 주간 사용량 46%(`$CODEX_HOME` 최신 rollout, `window_minutes` 10080, 2026-11-15 10:19). 쓴 범위는 아래 배치 표와 '모델 교차'에 적는다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| 1 | 가이드 문구는 E안이다. convention 15로 "Clicking an element with `data-doan-goto="<frame id>"` inside a marked frame plays that marked frame (`preventDefault()` cancels); `doan check` reports `goto_*`."를 더한다. design.md 표의 세 축소(convention 14 꼬리, `doan open` refusals 목록, export `--prototype`의 "plays only that frame")에 더해 `doan open` 줄의 " it only navigates."를 뺀다. `--json` 21,582 B(예산 21,600 B, 18 B 남음). | 사용자 결정(2026-11-15). 코드 네 개 이름을 다 적으면 21,693 B로 예산을 넘는다. |
| 2 | `skill_test.go` 내용 테스트는 가이드가 `data-doan-goto`와 `goto_*`를 담는지 본다(design.md의 "네 코드 이름" 대신). | 결정 1에 따른다. 컨덕터 판단. |
| 3 | 새 eval 시나리오 id는 W9가 아니라 **W11**이다. | 컨덕터 판단: `eval/scenarios/W9`·`W10`이 이미 다른 과제(다른 세션 편집 중)다. ARCHITECTURE §14 'Scenarios are fixed after their first recorded round'. |
| 4 | 배치 순서는 tasks.md대로 S → L → W 직렬, G는 처음부터 병렬. S는 작업 1 PoC가 기대대로 끝난 뒤 시작한다. | `requests.ts`를 S와 L이 함께 고치고, W는 둘의 타입과 판단을 쓴다. PoC가 클릭 판정의 전제다. |
| 5 | 실제 DOM 드리프트 테스트(링크 1 fixture html, 클릭 판정 표)는 Vitest에서 앱의 Electron을 Playwright `_electron`으로 띄워 숨긴 BrowserWindow에서 돌린다. CI(`ci.yml`)에 Electron 바이너리 내려받기를 더한다(배치 S가 고침). 승격 때 ARCHITECTURE에 적는다. 링크 3의 `isolate.js` 드리프트 테스트도 같은 장치를 쓴다. | 사용자 결정(2026-11-15). 앱 Vitest에 DOM이 없고, ARCHITECTURE 'Home tests without a DOM'이 jsdom 추가를 막는다. electron·playwright는 이미 devDependency다. |
| 6 | 값이 200 UTF-16 단위를 넘는 연결(`goto: null`)의 토스트 문구는 "Can’t go to this link’s frame. Ask your agent to fix this link."이다. 초안 `link-toast`에 더한다(design-sync 때 W). | 사용자 결정(2026-11-15). id를 인용할 수 없는 경우라 확정 문장 틀에서 id만 뺐다. |

## 배치

| 배치 | 항목 | 맡는 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| P | 작업 1 PoC | `.scratch/prototype-link-play/` | — | 컨덕터 | `node .scratch/prototype-link-play/poc.mjs` exit 0 | 완료(세 번 연속 exit 0, design.md 'PoC 관찰') |
| G | 작업 4 가이드·eval | `cli/internal/cli/skill.md`, `skill_test.go`, `eval/scenarios/W11/`, 필요하면 `eval/lib/` | 결정 1 | Codex `gpt-6.1-sol` medium: 문구가 정해졌고 W7 시나리오를 본뜨는 기계적 작업이다 | `go test ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W11` | 통합(1cfd6ffc6, 9e61c856c, 0677b8974). 리뷰 1회(Claude Opus medium): 🔴0 🟡0 ⚪5, ⚪1·⚪2 수정, 나머지는 그대로 두거나 승격 때 처리(⚪5: ARCHITECTURE §14 no-open 목록에 W11). 워크트리 제거, 브랜치 `SinhyeokKang/plp-g` 유지 |
| S | 작업 2 스크립트·보고 | `prototypeScript.ts`, `canvasScript.ts`, `canvasMessage.ts`, `requests.ts`의 `gotos` 검증과 각 테스트 | P | Claude Opus high: DOM 수집과 클릭 판정이 하위 1·3과 드리프트 없이 맞아야 한다 | `npm --prefix app test`, `typecheck`, `lint` | 통합(0be5de20d, 931ac7a7f, 09e86544c, 709c9c19a). 리뷰 1회(Codex `gpt-6-astra` medium): 🔴0 🟡3 ⚪2. 🟡 셋과 ⚪2(헬퍼를 `app/runtime/electronDom.ts`로 옮기고 종료 확인) 수정, ⚪1(클릭 표가 `click()`만 씀)은 링크 3에 넘김. 2차 수정 통합(efba76469): cut 프레임도 마크를 보냄(L 인계 1, spec 완료 조건 9). 워크트리 제거, 브랜치 `SinhyeokKang/plp-s` 유지 |
| L | 작업 3 판단·전이 | `playability.ts`, `prototypePlay.ts`, `requests.ts`의 `goto` 검증, `windowState.ts`, `history.ts`와 각 테스트 | S | Claude Opus high: gen·phase 판단과 기록 전이가 틀리면 창 상태가 엇갈린다(POSTMORTEM 2026-11-14) | `npm --prefix app test`, `typecheck`, `lint` | 통합(d2af0a550, b7ccf03ac, 리뷰 전 통합: 컨덕터 판단, W가 그 위에서 시작하도록). 리뷰 1회(Codex `gpt-6-astra` medium): 🔴0 🟡1(자기 연결이 사라진 캔버스를 확인하지 않음), 수정 통합(28f873f29, e2f39fa1d). 인계 2(실행 `gotos`를 windowState·view에 보관)는 W로 넘김. 워크트리 제거, 브랜치 `SinhyeokKang/plp-l` 유지 |
| W | 작업 5 창·툴바 | `CanvasHeader.tsx`, `frameDrawer.ts`, `host.ts`, `PrototypeWindow.tsx`, `view.ts`, `ipc.ts`, `preload/prototype.ts`, `controller.ts`, 꺼낸 서랍 본문, `CanvasTools.tsx`, `canvasTool.ts`, `App.tsx`와 각 테스트 | S, L | Claude Opus high: 포커스·접근성·Radix 트리거 정체성이 걸린 넓은 UI 배치 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 통합(b30c36c32, 33f4a7fc6, 63bc11534). 리뷰 1회(Codex `gpt-6-astra` medium): 🔴0 🟡3(렌더러의 goto 검증, 서랍 화살표가 툴바로 샘, 연속 이동 알림), 문구 1건은 결정 6. 수정 통합(cfafabfbb, fbe34350b) |
| R-* | 배치별 독립 리뷰(`/code-review`) | 보고만 | 각 배치 | S·L·W: Codex `gpt-6-astra` medium(다른 계열의 판단 리뷰). G: Claude Opus medium | 🔴 0 | 대기 |
| DS | 작업 7 `/design-sync` | 구현 수정, `docs/DESIGN.md` | W 통합 | W 워커의 후속 Task(같은 파일을 안다) | `node .scratch/design-sync/prototype-link-play/measure.mjs` exit 0 | 통합(ea7cdd3a6 초안에 결정 6 토스트, 39af611b5, b01bc39ed DESIGN.md). 333행 중 불일치 0(14행은 DESIGN.md 편차), 동작 점검 16개 통과, 독립 리뷰 2회 🔴0 🟡0. W 워크트리 제거, 브랜치 `SinhyeokKang/plp-w` 유지 |
| RT | 작업 8 `/runtime-test` | 보고만 | DS | 컨덕터가 정한다(별도 Claude 워커 가능) | probe exit 0, 스크린샷 | 완료: probe 두 번 연속 exit 0, 56개 점검 통과, 제품 결함 없음(보고서 `.scratch/runtime-test/prototype-link-play/report.md`). 미확인: VoiceOver 음성(live region 글자는 확인), 포커스가 프레임 밖일 때의 이동, read·init 실패 상태의 클릭, export 진행 토스트 단독. 워크트리 제거 |
| E | 작업 9 `/agent-eval` 전체 라운드 | `docs/USABILITY-EVAL.md` | 통합, package | 컨덕터가 정한다 | `--repeat 2` 뒤 자동 검사 | 진행: 0a47bc399에서 package 후 라운드 `plp-261115`(Claude Code 2.1.325, Codex 0.167.2). 그 HEAD에서 `verify.mjs --eval` PASS |
| — | 작업 6 통합 확인, 작업 10 승격 | 문서별 커밋 | 모든 배치 | 컨덕터 | `verify.mjs --eval`, tasks.md 작업 10 grep | 대기 |
| D | 작업 10 승격(PRODUCT·ARCHITECTURE·DIRECTORY) | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md` | 모든 배치 | Claude Opus high: 코드와 대조해 현재 규칙으로 다시 써야 한다 | 작업 10 grep | 통합(9bb713dfe, 1c33abf54, 334b307ef). grep: 옛 문구 0, `data-doan-goto` 3, 토스트 1, ARCHITECTURE `goto` 11(시작 5). 워크트리 제거, 브랜치 `SinhyeokKang/plp-d` 유지. feature 디렉터리 삭제와 USABILITY-EVAL은 컨덕터 |

## 파일 겹침과 순서

- S와 L은 `requests.ts`를 함께 고친다 → 직렬.
- W는 S의 `canvasMessage.ts` 타입과 L의 `playability` 결과를 쓴다 → S·L 뒤.
- G는 `cli/`·`eval/`만 고친다 → 다른 배치와 병렬.

## 모델 교차

- G 구현(Codex Sol), S·L·W 리뷰(Codex Astra). 실제 사용은 배치 상태에 갱신한다.
