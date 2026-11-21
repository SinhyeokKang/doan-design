# export-prototype-player 오케스트레이션

- 계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `9d3a16a27` (origin/develop)
- 통합 브랜치: `feat/export-prototype-player`
- 모델 경계: Claude 워커만 쓴다. 사용자가 이 세션에서 교차를 허용하지 않았다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | tasks 3단계(TDD)를 한 배치로 따로 두지 않는다. 각 구현 배치가 `/ship`의 `/tdd`로 자기 범위의 새 단언을 먼저 커밋하고 실패를 확인한다 | 지휘자 판단 — 3단계 단언은 4~7단계의 파일에 나뉘어 있고, 테스트 우선 커밋이라는 의도는 배치마다 유지된다 |
| D2 | 구현 배치 B2~B5는 직렬로 돌린다 | 지휘자 판단 — 모두 `cli/internal/export/assemble.go`(뷰어 파일 목록)와 `TestAssembleOutputIsPinned` digest, `cli/internal/export/viewer/`를 고친다 |
| D3 | 브라우저 PoC(B1)는 시안 확정 전에 돌린다. 구현 배치는 사용자가 앱에서 시안을 확정한 뒤 시작한다 | 리드 지시 |
| D4 | 브라우저 확인 스크립트는 `.scratch/export-prototype-player/`에 둔다 | tasks.md 머리말 |
| D5 | 9단계의 실제 macOS Safari 확인은 지휘자가 `orca computer`로 시도하고, 막히면 사용자에게 넘긴다 | 지휘자 판단 — 팝업 차단 해제는 Safari 설정 조작이라 사용자가 해야 할 수 있다 |
| D7 | 원문에 같은 ID가 둘 이상인 프레임(B2 데이터의 `refused` reason `shared`)의 내보내기 거절은 스크립트가 만든 프레임과 같은 문구 “Couldn’t export “<frame>”. This frame isn’t in the canvas file. Ask the sender for an updated file.”를 쓴다 | 지휘자 판단 — 앱이 같은 경우를 `frame_not_found` → `notFound`로 묶는다(`app/src/main/canvasExport.ts` 21·87행) |
| D8 | 재생창은 같은 일반 Export 파일을 `#doan-play=<id>`와 보드를 열 때마다 만든 고유 창 이름으로 다시 연다. WebKit에서 보드를 닫은 뒤 ⌘R이 실패하는 점은 9단계 실제 Safari에서 확인하고, 같으면 BACKLOG에 남긴다 | 사용자 결정 — B1 PoC에서 두 엔진의 기록·새로고침·보드 닫은 뒤 재생·DOM 격리를 모두 통과한 유일한 후보다. noopener는 재사용과 차단 감지를 잃는다 |
| D9 | 다운로드 파일 이름이 240 UTF-16 단위를 넘으면 `.html`은 두고 `<stem>-<id>` 끝을 코드 포인트 경계에서 잘라 240 단위 이하로 만든다 | 사용자 결정 — Chromium은 245 단위 이상 이름의 다운로드를 조용히 취소한다(B1) |
| D10 | 보드↔재생창은 문자열만 `postMessage`로 주고받고 `event.source`로 상대를 확인한다. 보드는 늘 `play:<id>`를 보내고, 같은 프레임인지는 재생창이 판정한다. `window.open`은 뷰어 버튼의 `click`·`keydown` 처리기 안에서만 동기 호출한다. 재생 모드는 보드 iframe을 로드 전에 치우는 가드를 iframe 앞에 둔다 | 지휘자 판단 — B1 PoC 측정(캔버스 iframe 클릭의 활성화가 보드로 전파됨, 가드 없이 Chromium popup 2/20 누출). design.md가 창 통신과 입력 인정 방식을 PoC로 정하게 했다 |
| D11 | 재생기는 창 기능 문자열 없이 `window.open`으로 열고, 브라우저가 정한 탭이나 창을 받아들인다. 승격할 때 spec 완료 조건 4의 “별도 브라우저 창”을 “브라우저가 정한 새 탭이나 창”으로 다시 쓴다 | 사용자 결정 — B4 리뷰 🟡1 |
| D12 | 보드와 재생창 사이에 `mode:<fit\|responsive>` 문자열을 더하고, 일반 Export 데이터 `meta.prototype.frames[].mark`를 더한다. 재생 iframe에는 isolate.js 다음에 앱의 실행 스크립트(생성 번들)를 둔다 | 지휘자 판단 — B4 리뷰에서 D10 원칙(문자열만, `event.source` 확인)과 '첫 스크립트는 isolate.js'를 지킨다고 확인했다 |
| D13 | 재생기의 다운로드 기본 이름은 앱 `prototypeExportName`과 같게 `/`·`:`·제어 문자를 `-`로 바꾸고, stem이 비면 `<id>.html`로 한 뒤 D9로 자른다 | 지휘자 판단 — design.md가 앱 저장 패널의 기본값을 따르라고 정했다. B5 리뷰 🟡1(WebKit은 줄바꿈이 든 이름을 `example.com`으로 바꾼다) |
| D14 | 새 내보내기 문구 2개를 쓴다. 페이지 자료가 맞지 않을 때 “Couldn’t export “<frame>”. Ask the sender for an updated file.”, 브라우저가 파일을 만들지 못할 때 “Couldn’t export “<frame>”. Try again.” | 지휘자 판단 — 둘 다 실제로 생기는 상태이고, 기존 거절 문구와 앱 `failed` 문구의 조각만 쓴다. clarify 프리셋 기준(무엇이 실패했는지와 복구 방법)을 지킨다 |
| D6 | 10단계 승격(PRODUCT·ARCHITECTURE·DESIGN·BACKLOG)은 지휘자가 문서별 커밋으로 한다 | orchestrate 스킬 §4·§5 |

