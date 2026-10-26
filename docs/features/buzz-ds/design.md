# buzz-ds — design

부모 [`buzz-restyle`](../buzz-restyle/design.md)의 레퍼런스, Buzz clone 참조 규칙, CSS를 싣는 방법, 디자인 언어 표, 가져오지 않는 Buzz 동작, 공통 함정을 따른다. 이 문서는 표에서 담당이 `buzz-ds`인 행과 공유 요소의 설계만 적는다.

**작성 방식 (2026-10-26 user)**: Buzz는 레퍼런스다. clone에서 값과 규칙을 읽고 doan CSS를 새로 쓴다. Buzz 파일을 옮기거나 구조를 그대로 베끼지 않으며, 코드에 Buzz 출처 주석이나 라이선스 사본을 두지 않는다. Buzz를 참고했다는 사실은 AGENTS.md 레퍼런스 규칙에 따라 PRODUCT §7과 DESIGN.md에만 적는다.

## 영향받는 구성 요소

- **앱 렌더러**:
  - `tokens.css`(전면 재작성), `styles.css`·`settings.css`의 공용 규칙과 아래 대응표의 모든 줄, `connectionRows.css`
  - `components/ui/tooltip.tsx`, `CommentPins.ts`(inline 스타일)
  - 공유 요소: `ProjectSetupDialog.tsx`, `AddProjectsDialog.tsx`, `FirstPrompt.tsx`, `ConnectionRows.tsx`, `ErrorDetails.tsx`, `Toast.tsx`, `.ob-dialog`, 스피너
  - 새 디렉터리 `app/src/renderer/ds/`, 새 공용 컴포넌트 `Panel`, `IconButton`
  - 화면 배치 규칙과 동작 코드는 바꾸지 않는다.
- **앱 main**: `nativeTheme.themeSource = "light"`, 두 창(`src/main/index.ts:316` 메인, `:381` Settings)에 `backgroundColor`를 새로 지정. 둘 다 테스트로 값을 고정한다.
- **`design/` 초안**: 기존 12개는 고치지 않지만 `doan check`가 정의되지 않은 변수 오류를 내면 안 된다(별칭이 지킨다). 새 초안 `design/buzz-ds.html`을 그린다(아래 '초안 요청').
- CLI, `doan mcp`, 스킬, 포맷: 영향 없음.

## 토큰 (`tokens.css`)

`tokens.css`는 캔버스에 그대로 서빙되고 `doan check`가 읽는 파일이라 평범한 `:root` 선언만 둔다(Tailwind 지시어와 `@import` 금지, 파일 머리 주석). 그 안에서 `var()`와 `color-mix()`는 쓸 수 있다.

