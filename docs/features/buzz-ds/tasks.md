# buzz-ds — tasks

`/ship` 또는 `/orchestrate`가 `feat-buzz-ds` 브랜치에서 진행한다. 시작과 끝은 부모 design의 '자식 진행 규칙'을 따른다. 모든 task는 'Buzz clone 참조 규칙'을 따른다: 시작 전에 `git -C ~/code/buzz-app rev-parse HEAD`로 기준 커밋 `c40dfdf4`를 확인하고, 값과 클래스는 clone의 원본 파일에서 읽는다(이 명령은 A9에서 AGENTS.md Commands에 추가한다).

순서: 초안 → 복사한 CSS와 출처 → 순수 함수 → 토큰 → 공용 컴포넌트 → 공유 요소 → 문서. `── commit ──`이 커밋 경계다.

### A0. buzz-ds 초안
`/design-draft`로 `design/buzz-ds.html`을 그린다. 공용 컴포넌트(버튼, `IconButton`, `Panel`, 툴팁, 메뉴, 팝오버, 다이얼로그 틀, 토스트, 스피너, 포커스, disabled)와 공유 요소(`ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`, `ErrorDetails`)의 상태별 프레임을 Buzz 값으로 그린다.
- 검증: `go run ./cli/cmd/doan check --repo .`에서 `design/buzz-ds.html` 오류 0개.

── commit: `docs(design): draft buzz-ds component sheet` ──

### A1. Buzz CSS 복사와 출처 표기
`app/src/renderer/buzz/`에 라이트 토큰·역할·citrus family, `materials.css`, `typography.css`, `overlays.css`, `scrollbars.css`, `forms.css`, 필요한 `components.css` 조각을 복사한다. 다크 블록·다른 액센트 family·Inter를 걷어내고, 이름을 `doan-`·`data-ui-`로 바꾸고, Base UI 상태 속성을 Radix `data-state`/`<dialog>[open]`으로, 키보드 게이트를 `:focus-visible`로 바꾼다. 파일마다 `/*! */` 출처 주석을 단다. `LICENSE`와 원본 `NOTICE.md` 사본을 둔다. `styles.css`에서 CSS `@import`로 싣는다.
- 검증: `npm --prefix app run build` 성공. 개발 렌더러(`npm --prefix app run dev`)와 빌드 결과 모두에서 CSP 경고 없이 Buzz 변수가 `getComputedStyle`로 읽힌다(POSTMORTEM 2026-10-25). `grep -rnE '\bbuzz-|data-buzz-' app/src/renderer`가 출처 주석 말고는 없다.

── commit: `chore(app): vendor Buzz design system CSS` ──

### A2. 순수 함수 테스트 (`/tdd`)
`contrastRatio`·쌍 목록(citrus 쌍 포함), `cssVarUsage`, `tokenAliasDrift`, `nestedRadius`의 테스트를 먼저 쓰고 red를 확인한다.
- 검증: `npm --prefix app test`에서 새 테스트가 red.

### A3. 순수 함수 구현
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

── commit: `test(app): pin Buzz token contrast, usage and drift` / `feat(app): add token checks` ──

### A4. doan 토큰을 라이트로
`app/src/renderer/tokens.css`의 값을 Buzz 라이트 값으로 바꾸고(이름 규칙은 질문 1), `color-scheme: light`, 파일 머리 주석을 갱신한다. 두 창의 main `backgroundColor`도 라이트 셸 색으로.
- 검증: `go run ./cli/cmd/doan check --repo .`에서 정의되지 않은 변수 오류 0개(기존 초안 12개 포함), `tokenAliasDrift`·`cssVarUsage` 테스트 green.

### A5. shadcn 테마 연결과 오렌지 대응
`styles.css`의 `@theme inline`을 Buzz 역할에 다시 연결한다. 오렌지를 쓰는 모든 규칙을 design.md의 대응표대로 옮긴다. 기본 타입을 Buzz 역할로, 포커스 링을 Buzz 레시피(`:focus-visible`)로, disabled를 Buzz 역할로, 스크롤바를 `scrollbar-thumb-quiet`로. 모달 scrim을 `--board-bg`에서 떼어 Buzz 값으로.
- 검증: `npm --prefix app test`(대비 쌍 green), `grep -n '#f0773a\|--accent-line\|--accent-soft' app/src/renderer/*.css` 결과 없음, `npm --prefix app run e2e` 최종 PASS.

