# buzz-ds — tasks

`/ship` 또는 `/orchestrate`가 `feat-buzz-ds` 브랜치에서 진행한다. 모든 task는 부모 design의 'Buzz clone 참조 규칙'을 따른다: 시작 전에 `git -C ~/code/buzz-app rev-parse HEAD`로 기준 커밋 `c40dfdf4`를 확인하고, 값과 클래스는 clone의 원본 파일에서 읽는다.

순서: 복사한 CSS와 출처 → 순수 함수 → 토큰 → 공용 컴포넌트 → 문서. `── commit ──`이 커밋 경계다. 공용 컴포넌트의 "Buzz 대조" 방법은 질문 2의 답을 따른다. Buzz 직접 측정이라면 명령은 아직 정하지 않았다(사용자 확인 필요).

### A1. Buzz CSS 복사와 출처 표기
`app/src/renderer/buzz/`에 라이트 토큰·역할, `materials.css`, `typography.css`, 필요한 `components.css` 조각을 복사한다. 다크 블록, Inter·JetBrains Mono, 사용자 액센트 선택을 걷어내고, 파일마다 영어 머리 주석(리포, 커밋 `c40dfdf4`, 원본 경로, Apache-2.0, 수정 내용)을 단다. `LICENSE`와 원본 `NOTICE.md` 사본을 둔다. `index.html`·`settings.html`에서 `<link>`로 싣는다.
- 검증: `npm --prefix app run build` 성공. 개발 렌더러(`npm --prefix app run dev`)와 빌드 결과 모두에서 CSP 경고 없이 Buzz 변수가 `getComputedStyle`로 읽힌다(POSTMORTEM 2026-10-25).

── commit: `chore(app): vendor Buzz design system CSS` ──

### A2. 순수 함수 테스트 (`/tdd`)
`contrastRatio`·쌍 목록, `cssVarUsage`, `tokenAliasDrift`, `nestedRadius`의 테스트를 먼저 쓰고 red를 확인한다.
- 검증: `npm --prefix app test`에서 새 테스트가 red.

### A3. 순수 함수 구현
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

── commit: `test(app): pin Buzz token contrast, usage and drift` / `feat(app): add token checks` ──

### A4. doan 토큰을 라이트로
`app/src/renderer/tokens.css`의 값을 Buzz 라이트 값으로 바꾸고(이름 규칙은 질문 1), `:root { color-scheme: light }`, 파일 머리 주석을 갱신한다. 두 창의 main `backgroundColor`도 라이트 셸 색으로. 질문 1이 "이름 변경"이면 10개 초안의 `var(--*)`도 함께 고친다.
- 검증: `go run ./cli/cmd/doan check --repo .`에서 정의되지 않은 변수 오류 0개, `tokenAliasDrift`·`cssVarUsage` 테스트 green.

### A5. shadcn 테마 연결과 액센트 자리
`styles.css`의 `@theme inline`을 Buzz 역할에 다시 연결한다. `primary`는 무채색 prominent, 오렌지는 선택 상태와 코멘트 핀 역할(`.mark`, `.dims`, 핀, 선택 행)에만 남긴다. 기본 타입을 Buzz 역할로, 포커스 링을 Buzz 레시피로, disabled를 Buzz 역할로, 스크롤바를 `scrollbar-thumb-quiet`로.
- 검증: `npm --prefix app test`(대비 쌍 green), `npm --prefix app run e2e` 최종 PASS.

── commit: `feat(app): switch tokens to Buzz light roles` ──

### A6. 공용 컴포넌트
버튼 변형(prominent/subtle/ghost, `.btn` 계열), `IconButton`, `Panel`(표면만), `.kbd`·`.chip`, 툴팁·메뉴·팝오버의 `floating-surface`와 파생 모서리, 다이얼로그 공용 클래스(크기 단계, 인셋, 헤더·액션 배치, 등장·퇴장 모션), 토스트. 기존 `<dialog>`·Radix·`<button>`에 클래스만 입히고 동작은 바꾸지 않는다. 툴팁 패딩 결정(12/6px, 2026-10-25)과 Buzz 값이 다르면 사용자에게 확인한다.
- 검증: `npm --prefix app run e2e` 최종 PASS(다이얼로그 포커스 복귀·Escape·모달 위 모달 포함, POSTMORTEM 2026-10-24). 캔버스 iframe 위에서 플로팅 표면의 블러가 실제로 보이는지 스크린샷으로 확인. `nestedRadius` 기대값과 실측 일치. Buzz 대조.

── commit: `feat(app): Buzz shared components` ──

### A7. 회귀 고정과 DESIGN.md
e2e에 고정된 이전 색 실측값을 새 값으로 바꾼다. `docs/DESIGN.md` 맨 앞에 디자인 시스템 절(출처, 채택 규칙, doan 조정, 공용 컴포넌트 실측값)을 쓰고, 화면별 절의 다크 색 값에 "buzz-ds 이전" 표시를 단다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs --runtime` 통과.

── commit: `docs(design): add Buzz design system section` ──

### A8. 디자인 시스템 결론 승격
`docs/PRODUCT.md` §7에 공통 결정 7개를 날짜·근거와 함께 기록하고, 2026-10-22 테마 결정과 Sorcerer 레퍼런스가 대체되었다고 적는다. `docs/ARCHITECTURE.md`에 `app/src/renderer/buzz/`의 역할, 출처 표기 규칙, `tokens.css` 제약을 적는다. `docs/DIRECTORY.md`에 새 디렉터리를 추가한다. 그 뒤 `docs/features/buzz-ds/`를 삭제하고, 부모 [`buzz-restyle/tasks.md`](../buzz-restyle/tasks.md)의 `buzz-ds` 줄을 체크한다.
- 검증: 세 문서가 영어이고, §7에 이번 결정 줄이 있으며, `docs/features/buzz-ds/`가 없다.

── commit: `docs(product): adopt Buzz visual language` / `docs(architecture): record vendored Buzz CSS` / `docs(directory): add renderer/buzz` / `docs(feature): remove buzz-ds after promotion` ──
