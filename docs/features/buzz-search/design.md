# buzz-search — design

## 레퍼런스 (부모 'Buzz clone 참조 규칙')

- clone `~/code/buzz-app`, 로컬 HEAD `ec1b9acc5ff99fac3bcea106935fb0224bb7b51e`(2026-10-30 확인). 기준 커밋 `c40dfdf4`의 파일을 `git show c40dfdf4:<경로>`로 읽었다.
- 읽은 파일:
  - `src/app/shell/PageSearch.tsx` 180-188행: `Dialog presentation="search"`, `motion="default"`, `dismissOnOutsideClick`, `footerGap="none"`
  - `src/app/shell/SearchChoices.tsx`: 팔레트 마크업(입력 → 결과 그룹 → 행), placeholder `Search...`(191행), 24px 아이콘 칸(382행), 21px 아이콘(395행), 이름 + `text-body-sm text-subtle` 보조 줄(404-411행)
  - `src/app/shell/SearchChoices.css`: 결과 스크롤 `max-height: min(55vh, calc(100dvh - var(--dialog-top) - 8rem))`, 그룹 간격 `space-6`, 그룹 제목(body-sm, `text-unavailable`, 400), 행 `min-height: 2.75rem`, 빈 결과(body-sm, `text-subtle`), 결과 높이 전환 180ms
  - `src/shared/design-system/styles/overlays.css` 11-21행(다이얼로그 위 8rem, 폭 40rem), 615-626행(search presentation: 패딩 `space-3`, 모서리 `radius-panel + space-1`, `surface-panel`, 위 패딩 0)
  - `src/shared/design-system/styles/search-field.css` palette 변형: `body-lg`, 패딩 `space-6`/`space-3 - 1px`, 투명 테두리·배경, 모서리 = 팔레트 모서리 − `space-3`, 키보드 포커스 시 `border-focus` 테두리
  - `src/shared/design-system/styles/components.css` 1286-1340행(`navigation-item` 기본·hover·`data-highlighted`·selected), 1377-1390행(search 변형: 패딩 `space-3`, 모서리 = 팔레트 모서리 − `space-3`)
  - `src/features/search/MatchedLabel.tsx`·`.css`: 맞은 글자를 `<mark class="search-match">`로 감싸고 1px 밑줄, offset 2px, 배경 없음. 텍스트는 하나로 유지해 접근성 이름이 바뀌지 않는다.
  - `src/shared/design-system/DESIGN.md` 1893-1913행('Global search presentation'), 1376-1386행(행 내용 정렬: 아이콘 칸과 그룹 제목을 같은 열로), 284-290행(빈 결과는 검색을 넓히는 방법을 설명한다)

## 영향 범위

- **앱(렌더러)만**: `QuickOpenDialog.tsx`(마크업, 바깥 클릭), `quickOpen.ts`(매칭 위치, 바깥 판정), `ds/surfaces.css`(`.doan-dialog` 검색 변형 추가), `styles.css`의 `.qo*` 규칙(대체·삭제), 테스트.
- CLI, `doan mcp`, 스킬, 포맷(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지): 변경 없음.
- main 프로세스, preload, 메뉴: 변경 없음. 메뉴 활성 규칙(`menu:state`의 `modal`)은 그대로다.

## 화면 구성 (Buzz 값 → doan)

