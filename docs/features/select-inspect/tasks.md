# select-inspect — tasks

순서: PoC 게이트 → 초안(게이트) → 스키마 · fixture → 순수 함수 → CLI · MCP · 스킬 → main(소켓 · 저장소) → 캔버스 스크립트 → renderer → e2e → 실제 에이전트 확인 → `/design-sync` → 승격. `── commit ──`은 커밋 경계다. 코드 경계는 `test:`(red) + `feat:` 한 쌍으로 나눠도 된다. 각 코드 경계에서 해당 언어의 테스트와 정적 검사(`go test ./...` · `go vet ./...`, `npm --prefix app test` · `npm --prefix app run typecheck`)가 통과해야 한다.

## 0. PoC 2 · PoC 6 소켓 절반 (게이트)

- `.scratch/poc2-inspect/`: canvas-view PoC 1과 같은 구성(sandbox iframe, 주입 스크립트)에서 design.md 'PoC 의존'의 사례마다 선언 → 토큰 이름을 찾는다. CDN 시트는 실제 외부 CSS 하나로 본다.
- `.scratch/poc6-socket/`: Electron 최소 앱이 소켓과 `runtime.json`을 쓰고, Go 최소 클라이언트가 읽어 `active`를 받는다. 창 숨김, 틀린 토큰, 남은 `runtime.json`(앱 종료 후), 지워진 소켓 파일을 본다.
- 검증: 두 PoC의 결과(통과 여부, 관찰, 날짜, 버전)가 PRODUCT §6 'Results'에 있다. 하나라도 기준을 못 넘으면 멈추고 사용자에게 묻는다.

── commit (`docs(product): PoC 2 and PoC 6 socket results`) ──

## 1. 초안 (Codex, 게이트)

