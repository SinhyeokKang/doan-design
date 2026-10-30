# buzz-search — tasks

순서: 초안 → 순수 함수 → 마크업 → CSS → 대조 → 승격. 포맷 변경이 없어 schema·fixture 단계는 없다. 진행 경로는 `/ship`이다(한 화면, 렌더러만). 아래 T 번호는 design.md '순수 함수' 번호와 함께 적는다.

## D. 초안 (`/design-draft`, 구현 전)

- [x] D1. `.doan/canvases/buzz-search.html`에 Quick Open 초안을 새 파일로 그렸다. 프레임은 design.md '초안'의 열 개다. 10차를 사용자가 확정했다(2026-10-30, `c56a544f`, 기록 `df23dd4f`). feature-review 반영 11차는 마크업만 바꿨다(그룹 제목 `div`, 목록 `tabindex`·`overscroll-behavior`).
  - 검증: `go run ./cli/cmd/doan check --json --repo .`에 이 파일의 오류가 없고 `go run ./cli/cmd/doan ls --json --repo .`의 `buzz-search` 프레임 id가 design.md '초안'의 열 개와 같다.

── commit: `docs(design): buzz-search draft` / `docs(design): buzz-search draft revision` (완료) ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `matchPositions`·`markRuns`(design 1·2) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 접두어·단어 시작·부분 문자열, 여러 토큰, 겹치는 토큰("card ca"), 대소문자, 한 토큰은 이름·다른 토큰은 경로에서만 맞는 경우(이름 토큰만 위치), 제목 없는 프레임의 id 이름, NFC 입력과 NFD 이름(빈 배열), NFD 입력과 NFC 이름, "İ"처럼 소문자화로 길이가 바뀌는 이름(빈 배열), 이모지가 든 이름(코드포인트 단위), 빈 검색어.
  - 검증: `npm --prefix app test` 통과(새 테스트가 구현 전 red였음을 기록).
- [ ] T2. `searchMatch` 확장·`countMatches`·`emptyText`(design 3·4·5) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례:
  - 상한 전 거르기: 다른 종류가 50개를 넘는 인덱스에서 종류 탭이 비지 않음, 탭별 순위 유지.
  - 빈 검색어 Frames: 워크스페이스에서 열린 캔버스 먼저(`rendered`가 static과 다를 때, 빈 `rendered` 포함), Home은 저장 순서이고 `rendered`가 있어도 우선 없음, 범위, 50개.
  - 같은 경로의 캔버스가 다른 워크트리에 있을 때 열린 캔버스는 root까지 맞는 쪽만.
  - `countMatches`: 0·1·2·50·51개.
  - `emptyText`: 다른 종류 0개(덧붙임 없음), "1 canvas matches", "2 frames match", "50+ frames match", 모든 종류 0개(All 문구), 읽는 중·사용할 수 없음이 "No frames to show"보다 먼저, entries가 `[]`.
  - 성능: `quickOpen.test.ts`의 50ms 테스트를 종류 필터와 `countMatches`까지 포함하도록 넓힌다.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록). 기존 `quickOpen.test.ts` 순위 단언은 수정 없이 통과(새 인자는 기본값이 있는 선택 인자).
- [ ] T3. `groupResults`·`resultKey`(design 6·7) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 다른 root의 정확한 일치가 현재 root보다 먼저인 경우, 같은 점수의 근접도 순서, 근접도까지 같은 두 '다른 저장소' root(처음 나온 순서), 빈 검색어의 저장 순서, 그룹 안 순서 보존, git 밖 같은 이름 폴더 둘(`/a/design`, `/b/design`)이 따로 묶이고 제목 id가 다름, 같은 캔버스의 프레임 키가 frameIndex까지 구분됨.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T4. `outsideDialog`(design 8) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 둘 다 안, 둘 다 밖(네 방향), 안에서 누르고 밖에서 뗌, 밖에서 누르고 안에서 뗌, 경계선 위, 주 버튼이 아닌 버튼.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).

── commit: `feat(app): Quick Open match positions, kind filter, groups and outside test` ──

## U. 마크업과 CSS

