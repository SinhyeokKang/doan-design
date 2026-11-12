# canvas-svg-sprites — 오케스트레이션

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261112](../chain-261112/chain.md) 링크 1(병렬 그룹, 링크 2 `claude-turn-end`와 동시 진행)
- 시작 hash: `8e9c33e9` (origin/develop, PR #177 포함)
- 통합 브랜치: `feat/canvas-svg-sprites` (lead가 만들었다. conductor worktree `canvas-svg-sprites-orch`)
- 워커: Claude만(모델 계열 교차 권한 없음). `/agent-eval`의 다른 계열 판정은 AGENTS.md 상시 예외다.

## 결정 기록

- 시작 점검(사용자 승인, 2026-11-12, lead 브리프): Safari 확인은 사용자가 export 파일을 열고 스크린숏을 남긴다. `/agent-eval` 실제 라운드 승인. 격리 앱 창이 작업 중에 떠도 된다.
- conductor 판단 — PoC(작업 1·2)를 한 배치로 묶는다. 같은 임시 repo·격리 앱·export 명령을 쓰고, 결과가 작업 3 이전의 설계 수정 여부를 정한다.
- conductor 판단 — 작업 3·4(`/tdd`·`/implement`)를 한 배치로 묶는다. 같은 파일(`cli/internal/canvas`, `check`, `export`, `cli/check.go`)을 쓰고 테스트 커밋과 구현 커밋 경계는 배치 안에서 지킨다.
- conductor 판단 — 작업 5(가이드·preset)는 작업 3·4와 파일이 겹치지 않으므로 PoC 뒤에 병렬로 돌린다. 가이드에 넣을 대체 형태는 PoC 결과를 따른다.
- conductor 판단 — 작업 6은 시나리오 작성(BE1)과 실제 라운드(BE2)로 나눈다. BE1은 `/code-review`와 병렬로, BE2는 리뷰 수정이 통합된 뒤 새 Task로 보낸다. 시나리오의 fixture 판정이 새 check 규칙에 기대므로 BE1은 BC 통합 뒤 시작한다.
- conductor 판단 — 작업 6의 마지막 항목(격리 앱으로 인라인 스프라이트 캔버스와 export 파일 재비교)은 BP 워커에게 후속 Task로 보낸다.
- conductor 판단 — 작업 7(승격과 정리)은 conductor의 문서 커밋으로 한다(`/orchestrate` §4·§5).
- conductor 판단 — PoC 의존 4의 "서로 다른 경로면 앱 결과가 순서에 따라 달라진다"가 Electron 45(Chromium 156)의 18쪽에서 재현되지 않았다. 앱은 사용처마다 자기 폴더 파일을 그렸다. 그래도 `ambiguous_custom_url` warning과 export 거부 조건(서로 다른 경로 둘 이상, 파일 존재와 무관)은 설계대로 둔다. 근거: export는 선언 하나에 data URL 하나를 넣으므로 사용처마다 다른 파일을 그리는 앱 결과를 재현할 수 없고, 후보 하나만 있을 때 export하면 다른 사용처에 앱이 그리지 않는 파일이 보인다. 사용자가 고른 조건(design.md '결정' 4·5)과 같고 tasks.md가 사용자 질문으로 정한 분기(같은 경로 경우의 순서 의존)에는 해당하지 않는다. 승격 때 BACKLOG 결함 3과 ARCHITECTURE의 "Chromium reuses the first resolution" 문장은 이 측정을 반영해 고친다(POSTMORTEM 기록은 보존).
- conductor 판단 — 가이드의 대체 형태는 PoC에서 앱과 Chromium export 모두 보인 아이콘별 SVG의 `<img src>`와 `mask: url(icon.svg)`만 쓴다. `sprite.svg#icon`을 `mask`·`<img>`로 쓰는 형태는 두 곳 모두 빈칸이었다.
- 사용자 결정(2026-11-13): POSTMORTEM 2026-11-03에서 보고된 캔버스(자기 `<style>`에서도 `--sf-icon`을 씀)가 다시 export 거부되고 `ambiguous_custom_url`을 받는 결과를 그대로 둔다. 결정 5와 spec '남는 결함'에 해당한다.
- conductor 판단 — 리뷰 R 1라운드: 🟡1(`@property` 등록 판정)은 BG 가이드 문장과 BC 판정을 모두 고친다(`inherits`·`initial-value`가 있을 때만 등록). ⚪1(`<title>` RCDATA 마크업에서 export `<use>` 거부 누락)과 ⚪2(일치 테스트에 `@property` 경우)도 BC가 고친다. 완료 조건 2를 비정상 마크업까지 지키고, 확인을 더 확실히 하기 위해서다. ⚪3(가이드가 로컬 `<use>` error를 직접 말하지 않음)은 `/agent-eval` 결과를 보고 정한다. ⚪4~6은 PR 본문과 승격에서 처리한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BP | 작업 1, 2 (PoC) + 작업 6 마지막 재비교(후속 Task) | `.scratch/canvas-svg-sprites/`, `tasks.md` 'PoC 기록' | 없음 | Opus high — 측정 설계와 판정이 결과를 좌우하고, 틀리면 설계 전체가 흔들린다 | 경우별 스크린숏·bbox·요청 로그, export 파일 경로(Safari용) | 완료 `bac40bf5` → 통합. Safari 12개 모두 Chromium과 같음(사용자 스크린숏, 2026-11-13) |
| BC | 작업 3, 4 (`/tdd`, `/implement`) | `cli/internal/canvas/`, `cli/internal/check/`, `cli/internal/export/`(`exporttest` 포함), `cli/internal/cli/check.go` | BP | Opus high — check·export 일치, reach 포함 관계, tokenizer `<template>` 함정이 있다 | `go test ./...`, `go vet ./...`, `verify.mjs`, repo 복사본 `doan check` 새 finding 0 | 완료 `36d23a42`·`8fb90bb2`·`ed2474f4` → 통합 `4ae87270`·`6cf1176f`·`ef77fc3d` |
| BG | 작업 5 (가이드·preset) | `cli/internal/cli/skill.md`, `cli/internal/designskill/presets/document.md` | BP | Sonnet medium — 정해진 문장을 예산 안에 넣는 작업이다 | `go test ./...`(`TestSkillGuideFitsToolOutputCap`), `doan skill --json` 출력 | 완료 `9abde758`·`284a45d5` → 통합(dispatch `ctx_3b9cb8cc657f`) |
| R | 작업 6 `/code-review` (BC+BG 통합 diff) | 보고만 | BC, BG 통합 | Opus high — check·export 판정 일치와 고아 제거를 독립적으로 판단해야 한다 | 🔴 0 | 1라운드 완료: 🔴0 🟡1 ⚪6(`.scratch/review-R.md`) → 수정 라운드 1 진행 |
| BE1 | 작업 6 시나리오 | `eval/scenarios/<새 id>/`, `eval/` 테스트(`checks.test.ts` 등) | BC 통합 | Opus medium — fixture와 실패 조건 설계에 판단이 들지만 범위가 좁다 | `node eval/run.ts --self-test` PASS·exit 0, `node --test 'eval/**/*.test.ts'`, `verify.mjs --eval` | 완료 `2173dbe6`(W6) → 통합 |
| BE2 | 작업 6 실제 `/agent-eval` 라운드 + `docs/USABILITY-EVAL.md` | `docs/USABILITY-EVAL.md` | R 수정 통합, BE1 통합 | BE1 워커 재사용 | `npm --prefix app run package`, `node eval/run.ts --round <name>` 전체 시나리오 | 대기 |
| 승격 | 작업 7 | PRODUCT, ARCHITECTURE, BACKLOG, `docs/features/canvas-svg-sprites/` 삭제 | 전부 | conductor | 완료 조건 1~7 대조, `git diff --stat origin/develop -- app/` 빈 결과, `rg` 잔여 없음 | 대기 |

## 파일 겹침과 순서

- BP → (BC ∥ BG) → (R ∥ BE1) → 수정 라운드 → BE2 → 승격.
- BC와 BG는 파일이 겹치지 않는다. BE1은 `eval/`만 쓴다.
- GUI probe: BP와 BP 후속 Task만 격리 앱을 띄운다. 링크 2도 앱 창을 띄울 수 있으므로 짧게 돌린다.
- 링크 2와 겹치는 코드·테스트·초안 파일은 없다(체인 파일 '병렬 판단').

## 검토 기록

- BP: handoff와 커밋(`tasks.md` 한 파일)을 대조했다. 근거 사본은 conductor checkout `.scratch/canvas-svg-sprites/`, `.scratch/handoff-BP.md`에 있다.
- BG: handoff와 diff를 대조했다. 가이드 테스트가 "comment" 단어를 막아 `<!-- source: path -->` note로 썼다. `design-skill document --json`이 예산 21,600 B 중 12 B만 남는다(PR 본문에 남긴다).
- BC: handoff와 커밋을 대조했다. `/ship`의 자체 리뷰는 🔴·🟡 0이다. 계획과 다른 점 4개(export `<use>` 판정의 `canvas.Parse` 대조, 캔버스 사용처를 `Canvas.Custom`에 둠, finding `value`가 `url()` 안 값, customurl 기대값이 거부로 바뀜)는 리뷰 R이 판정한다. POSTMORTEM 2026-11-03의 원래 캔버스는 캔버스 `<style>`도 같은 property를 써서 이제 거부된다. spec '기존 동작 변경' 2와 '남는 결함'에 해당하므로 PR 본문에 남긴다.
- 통합 `ef77fc3d`의 `/verify`: app-test에서 `doanyRender.test.ts`의 두 테스트가 20초 시간 초과로 실패했다(로그 `.scratch/verify/2026-11-12T15-22-49-332Z-61123/`). 다른 워커와 다른 링크가 동시에 테스트를 돌리던 때다. 이 브랜치는 `app/`을 바꾸지 않았고, 그 파일만 다시 돌리면 8개 모두 통과했다. 마지막 통합에서 워커가 쉬는 동안 전체 `/verify --eval`를 다시 돈다.
- BE1: handoff와 커밋(`eval/scenarios/W6/`만)을 대조했다. `checks.test.ts`는 W5처럼 `doan`을 mock하지 않고 H5처럼 실제 CLI를 돌린다. 새 check 규칙이 실제로 나오는지 고정하므로 받아들인다. self-test PASS(37 scenarios), eval 테스트 292/292.