## 시안 검토 (tasks 2단계)

- `doan check --repo . --json`: 오류 0, 경고 43(모두 공유 `.doan/assets/mock.css`의 기존 hardcoded_color).
- `doan ls --repo . --json`: `export-prototype-player` 프레임 9개가 design.md의 상태 9개와 같다.
- 각 프레임을 Chromium으로 렌더해 확인했다. 문구는 design.md '브라우저 상태와 문구' 표와 같다. 서랍은 공유 `doan-floating doan-menu` 표면을 쓴다.
- 참고: `play-blocked`의 760px 보드에서는 오른쪽 아래 토스트가 가운데 툴바의 Hand·Play를 덮는다. 토스트 규칙(오른쪽 아래, 너비 min(384, W − 32))이 앱과 같으므로 시안 결함으로 보지 않고 8단계 `/design-sync`에서 좁은 창을 측정한다.
- 사용자 확정: 사용자가 앱(develop 체크아웃, 같은 파일)에서 확인하고 확정했다.

## 배치

| 배치 | 항목 (tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | 1 브라우저 PoC | `.scratch/export-prototype-player/poc/`만. 커밋 없음 | 없음 | Opus high — 창 생성 방식·창 통신·사용자 입력 인정 방식을 이 결과로 정한다 | Chromium·WebKit 실제 file URL 결과표, 미검증 항목 | 완료. 증거는 `.scratch/handoff-B1.md`와 `.scratch/export-prototype-player/poc/`(지휘자 체크아웃) |
| B2 | 3(Go 단언) · 4 일반 Export 조립 | `cli/internal/export/*.go`, `schema/fixtures/prototype-mark`·`prototype-links` | 시안 확정 | Opus high — 이스케이프와 바이트 동일성, 50 MiB 경계 | `go test ./...`, `go vet ./...` | 통합 e38094f19·50ea75a5e. 리뷰 1회(🔴 0, 🟡 2는 B3·B5 브리프로 넘김). 통합 HEAD `verify.mjs` PASS. 워커 해제, 워크트리 삭제(브랜치 유지) |
| B3 | 3(TS 단언) · 5 Select와 보드 재생 진입점 | `cli/internal/export/viewer/`(보드 쪽), `app/scripts/viewerInspect.mjs`, 앱 TS 소스와 테스트, `assemble.go`의 파일 목록과 digest | B2 | Opus high — 입력·포커스·선택 경로를 앱과 맞춘다 | `viewerInspect.mjs --check`, `npm --prefix app test`, 실제 파일 보드 입력 검증 | 통합 b7e6fa1e3·4c125bf80. 리뷰 1회(🔴 0, 🟡 0, ⚪ 7 중 3건은 B4 브리프로 넘김). 보드 확인 Chromium·WebKit 18/18. 통합 HEAD `verify.mjs` PASS. 워커 해제, 워크트리 삭제(브랜치 유지) |
| B4 | 6 브라우저 재생창 | 재생 페이지 HTML·JS·CSS, 뷰어 JS, `assemble.go` | B1, B3 | Opus high — 보안 경계(sandbox, 문자열만 전달), 창 수명, 기록 | `npm --prefix app test`, Chromium·WebKit 앱·브라우저 비교 | 통합 43a128ba2·490518da9·cf52d7099. 리뷰 1회(🔴 0, 🟡 2: 1은 D11, 2인 앱·브라우저 비교 공백은 B6로 넘김. ⚪ 1·3·5는 B5, 4는 B7로 넘김). Chromium 59/59, WebKit 55/55. 통합 HEAD `verify.mjs` PASS. 워커 해제, 워크트리 삭제(브랜치 유지) |
| B5 | 7 현재 프로토타입 내보내기 | 뷰어 JS, `assemble.go`와 Go 테스트 | B2, B4 | Opus high — CLI 결과와 “같은 결과” 판정 | `go test ./...`, `npm --prefix app test`, 받은 파일 오프라인 재개방 | 통합 512e90187·261fe8a5d·f74a98262·01c6567fc. 리뷰 1회(🔴 0, 🟡 1 → D13), 수정 1회. ⚪2 큰 파일 활성화는 9단계로 넘김. Chromium 63/63, WebKit 62/64(2건 미검증). 통합 HEAD `verify.mjs` PASS. 워커 해제, 워크트리 삭제(브랜치 유지) |
| B6 | 8 `/design-sync` | 구현 수정, `docs/design/canvas.md`·`prototype.md` | B5 | Opus high — 9개 상태 측정과 수정 | computed style 측정 기록 | 진행 (`ctx_465523113515`) |
| B7 | 9 브라우저 통합 증거 | `.scratch/`만 | B6 | Opus medium — 정해진 시나리오 실행과 기록 | Chromium·WebKit 일반 Export와 단독 Export 시나리오 | 대기 |
| B8 | 9 `/agent-eval` | `docs/usability-eval/`, `docs/USABILITY-EVAL.md` | B6 | Sonnet medium — 정해진 러너 실행과 기록 | 러너 결과 기록 | 대기 |
| 지휘자 | 9 verify·runtime-test·실제 Safari, 10 승격 | PRODUCT·ARCHITECTURE·DESIGN·BACKLOG·DIRECTORY, 기능 디렉터리 삭제 | B7, B8 | — | `verify.mjs`, 문서 링크 | 대기 |

구현 배치(B2~B6)마다 독립 리뷰 워커(Opus high, `/code-review`, 보고만)를 둔다.

## 겹침과 순서

- B1은 커밋하지 않으므로 다른 배치와 겹치지 않는다.
- B2 → B3 → B4 → B5 → B6은 직렬이다(D2).
- B7과 B8은 파일이 겹치지 않아 병렬로 돌린다.