── commit: `feat(app): switch tokens to Buzz light roles` ──

### A6. 공용 컴포넌트
버튼 변형(prominent/subtle/ghost, `.btn` 계열), `IconButton`, `Panel`(표면만), `.kbd`·`.chip`, Buzz 툴팁, 메뉴·팝오버의 `floating-surface`와 파생 모서리, 다이얼로그 틀(크기 단계, 안쪽 패딩, 헤더·액션 배치, 등장·퇴장 모션, reduced-motion), 토스트, 스피너. 기존 `<dialog>`·Radix·`<button>`에 클래스만 입히고 동작은 바꾸지 않는다.
- 검증: `npm --prefix app run e2e` 최종 PASS(다이얼로그 포커스 복귀·Escape·모달 위 모달 포함, POSTMORTEM 2026-10-24). 캔버스 iframe 위에서 플로팅 표면의 블러가 보이는지 스크린샷으로 확인. `nestedRadius` 기대값과 실측 일치. `/design-sync`로 `design/buzz-ds.html`의 공용 컴포넌트 프레임과 일치.

── commit: `feat(app): Buzz shared components` ──

### A7. 공유 요소
`ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`(`connectionRows.css`), `.ob-dialog`, `ErrorDetails`, `Toast`를 Buzz 규칙으로 바꾼다. 내용과 동작은 그대로다.
- 검증: `npm --prefix app run e2e` 최종 PASS(넘치는 목록의 네이티브 스크롤 도달 포함, POSTMORTEM projects-home). `/design-sync`로 `design/buzz-ds.html`의 공유 요소 프레임과 일치.

── commit: `feat(app): Buzz shared surfaces` ──

### A8. 라이선스 패키징, 회귀 고정, DESIGN.md
패키징된 앱에 `LICENSE`·`NOTICE.md`를 넣는다(질문 2). e2e에 고정된 이전 색 실측값을 새 값으로 바꾼다. `docs/DESIGN.md` 맨 앞에 디자인 시스템 절을 쓰고, 화면별 절의 다크 색 값에 "buzz-ds 이전" 표시를 단다. 'UX audit recovery update' 절은 다시 측정해서 표시 없이 갱신한다.
- 검증: `npm --prefix app run package` 후 `app/dist/mac-arm64/doan.app` 안에 두 파일이 있다. `node .agents/skills/verify/scripts/verify.mjs --runtime` 통과.

── commit: `build(app): ship Buzz license notices` / `docs(design): add Buzz design system section` ──

### A9. 결론 승격
- `docs/PRODUCT.md` §7에 부모 공통 결정을 날짜·근거와 함께 기록하고, 2026-10-22 테마 결정·Sorcerer 레퍼런스와 2026-10-25 공유 툴팁 패딩 결정이 대체되었다고 적는다. §5 feature 목록에 `buzz-restyle`과 자식 10개를 추가한다.
- `docs/ARCHITECTURE.md`에 `app/src/renderer/buzz/`의 역할, 출처 표기·라이선스 규칙, CSS `@import` 방식, `tokens.css` 제약, `data-ui-*` 속성 규칙을 적는다.
- `docs/DIRECTORY.md`에 새 디렉터리를 추가한다.
- AGENTS.md Commands에 `git -C ~/code/buzz-app rev-parse HEAD`와 `git -C ~/code/buzz-app show <sha>:<path>`(읽기 전용 Buzz 참조)를 추가한다.
- 그 뒤 `docs/features/buzz-ds/`를 삭제한다. 부모 디렉터리와 부모 tasks의 체크는 건드리지 않는다(다음 자식을 시작하는 세션이 체크한다).
- 검증: 문서들이 영어이고, §7에 이번 결정 줄이 있으며, `docs/features/buzz-ds/`가 없다.

── commit: `docs(product): adopt Buzz visual language` / `docs(architecture): record vendored Buzz CSS` / `docs(directory): add renderer/buzz` / `docs(agents): add Buzz reference commands` / `docs(feature): remove buzz-ds after promotion` ──
