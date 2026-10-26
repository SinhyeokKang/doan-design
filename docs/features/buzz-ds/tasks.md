# buzz-ds — tasks

**선행 조건**: 부모 [`buzz-restyle/tasks.md`](../buzz-restyle/tasks.md)의 H1~H3이 체크되어 있어야 시작한다(부모 feature 정의, `/design-draft`·`/design-sync` 확장, Buzz 참조 명령).

**진행**: `/orchestrate`로 아래 네 단계를 하나씩 진행한다(2026-10-26 user, 처음 계획은 `/ship bypass`였다). 단계마다 워커 하나가 `/ship bypass` 방식으로 맡고, batch 표와 결정은 [orch.md](./orch.md)에 있다. `feat-buzz-ds` 브랜치에서 시작해 S4 뒤 push와 PR로 끝난다.
- S1 = A1~A4 (테스트, 토큰, 디자인 시스템 CSS)
- S2 = A5 (초안. 사용자가 초안을 확인할 때까지 멈춘다)
- S3 = A6~A8 (대응표, 공용 컴포넌트, 공유 요소)
- S4 = A9~A10 (DESIGN.md, 결론 승격)

**공통**: 시작 전에 부모 design 'Buzz clone 참조 규칙'대로 `git -C ~/code/buzz-app rev-parse HEAD`로 기준 커밋 `c40dfdf4`를 확인한다. clone이 없으면 멈추고 사용자에게 묻는다. HEAD가 다르면 `git -C ~/code/buzz-app show c40dfdf4:<경로>`로 읽는다. 값과 규칙은 clone에서 읽고, 코드는 doan이 새로 쓴다(design.md '작성 방식'). 각 task는 자기 변경이 움직이는 e2e 고정값을 그 task 안에서 갱신한다(`grep -rn` over `app/e2e/*.ts`, 부모 design '자식 진행 규칙' 4).

## S1

### A1. 순수 함수 테스트 (`/tdd`)
`contrastPairs`, `cssVarUsage`, `legacyAliases`, `accentPlaces`, `nestedRadius`의 테스트를 쓴다. 각 함수는 픽스처 입력 테스트와 실제 리포 파일 테스트를 함께 둔다. 실제 파일 테스트는 A3~A6이 끝나야 green이 되므로 `it.todo` 대신 별도 `describe`로 두고, A1에서는 두 종류 모두 red를 확인한다.
- 검증: `npm --prefix app test`에서 새 테스트가 red.

### A2. 순수 함수 구현 (`/implement`)
- 검증: `npm --prefix app test`에서 픽스처 테스트 green(실제 파일 테스트는 아직 red), `npm --prefix app run typecheck` 통과.

── commit: `test(app): pin design system checks` / `feat(app): add design system checks` ──

### A3. 토큰
`tokens.css`를 design.md '토큰'대로 다시 쓴다(팔레트 → 역할 → 기존 이름 별칭, 머리 주석). main에 `nativeTheme.themeSource = "light"`와 두 창의 `backgroundColor`를 넣고 테스트로 고정한다. `color-scheme: dark`를 쓰는 곳(`styles.css:26`, `settings.css:3`, `.cl` `styles.css:387`)을 light로 바꾼다. 바뀐 `color-scheme` 검사(`app/e2e/presentation.ts:150-175` 등)를 갱신한다.
- 검증: `go run ./cli/cmd/doan check --repo .`에서 정의되지 않은 변수 오류 0개(기존 초안 12개 포함). `legacyAliases` 실제 파일 테스트 green. `npm --prefix app test`, `npm --prefix app run e2e` 최종 PASS. macOS 다크 외형에서 캔버스 iframe의 `prefers-color-scheme`이 light인지 e2e(`page.emulateMedia({ colorScheme: "dark" })` 아래에서 iframe 매치 확인)로 확인.

### A4. 디자인 시스템 CSS
`app/src/renderer/ds/`에 공용 CSS를 새로 쓰고 `styles.css`와 `settings.css`에서 CSS `@import`로 싣는다. `@theme inline`을 새 역할에 연결한다(design.md). 아직 화면 규칙은 옮기지 않는다.
- 검증: `npm --prefix app run build` 성공. `cssVarUsage` 실제 파일 테스트 green. 개발 렌더러의 CSS 확인은 `DOAN_CLI=<abs> npm --prefix app run dev -- -- --user-data-dir=<tmp>` 실행에 붙인 `.scratch/buzz-ds/dev-css.mjs`(Playwright `_electron`, 메인 창과 Settings 창에서 대표 요소의 computed style과 CSP 콘솔 경고 확인)로 한다. 이 스크립트 형식은 AGENTS.md Commands의 `/design-sync` 측정 스크립트와 같다. 프로덕션은 `npm --prefix app run e2e`가 확인한다. POSTMORTEM 2026-10-25의 `rg -n 'import.*\.css|rel="stylesheet"' app/src/renderer`로 JS CSS import가 없는지 확인.

── commit: `feat(app): rewrite tokens on light roles` / `feat(app): add design system stylesheet` ──

## S2

### A5. 초안 (`/design-draft`)
design.md '초안 요청'대로 `design/buzz-ds.html`을 그린다. 그린 뒤 사용자 확인을 기다린다.
- 검증: `go run ./cli/cmd/doan check --repo .`에서 `design/buzz-ds.html` 오류 0개. `go run ./cli/cmd/doan ls --json --repo .`의 `buzz-ds` 프레임 id가 '초안 요청' 목록과 같다.

── commit: `docs(design): draft buzz-ds sheet` ──

## S3