- [ ] U1. `QuickOpenDialog.tsx`를 새 구성으로 바꾼다.
  - `doan-dialog qo` 클래스와 `data-ui-presentation="search"`(`qo`는 `App.tsx:599`가 쓰므로 유지).
  - 글리프·안내줄·`esc` 칩 제거, 공용 `.doan-input`과 돋보기.
  - 필터 탭(Home 그룹 탭의 `tabKey` 재사용, 탭에서 ↓는 입력으로, Tab 정지점은 입력과 탭 목록).
  - `projectWhere`가 `{ name, title }`을 돌려주게 넓히고, 프로젝트 그룹과 썸네일 제목(`div`, root 기반 id).
  - `resultParts` 새 모양(design 7)으로 두 줄 행, lucide 아이콘, `<mark>` 밑줄, 줄인 이름·경로의 `title`, option `aria-label`=`accessibleName`.
  - 활성 행은 결과 키로 기억, option id는 결과 키 기반, 검색어·탭 변경 때 첫 행 활성과 `scrollTop = 0`.
  - 목록 `tabIndex={-1}`.
  - `<dialog>` `mousedown`에서 입력이 아니면 `preventDefault()`, 탭 클릭 뒤 입력 `focus()`.
  - `outsideDialog`를 쓴 바깥 클릭 닫기(`dismiss()` 경로).
  - 역할·이름·키 처리·포커스 복귀 순서는 그대로다.
  - 검증: `npm --prefix app test`에서 `QuickOpenDialog.test.tsx`의 역할·이름·키·빈 상태 문구 단언이 통과한다. 바꾸는 단언은 안내줄(있음 → 없음), 'result rows'(`resultParts` 새 모양), 행·빈 상태 마크업뿐이다. 새 단언: `.qo-foot`·`esc` 칩 없음, tablist·`aria-selected`, `role="group"`과 제목, 두 번째 그룹 첫 행의 id와 `aria-activedescendant`가 화면 순서를 따름, entries를 바꾼 뒤 활성 행이 같은 결과에 남음. `npm --prefix app run typecheck` 통과.
- [ ] U2. `ds/surfaces.css`에 `.doan-dialog[data-ui-presentation="search"]` 변형을 더하고, `styles.css`의 `.qo*` 규칙을 design.md '화면 구성'의 값으로 대체한다(목록 높이는 `min(55dvh, 576px, 남은 높이)`와 최소 400px, `overscroll-behavior: contain`). `.qo`·`.qo::backdrop`의 표면 규칙과 `.qo-foot` 규칙은 지운다.
  - 검증: `grep -n 'data-ui-presentation="search"' app/src/renderer/ds/surfaces.css`에 규칙이 있다. `grep -nE '^\.qo[^{]*\{[^}]*(12\.5|11\.5|10\.5)px|\.qo-foot|^\.qo(::backdrop)? \{' app/src/renderer/styles.css` 결과 없음. `npm --prefix app test`(`ds/checks.test.ts` 포함)와 `npm --prefix app run build` 통과.

── commit: `feat(app): restyle Quick Open as a search palette` ──

## S. 대조와 실제 앱 확인

- [ ] S0. 기준값: main 빌드에서 Add Projects 다이얼로그 표면의 width, top, padding, border-radius, background, border, box-shadow를 잰다(S2 비교용). `/design-sync` 측정 스크립트에 함께 둔다.
  - 검증: `node .scratch/design-sync/buzz-search/measure.mjs`가 기준값 파일을 남긴다.
- [ ] S1. `/design-sync`로 초안과 구현을 computed style로 맞춘다. 프로덕션 빌드는 측정 스크립트로 열 프레임을 모두 잰다. 개발 빌드는 AGENTS의 `DOAN_CLI=… npm --prefix app run dev -- -- --user-data-dir=<tmp>`로 열어 행 `min-height`, 입력 배경·높이, `mark`의 `text-decoration`, `corner-shape`를 확인한다. DESIGN.md가 측정하지 않은 항목으로 남긴 긴 값(긴 이름, 긴 경로, 긴 그룹 제목의 줄임)도 측정한다. 남는 차이는 근거와 함께 DESIGN.md에 적는다.
  - 검증: `node .scratch/design-sync/buzz-search/measure.mjs` 결과에 기록되지 않은 차이가 없다.
- [ ] S2. `/runtime-test`로 바뀐 동작만 짧게 확인한다.
  - Cmd+K → 입력 → Enter로 다른 프로젝트 캔버스가 열림. 그룹 경계를 ↓로 넘은 뒤 Enter로 강조된 행이 열림. 같은 캔버스 프레임 jump.
  - 탭: 클릭 뒤 입력 포커스 유지, ←/→, 탭에서 ↓로 입력 복귀, Tab 순환(입력 ↔ 탭 목록, 목록은 정지점 아님).
  - 다이얼로그 패딩·그룹 제목·빈 상태 문구 클릭 뒤 입력 포커스 유지.
  - 바깥 클릭: 헤더 아래 backdrop 클릭으로 닫히고 연 곳으로 포커스 복귀. 안에서 누르고 밖에서 뗀 경우와 밖에서 누르고 안에서 뗀 경우는 열려 있음. 헤더 띠 위 클릭은 열려 있음.
  - 50개 결과 끝까지 스크롤. 600px 창에서 다이얼로그가 스크롤되지 않음(`scrollHeight === clientHeight`).
  - 접근성 트리: dialog, combobox, tablist, listbox 안 group과 option 이름.
  - Add Projects 표면 속성이 S0 기준값과 같음.
  - Escape 포커스 복귀와 IME 조합 중 키 무시는 U1이 `onKeyDown`이나 `dismiss`를 바꿀 때만 확인한다. IME는 합성 이벤트로만 확인하고 네이티브 IME는 미확인으로 기록한다.
  - 검증: `/runtime-test`의 probe가 완료 표시와 함께 exit 0이고 스크린샷을 남긴다. probe 위치는 `.scratch/runtime-test/buzz-search/`이다(명령 미정 — 사용자 확인 필요. AGENTS 'Commands'에 runtime-test probe 명령이 없다).