| 부분 | Buzz | doan 구현 | 조정 |
|---|---|---|---|
| 다이얼로그 위치·폭 | 위 8rem, 폭 `min(40rem, 100% - 2rem)` | 위 128px, 폭 `min(640px, 100% - 2 * --space-4)` | 없음 |
| 표면 | `surface-panel`, 모서리 `radius-panel + space-1`, 패딩 `space-3`(위 0, 본문이 위 패딩을 가짐), squircle. 테두리 1px `border-standard`와 `shadow-sm`은 base 다이얼로그 값을 그대로 둔다(overlays.css 26-33행) | `.doan-dialog[data-ui-presentation="search"]`: `--surface-panel`, `calc(--radius-panel + --space-1)` = 32px, 패딩 `--space-3`(아래 '공용 다이얼로그와의 관계') | `corner-shape: squircle`은 Chromium 지원 여부를 초안에서 확인하고, 지원하지 않으면 일반 모서리 |
| 입력 | 돋보기 없음, `body-lg` 20px, 패딩 24/11px, 테두리는 키보드 탐색 모드에서만 보임(평소 투명) | 공용 `.doan-input` 기본 크기(40px, `body`, `--surface-inset` 채움, 포커스 시 `--border-prominent`)와 앞쪽 16px 돋보기. 배치는 Home 프리셋 검색 `.popover-search`와 같다(왼쪽 `--space-3`, 입력 왼쪽 패딩 `--space-3 + --size-icon + --space-2`) | 조정(2026-10-30 user, 초안 2차 비교에서 B안): Buzz 팔레트 입력 대신 앱의 다른 검색 입력과 같은 프리미티브를 쓴다. 모서리 20px가 다이얼로그 12px 안쪽과 동심이다. placeholder는 doan 문구 `Search canvases and frames` 유지 |
| `esc` 칩·안내줄 | 없음 | 없음(spec 확정 질문 1) | 없음 |
| 필터 탭 | 없음(Buzz는 범위 칩만 둔다) | 입력 아래 8px에 `All` / `Canvases` / `Frames`. Home 프리셋 그룹 탭(`.group-tabs.shell-modes`, `HomeComposerView.tsx` 468행)과 같은 캡슐·`role="tablist"`·roving tabindex·←/→ 이동 | doan 추가(2026-10-30 user). 아래 '필터 탭' |
| 결과 영역 | 입력(doan은 탭) 아래 `space-2`, 스크롤 `max-height: min(55vh, …)`(내용 높이), 위쪽 8px 페이드 | 탭 아래 `space-2`, 고정 높이 `height: 55dvh; min-height: 400px`, 위쪽 8px 페이드, `.doan-scroll` | 조정(2026-10-30 user, 초안 7차): 최대 높이 대신 고정 높이라 결과 수와 관계없이 다이얼로그 크기가 같다. Buzz `height="stable"`(검색 목록용 고정 높이)과 같은 취지다. 창이 작아 `128px + 내용`이 창을 넘으면 기본 `.doan-dialog`의 `max-height`·`overflow: auto`로 다이얼로그가 스크롤된다(예: 600px 창). 결과 높이 전환은 고정 높이라 필요 없다 |
| 그룹 제목 | body-sm, `text-unavailable`, 400, 좌우 `space-3`, 최소 높이 `space-6 + space-1`(28px), 그룹 사이 `space-6` | 같은 값(`text-unavailable` = neutral-7 = doan `--text-disabled`). 제목은 프로젝트 썸네일 + 프로젝트 이름(아래 '결과 그룹'), 사이 `--space-2` | Buzz는 종류별로 묶고 doan은 프로젝트(root)별로 묶는다(2026-10-30 user) |
| 바깥 클릭 | `dismissOnOutsideClick`(Base UI) | 다이얼로그 사각형 밖에서 누르고 뗀 클릭이면 `dismiss()`(spec 확정 질문 3) | Base UI 대신 doan이 판정한다(아래 순수 함수 6) |
| 결과 행 | `NavigationItem variant="search"`: 최소 44px, 패딩 12px, 모서리 20px, 아이콘 칸 24px(아이콘 21px), 이름 body-sm 400, 보조 줄 body-sm `text-subtle` | 같은 값, 이름만 `--type-weight-medium`(500). 아이콘은 lucide: 캔버스 `Palette`(LNB 캔버스 행과 같음), 프레임 `Hash`, 21px | 조정(2026-10-30 user): 이름을 한 단계 굵게 해 보조 줄과 위계를 나눈다 |
| 행 강조 | 키보드·포인터 강조는 `interaction-row-hover`. 결과 목록에 `interaction-panel`이 걸려 있어(SearchChoices.tsx 227행) 그 값은 `affordance-row-hover` = `affordance-subtle`이고, 보조 글자는 `text-subtle` 그대로다(materials.css 153-163행) | `aria-selected` 행에 `--affordance-subtle` | doan에 `interaction-*` 역할이 없어 같은 값의 `--affordance-subtle`을 직접 쓴다 |
| 맞은 글자 | 1px 밑줄, offset 2px, 배경·색 상속 | 같은 값 | 없음 |
| 빈 결과 | body-sm, `text-subtle`, 좌우 control inset | 같은 값. All 탭 문구는 기존 네 가지 그대로, 탭별 문구는 아래 '필터 탭' | 없음 |
| 등장 모션 | `motion="default"`: 0.75rem 상승, 220ms, 퇴장 120ms | `.doan-dialog` 모션 규칙과 같은 값 | Buzz DESIGN.md 1218행은 검색 팔레트에 `motion="none"`을 권하지만 실제 코드(`PageSearch.tsx:185`)는 `default`다. 출하된 코드를 따른다 |

