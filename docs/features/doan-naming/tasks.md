# doan-naming — tasks

순서는 분류기·fixture → 전수조사 → 일괄 변경(앱 → 패키지 → CLI·가이드 → 문서) → 실제 앱·agent-eval → 승격이다. `/ship bypass`로 진행한다(사용자 결정 2026-10-30).

## A. 분류기와 회귀 검사 (`/tdd` → `/implement`)

- [ ] A1. 공유 fixture `schema/fixtures/brand/cases.json`(prose·command·path·identifier 사례, `Doan`과 `doan` 모두)와 TS `brandCandidates`, Go 테스트 헬퍼 `brandCandidates`. 둘이 같은 fixture를 읽는다(design §2).
  - 검증: `npm --prefix app test`, `go test ./...`에서 분류기 테스트 통과(fixture 모든 사례 일치).
- [ ] A2. 회귀 검사 테스트: 앱 renderer·main 문자열 리터럴과 CLI 메시지·가이드에서 prose `doan` 0건(design §3). 이 단계에서는 빨강이 정상이다.
  - 검증: `npm --prefix app test`, `go test ./...`에서 새 검사가 현재 위반 목록과 함께 실패(red 확인).

── commit: `test: pin the Doan product name in human-facing text` ──

## S. 전수조사

- [ ] S1. `.scratch/doan-naming/survey.mjs`로 저장소 전체(앱, CLI, MCP 설명, 가이드·스텁, eval, `app/runtime/`, AGENTS.md, README, `docs/`, `.doan/canvases/`)를 분류해 `docs/features/doan-naming/survey.md`에 후보 표를 쓴다: 파일·줄·현재 문구·분류·바꿈/둠·이유. `doan.app`·`Contents/MacOS/doan` 경로 사용처를 따로 묶는다. 둠 줄은 모두 이유가 있다.
  - 검증: survey 표의 바꿈 줄 수와 A2의 위반 목록이 일치하고(앱·CLI), 둠 줄에 이유가 비어 있지 않음.

── commit: `docs(feature): doan-naming survey` ──

## B. 일괄 변경

- [ ] B1. 앱 renderer·main 문구(온보딩 Welcome 포함)와 그 테스트 기대값.
  - 검증: `npm --prefix app test`(A2 앱 검사 통과 포함), `npm --prefix app run typecheck` 통과.
- [ ] B2. 번들 이름: `app/package.json` `productName`·`build.productName` → `Doan`(메뉴 막대·About 이름도 'Doan'), `app.setName("doan")` 유지. About에 정식 이름을 새로 넣지 않는다. 실행 파일 경로를 쓰는 곳(`app/runtime/`, eval 러너, 테스트) 갱신.
  - 검증: `npm --prefix app run package`가 `app/dist/mac-arm64/Doan.app`을 만들고, `node --test 'app/runtime/*.test.ts'`와 `npm --prefix app test` 통과.
- [ ] B3. CLI 메시지·`nextSteps`·`--help`, MCP 도구 설명, 가이드 `skill.md`, 스킬 스텁, 공유 fixture의 문구.
  - 검증: `go test ./...`(A2 Go 검사, 출력 예산 `TestSkillGuideFitsToolOutputCap` 포함), `go vet ./...`, `npm --prefix app test` 통과.

── commit: `feat: use Doan as the product name in human-facing text` (B1·B3), `build(app): ship the app bundle as Doan.app` (B2) ──

- [ ] B4. 문서: AGENTS.md(번들 경로 명령 `app/dist/mac-arm64/Doan.app/Contents/MacOS/Doan`), README, `docs/*.md`의 산문 표기. 과거 기록(결정 로그의 옛 줄, POSTMORTEM 증상 인용, USABILITY-EVAL 라운드 기록)은 그대로 둔다.
  - 검증: survey의 문서 바꿈 줄이 모두 반영됨을 `rg -n '\bdoan\b' AGENTS.md README.md docs/` 결과와 대조.

── commit: 문서마다 `docs(<scope>): use Doan as the product name` ──

## V. 실제 앱과 agent-eval

- [ ] V1. `/runtime-test`: 패키지 앱(`Doan.app`)을 격리 환경으로 띄워 메뉴 막대·About 앱 이름 'Doan', 창 제목 'Doan Design'(기존 그대로), 온보딩 Welcome과 홈 문구, userData가 임시 경로 안 `doan` 규칙을 따름, Settings > Connections의 CLI 링크 진단이 `Doan.app` 경로를 정상으로 봄.
  - 검증: 스크린샷과 결과를 `.scratch/runtime-test/doan-naming/`에 남기고 PRODUCT §6에 기록.
- [ ] V2. `node .agents/skills/verify/scripts/verify.mjs --eval`(eval 러너가 바뀌었으면 `--eval`) 통과. `npm --prefix app run package` 뒤 `/agent-eval` 전체 라운드(실제 모델 사용, 2026-10-30 사용자 허락), 결과를 `docs/USABILITY-EVAL.md`에 기록.
  - 검증: verify PASS, eval 라운드 기록 커밋.

── commit: `docs(product): record doan-naming runtime results`, `docs(eval): record doan-naming agent-eval round` ──

## Z. 승격과 정리

- [ ] Z1. PRODUCT §7에 표기 결정(2026-10-30 user: `doan`→`Doan`, 정식 이름은 이미 쓰던 곳만 `Doan Design`; 근거: 섞인 표기 정리), ARCHITECTURE §7 'app name'에 번들 이름 `Doan.app`·실행 파일 경로·표시 이름 규칙, §6 가이드 예산 문단의 번들 경로, DIRECTORY.md에 새 fixture·검사 파일.
  - 검증: `grep -n 'Doan.app' docs/ARCHITECTURE.md AGENTS.md`, `grep -n 'doan-naming' docs/PRODUCT.md`가 결과를 보이고, `grep -n 'doan\.app' docs/ARCHITECTURE.md AGENTS.md` 결과 없음.
- [ ] Z2. `docs/features/doan-naming/`를 지운다.
  - 검증: 디렉터리 없음.

── commit: `docs(product): promote doan-naming` / `docs(architecture): promote doan-naming` / `docs(directory): add doan-naming files` / `docs(feature): complete doan-naming` ──