### A6. 셀렉터 대응표 적용
design.md '셀렉터 대응표'의 모든 줄을 옮긴다(citrus, 무채색, opacity, scrim). 코멘트 저장 버튼 두 곳에 `submit` modifier를 붙인다. 바뀐 e2e 고정값(disabled `opacity 0.4`: `app/e2e/presentation.ts:66`, `app/e2e/runtime.ts:331-332`; 충돌 규칙 색 `app/e2e/comments-ui.ts:683` 등)을 갱신한다.
- 검증: `grep -rniE '#f0773a|#3a2117|#1a0b03' app/src` 결과 없음. 기존 이름 별칭 grep(spec 완료 조건) 결과 없음. `accentPlaces`, `contrastPairs` 실제 파일 테스트 green. `npm --prefix app run e2e` 최종 PASS.

── commit: `feat(app): map accents to light roles` ──

### A7. 공용 컴포넌트
버튼 변형, `IconButton`(기존 아이콘 버튼에 적용: 상단 바, 줌·프레임 컨트롤 등), `Panel`(정의만), `.kbd`·`.chip`, 툴팁, 메뉴·팝오버, 다이얼로그 틀, 토스트, 스피너, 폼 컨트롤. 기존 `<dialog>`·Radix·`<button>`에 클래스만 입히고 동작은 바꾸지 않는다. 남은 툴팁 패딩 규칙을 지운다. 바뀐 e2e 고정값(`.kbd` opacity `app/e2e/projects-home.ts:86` 등)을 갱신한다. reduced-motion e2e 단계와 모달 위 모달 단계(Add Projects → Project Setup)를 추가한다.
- 검증: `npm --prefix app run e2e` 최종 PASS. 그 안에서 `page.emulateMedia({ reducedMotion: "reduce" })` 아래 다이얼로그 열고 닫을 때 transform이 없고(기존 패턴 `app/e2e/runtime.ts:1747`), 모달 위 모달에서 포커스가 돌아오며, 캔버스 위 메뉴의 computed `backdrop-filter`가 `none`이 아니다. `nestedRadius` 기대값과 메뉴 행 실측 일치. 그다음 `/design-sync`로 `design/buzz-ds.html`의 공용 컴포넌트 프레임과 맞춘다(구현 커밋 뒤 깨끗한 트리에서, design-sync가 만드는 커밋은 이 task에 속한다).

── commit: `feat(app): restyle shared components` (+ `/design-sync` 커밋) ──

### A8. 공유 요소
`ProjectSetupDialog`, `AddProjectsDialog`, `FirstPrompt`, `ConnectionRows`, `.ob-dialog`, `ErrorDetails`, 스피너를 새 공용 스타일로 바꾼다(토스트는 A7). 내용과 동작은 그대로다.
- 검증: `npm --prefix app run e2e` 최종 PASS(넘치는 목록의 네이티브 스크롤 도달 포함, POSTMORTEM projects-home). 그다음 `/design-sync`로 `design/buzz-ds.html`의 `shared-*` 프레임과 맞춘다.

── commit: `feat(app): restyle shared surfaces` (+ `/design-sync` 커밋) ──

## S4

### A9. DESIGN.md
`/design-sync`가 A7·A8에서 쓴 측정값을 바탕으로 `docs/DESIGN.md` 맨 앞 디자인 시스템 절을 정리한다(레퍼런스 사실과 기준 커밋, 채택 규칙, doan 조정, 의도한 예외: 치수 라벨과 툴팁이 같은 캡슐, 사이드바 hover가 옅음, `.drop .scrim` 값). 화면별 절의 다크 색 값에 "buzz-ds 이전" 표시를 단다. 'UX audit recovery update' 절은 다시 측정해서 표시 없이 갱신한다.
- 검증: `grep -c 'buzz-ds 이전' docs/DESIGN.md`가 0보다 크고, 디자인 시스템 절이 문서 맨 앞에 있다. `node .agents/skills/verify/scripts/verify.mjs --runtime` 통과.

── commit: `docs(design): add design system section` ──

### A10. 결론 승격
- `docs/PRODUCT.md` §7에 부모 공통 결정과 buzz-ds 결정(design.md '결정 영향')을 날짜·근거와 함께 기록한다. 2026-10-22 테마 결정·Sorcerer 레퍼런스와 2026-10-25 공유 툴팁 패딩 결정이 대체되었다고 적고, §8의 툴팁 패딩 항목(PRODUCT.md:711)을 갱신한다. §5 feature 목록에 `buzz-restyle`과 자식 10개를 추가한다.
- `docs/ARCHITECTURE.md`에 `tokens.css` 구조(팔레트 → 역할 → 별칭)와 제약, `app/src/renderer/ds/`의 역할, CSS `@import` 방식, `data-ui-*` 속성 규칙, `themeSource` light를 적는다.
- `docs/DIRECTORY.md`에 `app/src/renderer/ds/`를 추가한다.
- 그 뒤 `docs/features/buzz-ds/`를 삭제한다. 부모 디렉터리와 부모 tasks의 체크는 건드리지 않는다(다음 자식을 시작하는 세션이 체크한다).
- 검증: `grep -n 'buzz-restyle' docs/PRODUCT.md`에 §5와 §7 줄이 있고, `grep -n 'renderer/ds' docs/ARCHITECTURE.md docs/DIRECTORY.md`에 줄이 있으며, `test ! -d docs/features/buzz-ds`가 통과한다.

── commit: `docs(product): adopt the light design system` / `docs(architecture): record design system structure` / `docs(directory): add renderer/ds` / `docs(feature): remove buzz-ds after promotion` ──