### 결과 행 내용

- 첫 줄: 이름(`result.label`) + 맞은 글자 밑줄.
- 둘째 줄(보조): 캔버스는 `<.doan/canvases/ 뒤 경로>`, 프레임은 `<캔버스 이름> › <번호>`. 넘치면 끝을 줄인다. 프로젝트는 그룹 제목으로 올라갔다.
- option의 접근성 이름은 지금과 같은 문자열(`이름 — 맥락 · 프로젝트`)을 유지한다. 테스트와 DESIGN.md 접근성 표가 이 이름을 쓴다.

### 결과 그룹 (2026-10-30 user, 초안 5차)

- root 하나가 한 그룹이다. 같은 저장소의 다른 워크트리는 따로 묶는다. 제목은 `projectWhere`가 만드는 이름(`acme-web · main`, `acme-web · feat-billing`, 깃 밖 폴더는 폴더 이름)이다. 이름 앞에 LNB·Home 프로젝트 선택기와 같은 썸네일(`.shell-thumbnail hue-${projectHue(name)}`, 글자 `projectInitial(name)`, 16px)을 둔다. 저장소 이름으로 색과 글자를 정하므로 같은 저장소의 워크트리 그룹은 같은 썸네일이다(2026-10-30 user, 초안 6차).
- 순서: 50개 상한까지 고른 결과를 root로 묶는다. 그룹은 그룹 안 최고 점수가 높은 순이고, 같으면 기존 근접도(현재 root → 같은 저장소 → 다른 저장소), 그다음 기존 결과 순서다. 그룹 안 행은 기존 순서(점수 → 인덱스 순)를 지킨다. 그래서 첫 행은 늘 전체 최고 일치이고 Enter의 결과가 지금과 같다.
- 빈 검색어: 결과가 저장 순서이므로 root별로 저장 순서대로 묶인다. 워크스페이스는 현재 root 하나라 그룹도 하나다.
- ↑/↓는 그룹을 가로질러 행만 옮긴다. 제목은 활성 대상이 아니다.
- 접근성: listbox 안에 `role="group"` `aria-labelledby`=제목. option 접근성 이름은 프로젝트를 포함한 지금 문자열을 유지한다.

### 필터 탭 (2026-10-30 user)

