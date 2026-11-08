# export-hardening — orch

- 계획 출처: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)
- 체인: [chain-261109](../chain-261109/chain.md) 링크 2(마지막). 시작 점검·상시 권한은 체인 파일을 따른다.
- 시작 hash: `fba51f47`(develop, 링크 1 config-error-source 병합 뒤)
- 통합 브랜치: `feat/export-hardening`
- conductor: Claude Code(Opus), worktree `~/orca/workspaces/doan-design/export-hardening-orch`

## 결정 기록

모든 제품 결정은 spec '결정'(Q1–Q7, A–D)과 체인 시작 점검 3에 있다. 아래는 conductor 재량이다.

- **Codex 범위**(체인 상시 권한): 시작 때 Codex 주간 사용량 86% 사용(남은 14%, reset 2026-11-13, `$CODEX_HOME` rollout `window_minutes: 10080`). 구현 batch는 모두 Claude로 하고, Codex는 R 리뷰(Astra medium, 경로·scope 보안 판단) 한 건에만 쓴다. 남은 양이 허락하면 B 리뷰에도 쓰고 여기 적는다. conductor's call — 사용량 근거, worker-model-mix 관례(구현은 Claude, 교차 리뷰는 Codex).
- **기준 빌드**: `doan-before`는 이 orch.md 커밋에서 conductor가 한 번 빌드해 `.scratch/export-hardening/bin/doan-before`(conductor checkout)에 두고, 측정 batch는 그 절대 경로를 쓴다. T3 전 커밋이라는 T0 조건과 같고, batch마다 따로 빌드하면 기준이 갈릴 수 있다. conductor's call.
- **생성기 공유**: T0 생성기는 MP가 만든다. `.scratch/`는 커밋되지 않으므로 conductor가 MP worktree에서 conductor checkout의 `.scratch/export-hardening/`로 복사해 절대 경로로 R(T5)·MF(T9)에 넘긴다. R의 T5는 그때까지 deferred item이다. conductor's call.
- **design.md 공유**: MP는 §2, SP는 §4만 고친다. 같은 파일이지만 다른 절이고 문서뿐이라 병렬로 두고, 통합은 하나씩 cherry-pick한다. 충돌이 나면 conductor가 통합 커밋에서 푼다. conductor's call.
- **T12·T14**: `/verify` 전체 gate와 문서 올리기(PRODUCT·ARCHITECTURE·BACKLOG, feature 디렉터리 삭제)는 conductor가 한다(docs-freshness 커밋). T13 `/agent-eval`은 worker가 돈다.
- **`/runtime-test`**: tasks T12대로 앱 동작이 바뀌지 않아 하지 않는다. T2의 Electron 측정은 PoC다(체인 시작 점검 4: 화면이 잠겨 렌더링·캡처가 막히면 미검증으로 적고 headless 엔진으로 sprite 갈래를 정한다).

- **sprite `<style>`(item 4)는 비목표로 옮긴다.** T2 결과: (ii) 범위 좁히기는 Chromium·Electron에서 모든 경우 실패했다(WebKit만 통과). 판정 규칙의 글자대로면 (i)이지만, 앱(`sandbox="allow-scripts"`, opaque origin)은 외부 `<use href="file.svg#id">`를 아예 그리지 않으므로 결정 C의 이유("앱과 같은 결과")가 성립하지 않고, (i)을 하면 export와 앱의 차이가 넓어진다. 사용자가 말한 Q4 결정("PoC 뒤 범위를 좁혀 포함하고, 실패하면 거절 유지")대로 `ReasonUseStyle`를 유지하고 T10·T11·C5를 지운다. 제품 동작은 바뀌지 않는다. conductor's call — 되돌릴 수 있는 쪽(변경 없음)을 골랐고, PR 본문에 사용자가 다시 볼 지점으로 적는다. 앱이 외부 `<use>`를 그리지 않는 것은 별도 결함으로 T14에서 BACKLOG에 올린다.
- **결정 A의 이유 정정**: 결과에 남은 `<base href>`는 측정한 세 엔진에서 fragment 참조를 깨지 않았다. base 제거는 그대로 하고(모든 참조가 data URI라 base가 쓸모없다), 문서의 이유만 고친다.

## Batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort(이유) | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| R | T3, T4, T5 | `cli/internal/repo/resolve.go`와 새 repo 테스트, `cli/internal/export/resolve.go`·`inline.go`의 Resolver 전달, `cli/internal/cli/check.go`·`export.go` | 없음(T5는 MP 생성기) | Claude Opus high(경로 해석·scope·symlink 보안 경계, 잘못되면 serving scope가 샌다) | `go test ./...`, `go vet ./...`, mutation 확인, T5 ≤ 2 s | 대기 |
| MP | T0, T1 | `.scratch/export-hardening/` 생성기, `cli/internal/export/`의 새 opt-in 프로파일 테스트 파일, design.md §2 | 없음 | Claude Opus high(프로파일 해석과 가설 판정이 MF의 수정 대상을 정한다) | 생성기 sha256 두 번 같음, pprof 결과가 §2에 있음 | 통합 `55afdb85`, `a05638b1` |
| SP | T2 | `.scratch/export-hardening/` 측정 스크립트, design.md §4 | 없음 | Claude Opus high(두 엔진·Electron 측정 설계, 판정이 SF 유무를 정한다) | 측정 스크립트 실행, 결과 표·판정이 §4에 있음 | 통합 `168faac8`, 후속(판정 반영·실제 앱 확인) 진행 |
| B | T6, T7 | `cli/internal/export/`의 새 base 파일, `inline.go`·`classify.go`·`customurl.go`·`assemble.go` 중 필요한 곳, `exporttest/seed.go`, `cli/internal/cli/export_test.go` | R 통합 | Claude Opus high(거절 순서·custom property 사용처·결과 바이트 고정) | `go test ./...` | 대기 |
| MF1 | T8의 lexer 부분 | `cli/internal/canvas/css.go`와 canvas 테스트(export API 그대로) | MP | Claude Opus high(같은 worker가 프로파일 맥락을 이어받는다. scanner 결과 동등성) | `go test ./...`, 동등성 테스트, `TestCSSRefsMatchesScanCSS` | 진행 |
| MF2 | T8의 export 사본 부분, T9 | `cli/internal/export/` `assemble.go`·`inline.go`·`customurl.go`·`rewrite.go`·`datauri.go`, 필요하면 `cli/internal/cli/export.go` | B·MF1 통합 | Claude Opus high(결과 바이트 고정, 쓰기 경로) | `go test ./...`, `go vet ./...`, RSS ≤ 240 MiB | 대기 |
| SF | T10, T11 | `cli/internal/export/` sprite 코드, `fix2_test.go` | SP 판정 (i)/(ii), B·MF 통합 | Claude Opus high(foreign `<style>` 파싱, 범위 좁히기의 누출) | `go test ./...`, T2 스크립트 재측정 | 취소(sprite `<style>` 비목표) |
| EV | T13 | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/` | 모든 코드 통합 | Claude Sonnet high(정해진 명령 실행과 결과 비교, 판단은 적다) | X1 두 에이전트 모두 직전 라운드보다 나빠지지 않음 | 대기 |
| conductor | T12, T14 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, feature 디렉터리 삭제 | EV | — | `verify.mjs` 통과, T14 grep | 대기 |

리뷰: 각 구현 batch는 독립 리뷰 worker가 `/code-review`한다. R → Codex Astra medium, B·MF·SF → Claude Opus high(Codex 사용량 때문에).

## 겹침과 순서

- 1단계 병렬: R, MP, SP. R은 `repo`와 export·check의 호출부, MP는 새 테스트 파일과 design §2, SP는 `.scratch/`와 design §4만 고친다.
- 2단계: R 통합 뒤 B. MF는 MP 판정을 보고 B와 파일이 겹치지 않으면 병렬, 겹치면 B 뒤.
- 3단계: SF(SP 판정이 (iii)이면 SF를 지우고 spec·BACKLOG를 판정대로 고친다).
- 4단계: T12 → EV → T14 → push·PR.

## 진행 기록

- 2026-11-09 1단계 시작: Run `run_ded526f160b4`. R `ctx_becd15eb3466`(worktree `eh-r`), MP `ctx_0b0d1ba3e054`(`eh-mp`), SP `ctx_c502466fab4d`(`eh-sp`). 셋 다 Claude Opus high, `launch.effective` 확인. 기준 CLI `doan-before`는 `e88b05ce`에서 빌드했다(Apple M1, 16 GiB, go1.27.3 darwin/arm64).
- MP 완료: 24 MiB 입력의 doan-before 최대 RSS 2,205,253,632 B, `canvas.lex`가 할당의 91.8%. lex가 거의 없는 대조 입력도 299,794,432 B라 export 사본도 고쳐야 한다(design §2). 수정 범위가 B와 `inline.go`·`customurl.go`·`assemble.go`에서 겹치므로 MF를 둘로 나눴다: MF1(canvas lexer만, 지금 병렬)과 MF2(export 사본·T8 회귀 테스트·T9, B 뒤). conductor's call — 겹치지 않는 부분을 먼저 돌려 대기 시간을 줄인다. 생성기는 conductor checkout `.scratch/export-hardening/`로 복사했고 digest가 같다. R에 T5 경로를 보냈다.
- SP 완료(`168faac8`): 위 sprite 판정과 결정 A 이유 정정을 결정 기록에 적었다. SP worker에 후속으로 feature 문서 반영(spec·design·tasks)과 격리 dev 앱에서 외부 `<use>` 미표시 확인을 맡겼다.