- 전제: 개발용 스킬 `/design-draft`(`.agents/skills/design-draft/`)가 있다. 이 기능과 별개로 먼저 만든다(2026-10-22 사용자).
- `/orchestrate`가 Codex 워커 하나에게 이 task를 넘기고, 워커가 design.md '초안 요청'대로 `/design-draft`로 `design/select-inspect.html`을 그린다(2026-10-22 사용자, Q5). Claude 지휘 세션이 Codex 워커를 부르는 것은 #6에 허용된 모델 경계 넘기다(PRODUCT §7 2026-10-22).
- 사용자가 앱에서 초안을 보고 확정한다. 고칠 점은 지휘 세션이 같은 워커에게 다시 넘긴다(코멘트 UI는 #7이라 아직 대화로 전한다).
- 검증: `go run ./cli/cmd/doan check --json --repo .`에 오류 0(`mock.css`의 `hardcoded_color` 경고만 허용), `go run ./cli/cmd/doan ls --json --repo .`에 `select-inspect` 캔버스와 design.md가 요구한 상태 프레임이 모두 있다.

── commit (`docs(design): select-inspect draft`) ──

## 2. 스키마 · fixture

- `runtime.v1`, `app-socket.v1`을 만들고 comment-event `target`을 `$defs`로 옮긴다. TS(ajv)와 Go(jsonschema v6)가 교차 파일 `$ref`를 읽도록 로더를 맞춘다.
- fixture: 런타임 파일(정상, `v` 2, `protocol` 2, 상대 경로 소켓, 짧은 토큰, 알 수 없는 필드), 요청 · 응답(선택 없음, 프레임만, 요소만, `html` 2,000 코드 포인트 경계, 알 수 없는 필드, 오류 응답).
- 검증: 기존 comment-event fixture가 모두 그대로 통과하고, 새 fixture를 TS와 Go가 같게 판정한다(`go test ./...`, `npm --prefix app test`).

── commit (`feat(schema): runtime file and app socket formats`) ──

## 3. 순수 함수

- design.md '순수 함수로 떼어 낼 부분'의 TS · Go 함수 전부.
- 경계 사례: `elementSelector` 이스케이프와 기준 조상 없음 · `clipHtml` 서로게이트 경계 · `specificity`의 `:is()`/`:where()`/`:not()` · `winningDeclaration`의 `!important` 대 높은 specificity · `tokenOf` 대체값 안 중첩 `var()` · 오래된 `href`의 `select`를 버림 · 선택 요소가 사라진 `layout` · `readRuntime`의 BOM · 빈 파일 · `v` 1.0.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` · `go test ./...` · `go vet ./...` 통과.

── commit (`feat: select-inspect pure helpers`) ──

## 4. CLI `doan active` · MCP `active` · 스킬

- `doan active [--repo] [--json]`, 오류 코드 `app_not_running` · `app_protocol_mismatch` · `project_not_open`(exit 3). 테스트는 가짜 소켓 서버(Go)와 `DOAN_RUNTIME`으로 앱 없이 돈다.
- MCP `active` 도구, 스킬 본문 규칙 C 복원과 표.
- 검증: `go test ./...` · `go vet ./...` 통과. 임시 디렉터리에서 `go run ./cli/cmd/doan active --json --repo <tmp>`가 앱 없이 exit 3 `app_not_running` 봉투를 낸다.

── commit (`feat(cli): doan active and the MCP active tool`) ──

## 5. main — 소켓 · `runtime.json` · 선택 저장소

- 소켓 서버, `runtime.json` 쓰기 · 지우기, 프로젝트별 선택 저장소, IPC `selection:set`(발신 프레임 확인), preload `setSelection`.
- 경계 사례: 틀린 토큰 · 깨진 줄 · 큰 줄(상한) · 알 수 없는 method, 열려 있지 않은 루트, 프로젝트 닫힘 → 선택 삭제, 다른 앱 인스턴스의 `runtime.json`은 지우지 않음, 실제 파일 권한 0600 · 디렉터리 0700(stat으로 확인).
- 검증: `npm --prefix app test` · `typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): runtime file, socket and selection store`) ──

## 6. 캔버스 스크립트

- hover · 클릭 선택(Q1 방식), 앵커, 인스펙터 수집(PoC 2 방식), `layout.selected`, `pick-frame`.
- 검증: `npm --prefix app test`(`vm`으로 스크립트 문자열을 새 컨텍스트에서 실행하는 기존 테스트 포함) 통과.

── commit (`feat(app): selection and inspector values in the canvas script`) ──

## 7. renderer — 오버레이 · 인스펙터 · 사이드바

- 초안대로 hover · 선택 표시와 치수, 패널 인스펙터, 사이드바 선택 표시, Esc로 해제. 접근 이름과 role을 단다(e2e가 그것으로 찾는다).
- 검증: `npm --prefix app test` · `typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): selection marks and inspector panel`) ──

## 8. e2e · 변형 증명

- `app/e2e/runtime.ts`에 단계를 더한다: 배율 0.25 · 1 · 4에서 클릭 선택과 표시 위치(PoC 3 방식, 1px 안), 프레임 선택(목록 · 빈 영역), 다시 불러오기 뒤 선택(Q3), 목록에 없는 문서로 가면 선택 해제, 인스펙터의 토큰 · 하드코딩 · 알 수 없음, 앱이 띄운 상태에서 `doan active --json`이 같은 대상을 돌려줌, 창을 숨긴 뒤에도 돌려줌, 프로젝트를 닫으면 `project_not_open`.
- 변형 증명: 렌더러 `href` 확인, IPC 발신 프레임 확인, main의 selection 스키마 검증, 소켓 토큰 비교, `runtime.json` 권한을 하나씩 빼서 빨개지는 테스트를 적는다. 결과는 승격 때 ARCHITECTURE §3 '변형 증명'에 더한다.
- 검증: `npm --prefix app run e2e` 통과(`/runtime-test`). 기존 단계도 모두 통과한다.

── commit (`test(app): select-inspect runtime steps`) ──

## 9. 실제 에이전트 확인

- AGENTS.md 'Commands'의 일회성 등록으로 Claude Code와 Codex가 `active` 도구를 부른다. 앱을 띄우고 임시 저장소를 열어 요소 하나를 고른 상태에서 실행한다. Codex 호출은 #6에서 모델 경계를 넘어도 된다(PRODUCT §7 2026-10-22).
- 검증: 두 에이전트 모두 고른 요소의 `selector`를 받고, `claude mcp list` · `codex mcp list`가 전후로 같다. 결과를 PRODUCT §6 PoC 6 아래에 적는다.

── commit (`docs(product): active tool checked in real agents`) ──

## 10. `/design-sync`

- `/design-sync design/select-inspect.html`. 대조표가 모두 일치하거나 기록된 차이가 될 때까지 고친다. 측정값은 `docs/DESIGN.md`에 새 절로 적는다.
- 검증: 스킬의 재측정 결과가 불일치 0, 독립 리뷰 지적이 반영됨, `npm --prefix app run e2e` 통과.

── commit (`/design-sync`가 정한 경계) ──

## 11. 승격

- PRODUCT: §5 기능 분할의 #6 완료 표시, §6 PoC 2 · 6 결과(이미 적힌 것 확인), §8의 "렌더 DOM 프레임 대 `doan ls` 프레임" 질문 닫기, §7에 Q1–Q5 결정과 근거 한 줄씩.
- ARCHITECTURE: §3 선택 · 오버레이 · 인스펙터 수집과 메시지, §4 런타임 파일 · 소켓 상세, §5 `active` 도구, §6 규칙 C 복원, §11 새 스키마, §12 `doan active` 결과 · `project_not_open`, §13 `active` 문장 갱신, `docs/DIRECTORY.md`.
- AGENTS.md 'Commands'에 이 기능에서 새로 쓴 명령이 있으면 적는다.
- `docs/features/select-inspect/`를 지운다.
- 검증: `grep -rn "select-inspect" docs/PRODUCT.md docs/ARCHITECTURE.md`로 결정이 옮겨진 것을 확인하고, `docs/features/select-inspect/`가 없다.

── commit (`docs: promote select-inspect`, `docs(feature): remove select-inspect feature docs after promotion`) ──