- 탭: `All`(기본) / `Canvases` / `Frames`. 탭마다 14px 아이콘을 앞에 둔다: `All` lucide `Layers`, `Canvases` `Palette`, `Frames` `Hash`(행 아이콘과 같다). 크기·간격은 Home 그룹 탭 규칙(`.group-tabs.shell-modes svg` `--size-icon-sm`, 간격 `--space-1h`)이다(2026-10-30 user, 초안 8차). `LayoutGrid`는 헤더 Projects와 Overview가 이미 써서 피했다. Quick Open을 열 때마다 `All`이다. 고른 탭은 기억하지 않는다.
- 거르기: 탭은 50개 상한 **전에** 종류를 거른다. 그래서 다른 종류 결과가 상한을 채워 탭이 비는 일이 없다. 순위 규칙(점수 → 현재 root → 같은 저장소 → 다른 저장소)은 각 탭 안에서 그대로다.
- 빈 검색어: `All`과 `Canvases`는 지금 규칙(워크스페이스는 현재 root, Home은 전체 캔버스, 저장 순서)이다. `Frames`는 같은 범위의 프레임을 저장 순서로 보이고, 열린 캔버스가 있으면 그 캔버스의 프레임이 먼저다(최대 50개, 2026-10-30 user). 열린 캔버스의 프레임은 지금처럼 렌더링된 프레임(`rendered`)을 쓴다.
- 탭을 바꾸면 검색어는 그대로, 첫 행이 활성이 된다.
- 키보드·포커스: 탭 목록은 고른 탭 하나만 Tab 정지점이고 ←/→로 옮긴다(Home 그룹 탭의 `tabKey`). 탭을 클릭하면 포커스는 입력에 남는다(행처럼 `mousedown` 기본 동작 막기). 입력에서 Tab을 누르면 탭 목록으로, Shift+Tab으로 입력에 돌아온다. ↑/↓/Enter는 지금처럼 입력에서만 처리한다.
- 접근성: `role="tablist"` `aria-label="Result types"`, 각 탭 `role="tab"` `aria-selected` `aria-controls`=결과 listbox.
- 빈 결과 문구: 검색어가 있고 결과가 없으면 `All` "No canvases or frames match"(기존), `Canvases` "No canvases match", `Frames` "No frames match". 검색어가 없고 범위에 프레임이 없으면 `Frames` "No frames to show". 읽는 중·사용할 수 없는 프로젝트 문구는 탭과 관계없이 기존 문구다.

## 초안 요청 (`/design-draft`)

- 경로와 id: `.doan/canvases/buzz-search.html`, `doan:canvas` `buzz-search`, `doan:width` 2560.
- 프레임(모두 새 프레임, `/design-sync` 비교 대상):
  - `results` — 워크스페이스, 검색어 "card", 캔버스·프레임 섞임, 첫 행 활성, 맞은 글자 밑줄, 긴 이름과 긴 경로의 줄임, 목록 스크롤
  - `results-frames` — `results`와 같은 검색어에 Frames 탭
  - `empty-query-home` — Home, 빈 검색어, 모든 프로젝트의 캔버스
  - `empty-query-workspace` — 워크스페이스, 빈 검색어, 현재 프로젝트의 캔버스
  - `empty-query-frames` — 워크스페이스, 빈 검색어, Frames 탭, 열린 캔버스의 프레임 먼저
  - `no-match`, `no-match-frames`, `reading`, `unavailable`, `no-canvases` — 빈 상태. 창 없이 다이얼로그만 그린 타일
- 제약: 배경의 헤더·LNB는 main 화면 복사본이다. 그 아래 Home·워크스페이스 본문은 scrim 아래라 단순화하고 비교하지 않는다. 입력창의 포커스 표시는 아래 '입력창 비교'를 따른다.
- 입력창 비교 (2026-10-30 user, 초안 2차): 1차 초안은 Buzz 팔레트 입력에 포커스 테두리를 늘 그려서 높고 각진 상자로 보였다. Buzz는 이 테두리를 키보드 탐색 모드(`useKeyboardFocusVisibility.ts`, Tab·화살표 키에서만 켜짐)에서만 보이므로 평소에는 투명하다. 사용자가 두 안을 나란히 그려 고르기로 했다.
  - A: Buzz 팔레트 입력(78px, `body-lg`, 테두리 투명). B: 공용 `.doan-input`과 앞쪽 돋보기.
  - 사용자가 B를 골랐다(초안 3차). 모든 프레임이 B이고 A의 프레임과 CSS는 지웠다. 값은 위 '입력' 행.
- 초안 4차(2026-10-30 user): 필터 탭(위 '필터 탭')과 결과 이름 500을 더했다.
- 초안 5차(2026-10-30 user): 결과를 프로젝트(root) 단위로 묶었다(위 '결과 그룹'). 행 둘째 줄에서 프로젝트를 뺐다.
- 토큰 없는 값(컴포넌트 상수): 행 최소 높이 44px(Buzz `2.75rem`), 아이콘 21px(Buzz `PageIcon size={21}`), 행 사이 1px(`navigation-section-rows` gap), 결과 높이 429px(초안 한정: 780px 창의 `55dvh`를 계산한 값. 구현은 `height: 55dvh`), 최소 높이 400px, 테두리·밑줄 1px.
- 2026-10-30 user: feature-review보다 초안 확정을 먼저 한다.

