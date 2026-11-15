# prototype-link-export — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261115-1](../chain-261115-1/chain.md) 링크 3(마지막)
- 시작 해시: `92c8a1853` (`origin/develop`, 링크 1·2 병합 뒤)
- 통합 브랜치: `feat/prototype-link-export`
- 모델 교차: 체인 상시 권한(사용자 2026-11-15, 세 링크 모두 Codex 워커 허가). 링크 시작 때 Codex 주간 사용량 52%(`rate_limits` `window_minutes: 10080`, Orca `CODEX_HOME`의 최신 rollout). 쓴 범위는 아래 배치 표에 적는다.

## 결정 기록

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | 성공 토스트 문구 | 연결이 있으면 `Exported “<frame>” and N linked frames. The file also contains the rest of the canvas.`, 1개면 `and 1 linked frame`. 연결이 없으면 지금 문구 그대로. | 사용자(시작 점검 2) |
| 2 | `--json` 새 필드 | `linkedFrames`: 시작 프레임을 뺀 묶음의 프레임 수. `--prototype`일 때만 있고(`prototype: true`와 같은 규칙), 연결 없는 프레임은 0. 기존 `frames`는 그대로. | 사용자(시작 점검 2) |
| 3 | 사람용 텍스트 출력(`Exported … frame … to …`) | 바꾸지 않는다. | 컨덕터 판단 — spec은 `--json` 필드만 말하고, 기존 출력을 바꾸지 않는 쪽이 범위가 작다 |
| 4 | 가이드 문장 | 바꾸지 않는다. "plays only that frame"이 없는지만 확인한다. | spec '하지 않는 것', 완료 조건 13 |

## 배치

| 배치 | 항목 | 맡는 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| PoC | tasks 1 | `.scratch/prototype-link-export/`, design.md 관찰 | — | 컨덕터 | `node .scratch/prototype-link-export/poc.mjs` exit 0 | 완료(b9d192e55, Chromium·WebKit × file·http 세 번 exit 0) |
| X | tasks 2 | `cli/internal/cli/export.go`, `cli/internal/canvas/prototype_rules.go`(필요 시), `cli/internal/export/assemble.go`, `cli/internal/export/viewer/*`, `app/src/renderer/canvasExport.ts`, `app/src/renderer/canvasRowMessages.ts`, `app/src/main/exportViewer.test.ts`, Go export 테스트 | PoC | Claude Opus high — 링크 의미 복제, 기록·iframe 수명, 바이트 고정 테스트가 얽혀 판단이 많고 틀리면 받는 사람 파일이 깨진다 | tasks 2 검증 명령 | 구현 완료(`plx-x`, 브랜치 `SinhyeokKang/plx-x`, 893669f1c..b05d9740d, 게이트 5개 통과, 자체 `/code-review` 🟡 1 수정). 리뷰 대기 |
| X 리뷰 | X diff `/code-review` | 보고만 | X | Codex `gpt-6-astra` medium — 교차 계열 독립 리뷰 | 🔴 0 | 1차: 🔴 1·🟡 0·⚪ 1(`.scratch/review-X.md`). 재리뷰 1: 🔴 1 남음. 수정 2차 진행 |
| 통합·확인 | tasks 3–7 | 통합 커밋, 문서 승격 | X | 컨덕터 | 각 작업의 검증 | 대기 |

## 파일 겹침과 순서

배치 X 하나만 코드를 고친다. PoC 관찰(특히 sandbox iframe의 `window.name`)이 X의 전달 방식을 정하므로 PoC 다음에 X를 띄운다. 통합 확인(3–6)은 X 통합 뒤 직렬이다.

## tasks 대응

- 1 → PoC · 2 → X · 3–7 → 통합·확인

## 검증 기록

- 작업 4 브라우저 probe를 통합 전에 X 코드(b05d9740d)로 먼저 돌렸다: `SRC_ROOT=<plx-x> .scratch/runtime-test/prototype-link-export/setup.sh` → `node .scratch/runtime-test/prototype-link-export/probe.mjs <work>`, Chromium·WebKit `file://`에서 74개 항목 PASS, exit 0. 통합 HEAD에서 다시 돌린다.

## 리뷰와 수정

- 1차 리뷰(Codex astra medium): 🔴 1 — `<a href>`에 단 연결을 캔버스가 window bubble 단계에서 `preventDefault()`나 `returnValue = false`로 취소해도 이동한다. isolate.js가 자기 취소 직전 값만 기록하기 때문이다(design의 기록 방식 자체가 이 경우를 놓친다). spec 완료 조건 4 위반이다. ⚪ 1 — 페이지 전환은 대역 테스트뿐이라 실제 브라우저 근거가 필요하다(작업 4 probe가 맡는다).
- 수정 방향(컨덕터 판단, 근거: 래퍼는 리뷰가 든 호환성 위험이 크다): isolate.js의 window capture 리스너가 그 클릭마다 window bubble 리스너를 새로 붙인다. 이 리스너는 캔버스의 bubble 리스너 뒤에 돌아 모든 취소를 본 뒤에 자기 취소를 한다. 수정 1차를 배치 X 워커에 보냈다(dispatch `ctx_6b2adcbbe988`).
- probe에 두 경우(window bubble `preventDefault`, `returnValue = false`, 둘 다 `<a href>` 연결)를 더했다. 수정 전 X 코드에서 Chromium·WebKit 모두 이 4개 항목만 실패했다(나머지 PASS).
- 수정 1차(72e157243, 3d1e99298): 클릭 전에 등록한 window 취소는 막는다. probe 78/78.
- 재리뷰 1(Codex astra medium, 첫 재개는 Codex 업데이트 화면에 막혀 같은 워크트리에 새로 띄움): 🔴 1 남음 — 클릭 처리 중에 캔버스가 새로 붙인 window 취소는 late 리스너 뒤에 돌아 놓친다. href 없는 연결에서는 기록한 값이 최종 `defaultPrevented`를 덮어 회귀가 생겼다.
- 수정 2차 방향(컨덕터 판단): href 없는 연결은 late 리스너 없이 타이머에서 최종 `defaultPrevented`를 읽는다(앱과 같음). `<a href>` 연결은 late 리스너가 값을 기록하고 자기 취소를 한 뒤, 그 이벤트 인스턴스에만 `preventDefault`와 `returnValue` setter를 가려 그 뒤의 캔버스 취소를 기록한다(`Event.prototype`은 건드리지 않음). 남는 한계 둘(`<a href>` 연결에서 late 뒤에 추가된 passive 리스너의 `preventDefault`는 취소로 셈, 클릭 중 처음 설정한 `onclick`의 `return false`는 못 봄)은 테스트로 고정하고 ARCHITECTURE 한계에 적는다.
- probe에 클릭 중 추가한 window 취소 두 경우(`<a href>`, button)를 더했다. 수정 1차 코드에서 Chromium·WebKit 모두 이 4개만 실패했다.