1. **팔레트**: Buzz 라이트 값을 기준으로 한 무채색 램프, citrus 12단계와 짝 값(contrast, ink, pressed, link), 상태색. 다크 값은 두지 않는다.
2. **의미 역할**: `surface-*`, `text-*`(기본·보조·메타·disabled·on-prominent·on-accent), `border-*`(standard, prominent, focus), `affordance-*`, `bg-scrim`, 반경(12/16/20/24/28px), 간격, 그림자(`shadow-panel` 등), 블러, 시간·easing, 타입 크기·행간·자간·굵기, `font-sans`(시스템 스택, `Apple SD Gothic Neo` 대체).
3. **액센트 역할**: `surface-sidebar-selected`(citrus 9)·`text-sidebar-selected`, `affordance-sidebar-hover`(citrus 2), `surface-comment`(citrus 4)·`text-comment`(citrus 12, Buzz의 Chillin' 수준을 기본으로 고정), `affordance-accent`(citrus 9)·`text-on-accent`, 핀 역할.
4. **기존 이름 25개**: 위 역할을 가리키는 `var()` 별칭으로 남긴다(예: `--panel: var(--surface-panel)`, `--line: var(--border-standard)`). 기존 초안 12개 전용이고 렌더러는 읽지 않는다. Buzz 역할 이름과 겹치는 이름(`--accent-ink`, `--font-sans`)은 역할 값과 같게 둔다. `--accent*` 별칭은 무채색 역할을 가리킨다(초안은 이력이므로 색이 바뀌어도 된다).
5. 파일 머리 주석을 새 구조(팔레트 → 역할 → 별칭, 라이트 단일)로 바꾼다. Sorcerer 언급을 지운다.

## 디자인 시스템 CSS (`app/src/renderer/ds/`)

- doan이 새로 쓴 평범한 CSS다. `@apply`·`@utility`를 쓰지 않으므로 Tailwind 루트가 필요 없다. `styles.css`와 `settings.css`가 각각 CSS `@import`로 싣는다. `connectionRows.css`는 `tokens.css` 변수만 읽는다.
- `styles.css`의 `@theme inline`은 shadcn 이름을 새 역할에 연결한다. `primary` → 무채색 prominent, `accent`(shadcn에서 hover 강조) → `affordance-floating-hover`/`text-standard`, `ring` → `border-focus`. citrus는 shadcn 이름에 연결하지 않는다.
- 대체하는 기존 규칙은 지운다. 새 규칙과 같은 대상을 겨누는 옛 규칙이 남으면 안 된다(부모 design 공통 함정의 cascade 항목).
- 범위(Buzz에서 참고할 계열): 버튼(prominent/subtle/ghost), `IconButton`, `Panel`, 툴팁, 메뉴·팝오버(floating 재질), 다이얼로그 틀, 토스트, 스피너, 폼 컨트롤(input, textarea, checkbox), `.kbd`·`.chip`, 포커스, disabled, 스크롤바. 탭, 아코디언, 캘린더, 테마 선택, 설정 페이지, 아바타, glass 버튼은 참고하지 않는다.
- 상태 선택자는 처음부터 Radix와 네이티브에 맞춰 쓴다: 열림 `[data-state=open]`·`dialog[open]`, 선택 `[data-state=checked]`·`[aria-selected=true]`, 비활성 `:disabled`·`[data-disabled]`, 강조 `[data-highlighted]`, 키보드 포커스 `:focus-visible`. 위치 변수는 Radix의 `--radix-*-content-transform-origin`, `--radix-popper-available-*`를 쓴다. 등장 모션은 `@starting-style`, 네이티브 `<dialog>` 퇴장은 `transition-behavior: allow-discrete`와 `overlay`, Radix 퇴장은 keyframes(`animationend`). `prefers-reduced-motion`이면 이동을 없앤다.
- 포커스: 기본은 바깥 2px 링(오프셋 2px). `.native-scroll` 안의 행(트리 행, `.wt`, `.fb-item`, `.qo-item`)은 잘리지 않게 안쪽 링(-1px)을 쓴다. `.btn.primary`·`.comments-btn.primary`의 -3px 링 규칙(`styles.css:34`, `settings.css:95`)은 지운다.
- 툴팁: prominent 캡슐, `text-caption`, 패딩 4/8px, 최대 너비 24rem. 기존 `[data-slot="tooltip-content"] { padding: 6px 12px }`(`styles.css:35`)와 `.project-tooltip`(`styles.css:450`)을 지운다. 긴 경로 툴팁이 줄바꿈되는지 확인한다.
- 캔버스 표시의 치수 라벨과 툴팁이 같은 검정 캡슐이 되는 것은 의도한 결과로 DESIGN.md에 적는다. 사이드바 hover(citrus 2)가 흰 패널 위에서 거의 보이지 않는 것도 Buzz와 같은 의도로 적어 둔다.

## 셀렉터 대응표 (오렌지 → 역할)

A6에서 아래 줄을 모두 옮긴다. 줄 번호는 2026-10-26 기준이며 A6에서 `grep -rnE 'var\(--accent' app/src/renderer`로 다시 확인한다. 화면 자식은 이 대응을 바꾸지 않는다(바꾸려면 부모 공통 결정 13).

**citrus (부모 공통 결정 2의 자리)**

| 셀렉터 | 역할 |
|---|---|
| `.side .row[aria-current="location"]`와 `::before`, `.num`, `.glyph` (`styles.css:462-463`) | `surface-sidebar-selected` 채움 + `text-sidebar-selected` |
| `.side .row:hover` (새로 범위를 좁힘. `.row:hover` `styles.css:64`는 무채색으로 남는다) | `affordance-sidebar-hover` |
| `CommentPins.ts:27-28` | `affordance-accent` 채움 + `text-on-accent`, 1px 어두운 테두리 + 흰 바깥 halo. 포커스는 `outline: 2px solid` + `box-shadow: 0 0 0 4px #fff`(`styles.css:260` 갱신) |
| 코멘트를 저장하는 버튼: 작성기의 Save/Save and reopen(`CommentsPanel.tsx:301`), 미저장 안내의 Save and continue(`CommentsPanel.tsx:356`). 새 modifier `.comments-btn.primary.submit` | `affordance-accent` 채움 + `text-on-accent` |
| 코멘트 카드 | 역할 `surface-comment`/`text-comment`만 정의. 적용은 `buzz-comment` |

**무채색**

| 셀렉터 | 역할 |
|---|---|
| `@theme` `--color-primary`/`-foreground` (`styles.css:11-12`), `.btn.primary` (`styles.css:50`, `settings.css:12`, `settings.css:92`), 위 submit이 아닌 `.comments-btn.primary` (`styles.css:155`; Continue, Retry original, Hand Off, Review 등) | prominent 채움 + `text-on-prominent` |
| `@theme` `--color-accent`/`-foreground` (`styles.css:17-18`) | `affordance-floating-hover` / `text-standard` |
| `@theme` `--color-ring` (`styles.css:22`), 포커스 outline (`styles.css:33, 147, 195, 222, 435, 530, 574, 598`; `settings.css:94`) | `border-focus` 링 레시피(위 '포커스') |
| `styles.css:34`, `settings.css:95` | 삭제 |
| `.logo i` (`styles.css:43`) | `text-standard` 채움 |
| 열린 수 강조 `.cnt.hot`, `.wt-sum .hot`, `.ocard-meta .hot` (`styles.css:67, 354, 503`), `.comments-badge.open` (`:170`) | `text-standard` 500. 리뷰 수는 `text-subtle` 400, 일반 수는 `text-metadata` |
| 캔버스 선택 `.mark` (`:78`) | 1px `border-focus` 실선 + 1px 흰 바깥선 |
| 캔버스 hover `.mark.hover` | 같은 처리, 점선 |
| 프레임 점프 `.mark.jump-highlight` (`:478`) | 2px `border-focus` + 3px 반투명 검정 링, 기존 페이드 유지 |
| 치수 라벨 `.dims` (`:80`) | prominent 캡슐(툴팁과 같음) |
| 카드 flash `.card.flash` (`:336`) | `border-focus` 링 |
| `.spinner` (`:85`) | `text-standard` 호 |
| `.canvas-notice` (`:90`) | `surface-inset` + `text-standard` |
| `.row.element-row` (`:113`), `.ancestors button[aria-current]` (`:122`), `.comments-segment button[aria-pressed]` (`:152`), `.qo-item[aria-selected]` (`:516`), `.st-tab[aria-selected]` (`settings.css:49`) | `surface-navigation-selected` + `text-standard` |
| `.token` (`:134`), `.ob-sentence mark` (`:315`) | `surface-inset` 칩 + `text-standard` |
| `.comments-target.locatable` (`:166`), `.comments-status button` (`:179`) | 링크 역할: `text-standard` + 항상 보이는 밑줄 |
| `accent-color` (`:215, :390`) | `text-standard` |
| `.ob-step[aria-current="step"] .num` (`:273`) | prominent 채움 |
| `.wt[aria-current]` 막대·글리프 (`:345, :349`), `.pj-row[aria-selected]` 막대·글리프 (`settings.css:63, :65`) | `surface-navigation-selected` + `border-prominent` 막대 + `text-standard` |
| `.wt-sel b` (`:365`), `.open-tag` (`:366`) | `text-standard` 500 / 무채색 칩 |
| `.mi .check` (`:375`), `.mi[data-highlighted]` (`:434`) | `text-standard` / `affordance-floating-hover` |
| `.drop-zone` (`:409`), `.drop-glyph` (`:412`) | `border-prominent` 점선 / `surface-inset` |
| `.branch` (`:420`), `.branch[aria-expanded]` (`:423`) | `text-subtle` / `affordance-subtle-hover` + `border-prominent` |
| `.home-shell .btn.primary .kbd` (`:448`) | `text-on-prominent`, opacity 없이 |
| `.side .row.is-open .glyph` (`:460`) | `text-standard` 500 |
| `.sel-mark` (`:464`) | `text-standard` 테두리 |
| `.qo-input .glyph`, `caret-color` (`:507-508`), `.qo-item[aria-selected] .glyph` (`:517`) | `text-subtle` / `text-standard` |
| `.fb-review` (`:592`) | subtle 버튼 |

**opacity로 흐리게 하던 규칙** — opacity를 쓰지 않고 역할로 바꾼다.

| 셀렉터 | 역할 |
|---|---|
| `button:disabled` (`styles.css:31`, `settings.css:7`), `.mi[data-disabled]` (`:446`), `.zctl.disabled` (`:95`), `.cl-item.off input` (`:396`) | `text-disabled`(disabled 역할) |
| `.ob-item.dimmed` (`:286`, `settings.css:22`), `.handoff-row input:disabled + .handoff-text` (`:216`) | `text-metadata` |

**scrim** — `bg-scrim` 하나로 통일한다: `.comments-dialog::backdrop` (`:199`), `.ob-dialog::backdrop` (`:320`, `settings.css:100`), `.add-dialog::backdrop` (`:437`), `.scrim` (`:440`), `.qo::backdrop` (`:505`). 예외: `.drop .scrim` (`:408`)은 드롭 표시용으로 `bg-scrim`보다 진하게 두고 값을 DESIGN.md에 적는다. `.thumb` (`:493`)과 `.area` (`:72`)의 `--board-bg`는 캔버스 보드라서 `buzz-canvas`까지 `surface-inset`으로 둔다.

## 초안 요청 (`/design-draft`)

- 캔버스: `design/buzz-ds.html`, canvas id `buzz-ds`, `doan:width` 1200. `tokens.css`만 링크하고 역할 변수로 그린다.
- 프레임(`data-doan-frame`): 디자인 시스템 결정을 확인하는 대표 프레임만 그린다(2026-10-26 user). `tokens-color`, `tokens-type`, `buttons`, `menu`, `tooltip`, `dialog-anatomy`(틀, scrim, 헤더·액션, 상단 8rem), `forms`, `focus-disabled`, `canvas-marks`(선택, hover, 점프, 치수를 어두운·밝은·citrus가 많은 바탕 위에), `accent-places`(사이드바 행 기본·hover·현재 위치, 핀 기본·포커스, 제출 버튼, 코멘트 카드 역할).
- 그리지 않는 것: 반경·그림자 표, `IconButton`, `Panel`, 팝오버, 다이얼로그 크기 단계, 토스트, 스피너, 공유 요소(`shared-*`). 구체적인 모습은 그것을 쓰는 화면 자식 feature가 자기 초안에서 정한다. buzz-ds는 이들의 공용 스타일만 구현하고 e2e와 실측으로 확인한다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

`app/src/renderer/ds/checks.ts`(가칭)에 두고 vitest로 확인한다. 입력은 리포 파일만 쓰고 Buzz clone을 읽지 않는다.

1. `contrastPairs(tokens, pairs)`: WCAG 대비와 APCA Lc를 계산해 기준(본문 4.5:1·Lc 60, 메타 Lc 45, 비텍스트 3:1, disabled 예외)을 넘는지. 반투명 표면은 흰색과 검정 뒤 배경 둘 다로 합성한다. 쌍 목록에 citrus 쌍, 핀과 halo, 포커스 링, 툴팁·치수 캡슐을 넣는다. APCA 식은 공개된 APCA-W3 0.0.98G 식을 doan이 직접 구현한다.
2. `cssVarUsage(files)` → 정의되지 않은 사용 목록: 렌더러 `*.css`와 `*.ts`/`*.tsx` 문자열 안의 `var(--*)`. `:root` 선언과 `@theme` 선언을 정의로 센다. `--tw-*`, `--radix-*`는 런타임 변수로 허용한다. 대체값이 있는 `var(--x, y)`도 정의되지 않았으면 실패로 본다.
3. `legacyAliases(tokensCss)`: 기존 이름 25개가 모두 있고, 각각이 같은 파일에 정의된 역할을 가리키는 `var()`인지.
4. `accentPlaces(files)`: citrus 역할(`surface-sidebar-selected`, `text-sidebar-selected`, `affordance-sidebar-hover`, `affordance-accent`, `text-on-accent`, `surface-comment`, `text-comment`)을 읽는 셀렉터가 허용 목록(위 대응표의 citrus 행)과 같은지.
5. `nestedRadius(outer, inset, border)` = `max(0, outer − inset − border)`: e2e 실측과 대조할 기대값.

## 포맷 변경

없다. JSON Schema, 픽스처, 포맷 버전 `v` 모두 그대로다.

## 컨벤션 영향

ARCHITECTURE §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. `.doan/config.json`의 `tokenCss`도 같은 파일을 가리킨다. 렌더러의 데이터 속성은 `data-doan-*`(캔버스 컨벤션)를 쓰지 않고 `data-ui-*`를 쓴다.

## 결정 영향

- PRODUCT §7 2026-10-22 "Theme: dark only, one orange accent, one system sans font (no monospace)"와 Sorcerer 레퍼런스를 대체한다.
- PRODUCT §7 2026-10-25 공유 툴팁 패딩 12/6px 결정과 §8의 같은 항목(PRODUCT.md:711)을 Buzz식 툴팁으로 대체한다.
- 새 결정: 토큰은 역할 + 기존 이름 별칭(2026-10-26 user), `nativeTheme.themeSource = "light"`(2026-10-26 user), 사이드바 citrus는 현재 위치 행(2026-10-26 user), Buzz는 코드가 아닌 레퍼런스(2026-10-26 user).
- 유지하는 결정: Radix(shadcn) + Tailwind 스택, Radix ScrollArea 금지와 두 CSP 불변(2026-10-22). CSS `@import`, `backdrop-filter`, `@starting-style`, 시스템 폰트는 CSP와 무관하다. `url()`·`data:` 자원은 쓰지 않는다.
- 캔버스 iframe: sandbox, 주입 스크립트, 서빙 범위, 오버레이 좌표 계산은 그대로다. `themeSource` light 때문에 iframe의 `prefers-color-scheme`이 macOS 외형과 상관없이 light가 된다. 다크 모드 macOS에서 캔버스 렌더링이 달라지는지 A4에서 확인하고 DESIGN.md에 적는다.
- DESIGN.md의 기존 색 실측값은 무효가 된다. 맨 앞에 디자인 시스템 절을 새로 두고, 화면별 절의 색 값에는 "buzz-ds 이전" 표시를 단다.

## PoC 의존

없다. `backdrop-filter`는 Chromium 156에서 지원한다. 캔버스 iframe 위 플로팅 표면의 블러는 computed `backdrop-filter` 값으로 확인한다(tasks A8).