## 순수 함수 (`/tdd` 대상)

1. `matchPositions(label: string, query: string): number[]` (`quickOpen.ts`) — 이름에서 검색어 토큰과 맞은 글자의 코드포인트 위치. 규칙: 검색과 같은 NFC·소문자 정규화, 토큰마다 `tokenScore`와 같은 우선순위로 한 곳을 고른다(접두어 → 단어 시작 → 부분 문자열의 첫 위치). 이름이 아닌 필드(파일 이름, 경로, id)로만 맞은 결과는 빈 배열. NFD 파일 이름처럼 정규화 전후 길이가 다른 경우는 원래 이름 기준 위치로 되돌린다(못 맞추면 빈 배열, 밑줄 없음).
2. `markRuns(label: string, positions: readonly number[]): { text: string; match: boolean }[]` — 위치를 연속 구간으로 묶는다. 렌더러는 `match` 구간만 `<mark>`로 감싼다.
3. `searchMatch(index, query, currentRoot, commonOf, kind, openCanvas)` 확장 — `kind: "all" | "canvas" | "frame"`으로 50개 상한 전에 거르고, 빈 검색어에서 `frame`이면 같은 범위의 프레임을 열린 캔버스(`openCanvas`) 먼저, 저장 순서로 돌려준다. `all`·`canvas`의 기존 결과는 바뀌지 않는다(기존 순위 테스트 수정 없이 통과). 탭별 빈 결과 문구를 고르는 `emptyText(kind, query, scope)`도 순수 함수로 뺀다.
4. `groupResults(results, where, proximity)` — 위 '결과 그룹' 규칙으로 `{ title, rows }[]`를 만든다. 점수는 `searchMatch`가 결과와 함께 돌려주도록 넓힌다(지금은 버린다). 사례: 다른 root의 정확한 일치가 현재 root보다 먼저인 경우, 같은 점수의 근접도 순서, 빈 검색어의 저장 순서, 그룹 안 순서 보존.
5. `resultParts(result, where)` 개편 — `{ icon: "canvas" | "frame"; name; detail; accessibleName }`. 현재의 `glyph`·`context` 문자열 조합을 대체한다. `accessibleName`은 지금 option 텍스트와 같다.
6. `outsideDialog(rect, x, y): boolean` — 점이 다이얼로그 테두리 사각형 밖인지. 네이티브 모달의 backdrop 클릭은 `event.target`이 `<dialog>` 자신으로 오고, 다이얼로그 패딩 안을 눌러도 target이 같으므로 target만으로는 바깥을 알 수 없다. `pointerdown`과 `click`이 모두 바깥일 때만 닫는다(안에서 입력 텍스트를 드래그해 바깥에서 뗀 경우 닫지 않음). 경계선 위는 안으로 본다.

## 포맷·컨벤션·결정 영향

- **포맷**: 없음. JSON Schema와 `v` 변화 없음.
- **컨벤션(ARCHITECTURE §1)·`doan check` 규칙**: 없음.
- **구조 결정**: 없음. 서빙 범위, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작과 무관하다.
- **제품 결정**: PRODUCT §5 항목 1의 검색·순위·열기 동작은 그대로다. 바뀌는 것은 셋이다. (1) 2026-10-25 design-nav의 'Quick Open footer' 승인을 안내줄·`esc` 칩 제거로 대체한다. (2) "Escape closes and restores focus"에 바깥 클릭 닫기가 더해진다. (3) 결과 종류 필터 탭과 빈 검색어 Frames 탭 규칙이 더해진다. (4) 결과가 프로젝트별 그룹으로 묶이고 그룹 순서는 최고 점수 순이다(순위의 첫 행은 그대로). 넷 다 승격 때 PRODUCT §5 항목 1 문장과 §7에 날짜·근거로 적는다. 공통 결정 10의 buzz-ds 공유 요소 변경(검색 변형)도 §7에 적는다.
- **PoC 의존**: 없다.

## 공용 다이얼로그와의 관계

`.doan-dialog`는 buzz-ds 소유 프리미티브다(공통 결정 10). 사용자가 검색 변형 추가를 승인했다(2026-10-30, spec 확정 질문 4).