- [ ] S3. DESIGN.md 'Design navigation' 절의 Quick Open 부분을 새 측정값으로 바꾼다: 외형 행, 접근성 행(group·tablist 추가), 'Top layer'(64px, 좌우 339px → 새 위치), 측정하지 않은 항목의 Quick Open 긴 값. 그 절 "buzz-ds 이전" 표시의 담당 문장에서 buzz-search를 뺀다. 새 사용자 문구(탭별 빈 문구, 덧붙임)를 'Terms against onboarding and Quick Open'에 적는다.
  - 검증: `grep -n '^> buzz-ds 이전.*buzz-search' docs/DESIGN.md` 결과 없음. `grep -n 'No frames match' docs/DESIGN.md`에 줄이 있다.

── commit: `fix(app): align Quick Open with its draft` / `docs(design): record buzz-search measurements` ──

## Z. 승격과 정리

- [ ] Z1. `node .agents/skills/verify/scripts/verify.mjs` 통과.
  - 검증: exit 0, 로그는 `.scratch/verify/`.
- [ ] Z2. PRODUCT §8 후속 추가: Home에서 일부 프로젝트를 읽는 중이면 Quick Open 결과가 빠진 사실을 알리지 않는다(2026-10-30 critique, 기존 동작). 읽는 중 문구 "Try again shortly."가 목록이 실시간으로 채워지는 동작과 어긋난다는 점도 함께 적는다.
  - 검증: `awk 'NR>=922' docs/PRODUCT.md | grep -n 'still being read'`에 새 줄이 있다(§8은 922행부터, 2026-10-30 기준).
- [ ] Z3. 결론 승격.
  - PRODUCT §5 항목 1 Quick Open 문단(`PRODUCT.md:153`): 바깥 클릭 닫기(헤더 띠 제외), 필터 탭(종류 필터, 빈 검색어 Frames 규칙과 Home의 앞 50개, 탭별 빈 문구와 덧붙임), 프로젝트 그룹(처음 나온 순서 = 최고 일치 순), 활성 행 결과 키 유지.
  - PRODUCT §7에 buzz-search 줄: Buzz 기준 커밋 `c40dfdf4`와 참고 파일, 조정 항목, 공통 결정 10에 따른 `.doan-dialog` 검색 변형. 2026-10-25 'Quick Open footer' 행(`PRODUCT.md:780`)에 "(superseded 2026-10-30 by buzz-search …)" 표시를 붙인다(`PRODUCT.md:653`의 형식).
  - ARCHITECTURE §7 'Quick Open' 줄(`ARCHITECTURE.md:415`): 종류 필터·`countMatches`, 빈 검색어 Frames, 그룹, 맞은 글자 위치, 결과 키, 바깥 클릭, `.doan-dialog` 검색 변형.
  - 부모 spec 공통 결정 10(`docs/features/buzz-restyle/spec.md:39`)에 검색 변형을 한 줄 더한다(feature-review, 공통 결정 14). 부모 tasks의 C4 체크는 병합 뒤 다음 자식 시작 때 한다(부모 '자식 진행 규칙' 1).
  - 검증: `grep -n '^| 2026-10-30 | buzz-search' docs/PRODUCT.md`에 §7 줄이 있다. `grep -n 'superseded 2026-10-30 by buzz-search' docs/PRODUCT.md`에 780행 쪽 줄이 있다. `grep -n 'Frames tab' docs/PRODUCT.md docs/ARCHITECTURE.md`에 §5와 §7 'Quick Open' 줄이 있다. `grep -n 'presentation' docs/features/buzz-restyle/spec.md`에 공통 결정 10 줄이 있다.
- [ ] Z4. `docs/features/buzz-search/`를 지운다.
  - 검증: `ls docs/features/buzz-search` 실패.

── commit: `docs(product): promote buzz-search` / `docs(architecture): promote buzz-search` / `docs(feature): complete buzz-search` ──