- `<dialog className="doan-dialog qo" data-ui-presentation="search">`. `ds/surfaces.css`에 `.doan-dialog[data-ui-presentation="search"]` 규칙을 더한다: 패딩 `--space-3`(네 방향), 모서리 `calc(--radius-panel + --space-1)`, 배경 `--surface-panel`, `corner-shape: squircle`, 열린 상태 `gap: 0`. 폭·위치(위 128px, 640px)·backdrop·등장 모션은 기본 `.doan-dialog` 그대로 쓴다. 기본 규칙의 값(위 128px, 640px, 상승 12px·220ms, 퇴장 4px·120ms)이 Buzz 검색 팔레트(8rem, 40rem, 0.75rem, 0.25rem)와 같기 때문이다.
- 위 패딩: Buzz는 다이얼로그 위 패딩을 0으로 두고 본문 스크롤 영역이 12px을 가진다. doan에는 따로 스크롤되는 본문이 없으므로 다이얼로그가 네 방향 12px을 가진다. 보이는 위치는 같다.
- 테두리·그림자: Buzz search presentation은 base 다이얼로그의 1px `border-standard`와 `shadow-sm`을 덮지 않는다(overlays.css 26-33행, 2026-10-30 확인). doan 기본 `.doan-dialog`의 같은 값을 그대로 쓴다.
- `.qo`에는 입력·목록·행처럼 Quick Open 내용 규칙만 남긴다. 표면(위치·폭·모서리·배경·테두리·그림자·backdrop) 규칙은 `.qo`에서 지운다.
- 기존 사용처는 `data-ui-presentation`이 없으므로 영향이 없다. 사용처 목록은 `rg -n 'doan-dialog' app/src/renderer`로 확인한다.
- 드래그 영역: 열린 다이얼로그와 backdrop이 56px 헤더 띠와 겹친다. Electron 드래그 영역은 쌓임 순서와 따로 판정되므로(부모 '드래그 영역') 헤더 띠 위 backdrop 클릭이 창 드래그로 먹히는지 probe로 본다. 먹히면 헤더 띠의 바깥 클릭이 닫기로 가도록 `no-drag` 처리 방법을 그때 정하고 이 문서에 적는다.

## 가져오지 않는 것

- 결과 높이 180ms 전환(`SearchChoices.tsx`의 ResizeObserver 측정). 목록이 고정 높이라 바뀔 높이가 없다.
- Shift+Cmd+1~9, 지우기 버튼, 범위·작성자 칩, 인라인 설정 행, 검색 사용 기록 순위(spec 비목표).
- 보이지 않는 다이얼로그 제목. doan은 지금처럼 `aria-label="Quick Open"`을 쓴다.

## POSTMORTEM 함정

- **2026-10-24 — Focus did not return to the row when Set Up… closed from outside**: 모달 뒤 콘텐츠에 포커스를 주지 않는다. 다이얼로그를 닫은 뒤 포커스를 돌린다. 지금 `dismiss`의 순서(`close()` → `opener.focus()`)를 바꾸지 않는다. 마크업 래퍼를 바꿀 때 `showModal` 호출 위치를 유지한다.
- **2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking**: 다른 모달 위에 쌓일 수 있는 층은 모달로 쌓는다. Quick Open은 이미 `showModal`이고 다른 모달이 있으면 명령이 비활성이다. 바깥 클릭 닫기를 넣으면 backdrop 판정이 드래그 영역(`no-drag`)과 겹치지 않는지 probe로 본다.
- **2026-10-25 — Production CSS extraction concealed missing development styles**: CSS는 `styles.css`에만 두고 JS에서 import하지 않는다. 개발·프로덕션 빌드 모두에서 행과 입력의 computed style을 확인한다.
- **projects-home checklist**: 초안의 `overflow`를 그대로 옮기지 않는다. 50개 결과로 목록 끝까지 스크롤되는지 실제 앱에서 확인한다.
- **cascade layer / 옛 규칙**: 대체한 `.qo*` 규칙은 지운다(부모 'CSS를 싣는 방법').
- IME: `isComposing` 중 키를 무시하는 현재 처리를 유지한다.
