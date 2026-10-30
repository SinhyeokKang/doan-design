# buzz-search — design

## 레퍼런스 (부모 'Buzz clone 참조 규칙')

- clone `~/code/buzz-app`, 로컬 HEAD `ec1b9acc5ff99fac3bcea106935fb0224bb7b51e`(2026-10-30 확인). 기준 커밋 `c40dfdf4`의 파일을 `git show c40dfdf4:<경로>`로 읽었다.
- 읽은 파일:
  - `src/app/shell/PageSearch.tsx` 180-188행: `Dialog presentation="search"`, `motion="default"`, `dismissOnOutsideClick`, `footerGap="none"`
  - `src/app/shell/SearchChoices.tsx`: 팔레트 마크업(입력 → 결과 그룹 → 행), 결과 목록의 `interaction-panel`(227행), 24px 아이콘 칸(382행), 21px 아이콘(395행), 이름 + `text-body-sm text-subtle` 보조 줄(404-411행)
  - `src/app/shell/SearchChoices.css`: 결과 스크롤, 그룹 간격 `space-6`, 그룹 제목(body-sm, `text-unavailable`, 400), 행 `min-height: 2.75rem`, 빈 결과(body-sm, `text-subtle`), 위쪽 8px 페이드
  - `src/shared/design-system/styles/overlays.css` 11-33행(다이얼로그 위 8rem, 폭 40rem, 1px `border-standard`, `shadow-sm`), 244-251행(`height="stable"`: `min(36rem, var(--dialog-available-height))`), 615-626행(search presentation: 패딩 `space-3`, 모서리 `radius-panel + space-1`, `surface-panel`, 위 패딩 0)
  - `src/shared/design-system/styles/search-field.css` palette 변형(B안 채택으로 쓰지 않음)
  - `src/shared/design-system/styles/components.css` 1286-1340행(`navigation-item` 기본·hover·`data-highlighted`·selected), 1377-1390행(search 변형: 패딩 `space-3`, 모서리 = 팔레트 모서리 − `space-3`)
  - `src/shared/design-system/styles/materials.css` 153-163행(`interaction-panel`: 행 hover = `affordance-subtle`)
  - `src/features/search/MatchedLabel.tsx`·`.css`: 맞은 글자를 `<mark class="search-match">`로 감싸고 1px 밑줄, offset 2px, 배경 없음. 텍스트는 하나로 유지해 접근성 이름이 바뀌지 않는다.
  - `src/shared/design-system/useKeyboardFocusVisibility.ts`: 팔레트 입력 테두리는 Tab·화살표 키로 켜지는 키보드 탐색 모드에서만 보인다.
  - `src/shared/design-system/DESIGN.md` 171행(검색 목록은 `height="stable"`), 284-290행(빈 결과는 검색을 넓히는 방법을 설명한다), 1218행(검색 팔레트에 `motion="none"` 권장), 1376-1386행(행 내용 정렬), 1893-1913행('Global search presentation')
  - `docs/shell-design.md` 186-194행(타이틀바 클릭 닫기. doan은 가져오지 않는다, 부모 '가져오지 않는 Buzz 동작')

## 영향 범위

- **앱(렌더러)만**:
  - `QuickOpenDialog.tsx`: 마크업, 탭, 그룹, 바깥 클릭, 포커스 유지, 활성 행 키. `projectWhere`가 저장소 이름도 돌려주게 넓힌다. `qo` 클래스는 남긴다(`App.tsx:599`가 `closest("dialog.qo")`를 쓴다).
  - `quickOpen.ts`: `matchPositions`, `markRuns`, `searchMatch` 확장, `countMatches`, `emptyText`, `groupResults`, `outsideDialog`, `resultKey`.
  - `ds/surfaces.css`: `.doan-dialog` 검색 변형 추가.
  - `styles.css`: `.qo*` 규칙 대체·삭제.
  - 테스트: `quickOpen.test.ts`, `QuickOpenDialog.test.tsx`.
- `App.tsx`는 바꾸지 않는다. 열린 캔버스는 이미 prop으로 들어오는 `rendered`(`{ root, path, frames }`)에서 읽는다.
- CLI, `doan mcp`, 스킬, 포맷(코멘트 이벤트, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지): 변경 없음.
- main 프로세스, preload, 메뉴: 변경 없음. 메뉴 활성 규칙(`menu:state`의 `modal`)은 그대로다. 헤더 `.top`의 드래그 영역도 그대로다.

## 화면 구성 (Buzz 값 → doan)

| 부분 | Buzz | doan 구현 | 조정 |
|---|---|---|---|
| 다이얼로그 위치·폭 | 위 8rem, 폭 `min(40rem, 100% - 2rem)` | 위 128px, 폭 `min(640px, 100% - 2 * --space-4)` | 없음 |
| 표면 | `surface-panel`, 모서리 `radius-panel + space-1`, 패딩 `space-3`(위 0, 본문이 위 패딩을 가짐), squircle. 1px `border-standard`와 `shadow-sm`은 base 다이얼로그 값 그대로 | `.doan-dialog[data-ui-presentation="search"]`: `--surface-panel`, `calc(--radius-panel + --space-1)` = 32px, 패딩 `--space-3`, `corner-shape: squircle`(아래 '공용 다이얼로그와의 관계') | 초안은 squircle이다(Chrome에서 `superellipse(2)`로 확인). Electron에서 지원하는지는 `/design-sync`에서 측정한다 |
| 입력 | 돋보기 없음, `body-lg` 20px, 패딩 24/11px, 테두리는 키보드 탐색 모드에서만 보임 | 공용 `.doan-input` 기본 크기(40px, `body`, `--surface-inset` 채움, `:focus` 시 `--border-prominent`)와 앞쪽 16px 돋보기. 배치는 Home 프리셋 검색 `.popover-search`와 같다(왼쪽 `--space-3`, 입력 왼쪽 패딩 `--space-3 + --size-icon + --space-2`) | 조정(2026-10-30 user, 초안 비교에서 B안): 앱의 다른 검색 입력과 같은 프리미티브를 쓴다. 모서리는 `.doan-input`의 20px 그대로다(다이얼로그 1px 테두리까지 따지면 동심 값은 19px이지만, 프리미티브를 바꾸지 않는다). placeholder는 doan 문구 `Search canvases and frames` 유지. 초안은 `.is-focus` 클래스로 `:focus` 상태를 그린다 |
| `esc` 칩·안내줄 | 없음 | 없음 | 없음 |
| 필터 탭 | 없음(Buzz는 범위 칩만 둔다) | 입력 아래 8px에 `All` / `Canvases` / `Frames`. Home 프리셋 그룹 탭(`.group-tabs.shell-modes`, `HomeComposerView.tsx` 468행)과 같은 캡슐·`role="tablist"`·roving tabindex·←/→ 이동 | doan 추가(2026-10-30 user). 아래 '필터 탭' |
| 결과 영역 | 입력 아래 `space-2`, 내용 높이에 최대 높이, 위쪽 8px 페이드. 검색 목록에는 `height="stable"`(`min(36rem, 남은 높이)`) | 탭 아래 `space-2`, 고정 높이, 위쪽 8px 페이드, `.doan-scroll`, `overscroll-behavior: contain`, `tabIndex={-1}`(Tab 정지점이 아님) | 조정(2026-10-30 user, 초안 7·10차와 feature-review): 높이는 `min(55dvh, 576px, 남은 높이)`, 최소 400px이다. 남은 높이는 `100dvh − 128px − --space-4 − (입력·탭·여백·다이얼로그 패딩·테두리)`이다. 최소 400px는 남은 높이가 허락할 때만 적용되고, 다이얼로그 자체는 스크롤되지 않는다. 576px = Buzz `stable`의 36rem. 결과 높이 전환은 고정 높이라 필요 없다 |
| 그룹 제목 | body-sm, `text-unavailable`, 400, 좌우 `space-3`, 최소 높이 `space-6 + space-1`(28px), 그룹 사이 `space-6` | 같은 글자 값, 색 `--text-metadata`. 제목은 16px 프로젝트 썸네일 + 프로젝트 이름, 사이 `--space-2`. heading 요소가 아닌 `div`(아래 '결과 그룹') | 조정(2026-10-30 user): Buzz는 종류별로, doan은 프로젝트(root)별로 묶는다. 색은 critique 결과다(`text-unavailable` = neutral-7은 14px에서 3.0:1로 4.5:1에 못 미친다) |
| 바깥 클릭 | `dismissOnOutsideClick`(Base UI) | 헤더 띠 아래 backdrop을 주 버튼으로 누르고 뗀 클릭이면 `dismiss()`(아래 '바깥 클릭과 포커스') | Base UI 대신 doan이 판정한다. 헤더 띠 위는 닫지 않는다 |
| 결과 행 | `NavigationItem variant="search"`: 최소 44px, 패딩 12px, 모서리 20px, 아이콘 칸 24px(아이콘 21px), 이름 body-sm 400, 보조 줄 body-sm `text-subtle` | 같은 값, 이름만 `--type-weight-medium`(500). 아이콘은 lucide 21px: 캔버스 `Palette`(LNB 캔버스 행과 같음), 프레임 `Hash` | 조정(2026-10-30 user): 이름을 한 단계 굵게 해 보조 줄과 위계를 나눈다 |
| 행 강조 | 키보드·포인터 강조는 `interaction-row-hover` = `affordance-subtle`, 보조 글자는 `text-subtle` 그대로 | 활성 행(`aria-selected`)에 `--affordance-selected`(neutral-3) | 조정(2026-10-30 user, critique): Buzz 값(흰 바탕 대비 1.09:1)은 Enter로 열릴 대상의 유일한 표시로 너무 옅다. 한 단계 진한 선택 역할을 쓴다(1.23:1, 출시된 Quick Open의 neutral-3과 같다). 공용 메뉴 강조(`--affordance-floating-hover`)보다 한 단계 진하다 |
| 맞은 글자 | 1px 밑줄, offset 2px, 배경·색 상속 | 같은 값(offset `--space-half`) | 없음 |
| 빈 결과 | body-sm, `text-subtle`, 좌우 control inset, 목록 위쪽 한 줄. 빈 결과는 검색을 넓히는 방법을 설명한다(Buzz DESIGN.md 284-290행) | 같은 글자 값. 고정 높이 목록의 너비·높이를 채우고 가로·세로 가운데 정렬한다. 문구는 아래 '필터 탭' | 조정(2026-10-30 user): 가운데 정렬은 초안 9차. All 탭의 기존 네 문구는 바꾸지 않고, 넓히는 방법은 종류 탭의 덧붙임 문구만 보인다 |
| 등장 모션 | `motion="default"`: 0.75rem 상승, 220ms. 퇴장 0.25rem·120ms는 컴포넌트를 마운트한 채 둘 때만 보인다(DESIGN.md 1216행) | `.doan-dialog` 등장 규칙과 같은 값. 퇴장은 보이지 않는다(닫으면 App이 바로 unmount한다) | 등장만 같다. Buzz DESIGN.md 1218행은 검색 팔레트에 `motion="none"`을 권하지만 실제 코드(`PageSearch.tsx:185`)는 `default`다. 출하된 코드를 따른다 |

### 결과 행 내용

- 첫 줄: 이름(`result.label`) + 맞은 글자 밑줄. 넘치면 끝을 줄이고 `title`에 전체 이름을 둔다.
- 둘째 줄(보조): 캔버스는 `<.doan/canvases/ 뒤 경로>`, 프레임은 `<캔버스 이름> › <번호>`. 번호와 이름은 `canvasTree`의 `frameLabel`에서만 받는다(후속 buzz-canvas가 바꿀 때 한 곳만 고치게). 넘치면 끝을 줄이고 `title`에 전체를 둔다.
- option의 접근성 이름은 지금과 같은 문자열(`이름 — 맥락 · 프로젝트`)을 `aria-label`로 둔다. 테스트와 DESIGN.md 접근성 표가 이 이름을 쓴다. 화면 텍스트에는 프로젝트가 없으므로 `aria-label`이 필요하다.

### 결과 그룹 (2026-10-30 user, 초안 5·6차)

- root 하나가 한 그룹이다. 같은 저장소의 다른 워크트리는 따로 묶는다. 제목 텍스트는 `projectWhere`가 만드는 이름이다(`acme-web · main`, `acme-web · feat-billing`, 깃 밖 폴더는 폴더 이름).
- 썸네일: 이름 앞에 LNB·Home 프로젝트 선택기와 같은 `.shell-thumbnail`(16px)을 둔다. 색과 글자는 저장소 이름으로 정한다(`projectHue(name)`, `projectInitial(name)`). 그래서 `projectWhere`가 `{ name, title }`을 돌려주게 넓힌다(`name`은 LNB가 쓰는 `card.name`과 같은 저장소 이름). 같은 저장소의 워크트리 그룹은 같은 썸네일이다. 썸네일 함수와 클래스는 import해서 쓰고 복사하지 않는다(후속 buzz-project가 규칙을 바꾸면 따라 바뀌게).
- 순서: `searchMatch`의 삽입 정렬은 (점수 내림차순, 근접도 오름차순, 인덱스 순)으로 안정적이다(`quickOpen.ts:113-117`). 그래서 각 root가 결과에 처음 나오는 행이 그 그룹의 최고 일치이고, 처음 나온 순서대로 root를 묶으면 '그룹 안 최고 점수 → 근접도 → 기존 순서'와 같다. 그룹 안 행은 기존 순서를 지킨다. 첫 행은 늘 전체 최고 일치다.
- 빈 검색어: 결과가 저장 순서이므로 root별로 저장 순서대로 묶인다. 워크스페이스는 현재 root 하나라 그룹도 하나다.
- 화면 순서: 그룹을 펼친 평탄 배열이 화면 순서다. 활성 행, ↑/↓, Enter, option id, `aria-activedescendant`는 모두 이 배열을 쓴다. 제목은 활성 대상이 아니다.
- 접근성: listbox 안에 `role="group"` `aria-labelledby`=제목 id. 제목은 id가 있는 `div`다(listbox와 group은 option만 소유할 수 있어서 heading을 두지 않는다). 제목 id는 그룹 순번이 아니라 root에서 만든다(같은 이름 폴더 둘이 다른 id를 갖게).

### 활성 행 (feature-review)

- 활성 행은 인덱스가 아니라 결과 키(`resultKey`: root + path + 프레임이면 frameId와 frameIndex)로 기억한다. entries나 `rendered`가 바뀌어 결과가 다시 계산되면 같은 키의 행이 활성으로 남고, 없으면 첫 행이 활성이 된다.
- option id도 결과 키로 만든다(`${id}-${hash(key)}` 같은 안정 id). 그래서 결과가 바뀌어도 `aria-activedescendant`가 가리키는 행과 화면 강조가 같다.
- 검색어나 탭이 바뀌면 첫 행이 활성이 되고 목록 `scrollTop`을 0으로 둔다.

### 필터 탭 (2026-10-30 user)

- 탭: `All`(기본) / `Canvases` / `Frames`. 탭마다 14px 아이콘을 앞에 둔다: `All` lucide `Layers`, `Canvases` `Palette`, `Frames` `Hash`(행 아이콘과 같다). 크기·간격은 Home 그룹 탭 규칙(`.group-tabs.shell-modes svg` `--size-icon-sm`, 간격 `--space-1h`)이다(초안 8차). `LayoutGrid`는 헤더 Projects와 Overview가 이미 써서 피했다. Quick Open을 열 때마다 `All`이다. 고른 탭은 기억하지 않는다.
- 거르기: 탭은 50개 상한 **전에** 종류를 거른다. 그래서 다른 종류 결과가 상한을 채워 탭이 비는 일이 없다. 순위 규칙은 각 탭 안에서 그대로다.
- 빈 검색어: `All`과 `Canvases`는 지금 규칙(워크스페이스는 현재 root, Home은 전체 캔버스, 저장 순서)이다. `Frames`는 같은 범위의 프레임을 저장 순서로 보인다(최대 50개). 워크스페이스에서는 열린 캔버스(`rendered`의 root·path가 현재 root에 있을 때)의 프레임이 먼저이고, 그 프레임은 렌더링된 프레임이다. Home은 열린 캔버스 우선이 없다. `rendered`가 남아 있어도 무시한다(feature-review). Home은 저장 순서의 앞 50개만 보이며, 승격 때 PRODUCT §5에 적는다.
- 키보드·포커스: 탭 목록은 고른 탭 하나만 Tab 정지점이고 ←/→로 옮긴다(Home 그룹 탭의 `tabKey`). 탭에서 ↓를 누르면 입력으로 포커스가 돌아가고 첫 행이 활성이 된다(feature-review). Tab 정지점은 입력과 탭 목록 둘이다. 입력에서 Tab이면 탭 목록으로, 탭 목록에서 Tab 또는 Shift+Tab이면 입력으로 간다. ↑/↓/Enter는 입력에서만 목록을 움직인다.
- 접근성: `role="tablist"` `aria-label="Result types"`, 각 탭 `role="tab"` `aria-selected` `aria-controls`=결과 listbox. ARIA tabs 패턴의 `tabpanel` 대신 listbox를 가리킨다. 탭이 패널을 바꾸지 않고 같은 목록을 거르기 때문이다.
- 빈 결과 문구:
  - 검색어가 있고 결과가 없으면 `All` "No canvases or frames match"(기존), `Canvases` "No canvases match", `Frames` "No frames match".
  - 종류 탭이 모든 결과를 가렸고 다른 종류에는 결과가 있으면 그 수와 위치를 덧붙인다: "No frames match. 1 canvas matches in All.", "No canvases match. 2 frames match in All.", "… 50+ frames match in All." 수는 상한 없이 세고(`countMatches`), 50을 넘으면 "50+"다. 단수(1)와 복수는 명사와 동사를 함께 바꾼다(critique·harden: 필터가 모두 가린 상태를 '결과 없음'과 구분한다).
  - 검색어가 없고 범위에 프레임이 없으면 `Frames` "No frames to show".
  - 읽는 중·사용할 수 없는 프로젝트 문구는 탭과 관계없이 기존 문구이고, "No frames to show"보다 먼저다.

### 바깥 클릭과 포커스 (2026-10-30 user, feature-review)

- 바깥 판정: 네이티브 모달에서는 backdrop을 눌러도, 다이얼로그 패딩을 눌러도 `event.target`이 `<dialog>` 자신이다. 그래서 다이얼로그 테두리 사각형으로 판정한다. 주 버튼(`button === 0`)의 `pointerdown`과 `click`이 둘 다 사각형 밖일 때만 닫는다. 경계선 위는 안으로 본다.
- 헤더 띠: `.top`은 `-webkit-app-region: drag`(`styles.css:41`)이고 다이얼로그와 backdrop에는 `no-drag`가 없다. 그래서 헤더 띠 위를 누르면 창 드래그로 가고 Quick Open은 열려 있다. 이것을 결정으로 둔다(spec 확정 결정 3). 다이얼로그는 위 128px라 헤더와 겹치지 않고, 헤더 띠와 겹치는 것은 backdrop뿐이다.
- 포커스 유지: `<dialog>`의 `mousedown`에서 target이 입력이 아니면 `preventDefault()`를 한다. 이 한 곳으로 행·탭·패딩·그룹 제목·빈 상태 문구 클릭이 입력의 포커스를 빼앗지 않는다. 탭을 클릭한 뒤에는 입력에 `focus()`를 준다(Tab으로 탭에 있던 포커스가 tabIndex −1이 된 이전 탭에 남지 않게).

## 순수 함수 (`/tdd` 대상, 모두 `quickOpen.ts`)

1. `matchPositions(label: string, query: string): number[]` — 이름에서 검색어 토큰과 맞은 글자의 위치. 위치 단위는 코드포인트(`Array.from(label)`의 인덱스)다. 정규화는 검색과 같은 `searchText`(소문자 → NFC)다. `Array.from(searchText(label)).length`가 `Array.from(label).length`와 다르면(NFD 이름, "İ"처럼 소문자화로 길이가 바뀌는 글자) 빈 배열을 돌려 밑줄을 긋지 않는다. 토큰마다 `tokenScore`와 같은 우선순위로 한 곳을 고른다(접두어 → 단어 시작 → 부분 문자열의 첫 위치). 이름에 토큰이 없으면 그 토큰은 위치가 없다. 제목 없는 프레임은 이름이 id라서(`canvasTree.ts:53-55`) id로 맞아도 밑줄이 생긴다.
2. `markRuns(label: string, positions: readonly number[]): { text: string; match: boolean }[]` — 코드포인트 단위로 잘라 위치를 연속 구간으로 묶는다. 렌더러는 `match` 구간만 `<mark>`로 감싼다.
3. `searchMatch(index, query, currentRoot, commonOf, kind = "all", open?: { root: string; path: string })` 확장 — `kind: "all" | "canvas" | "frame"`으로 50개 상한 전에 거른다. 빈 검색어에서 `frame`이면 같은 범위의 프레임을 저장 순서로, `open`이 현재 root 안에 있으면 그 캔버스의 프레임 먼저 돌려준다. 기본값 덕분에 기존 네 인자 호출과 결과(반환 모양 포함)는 바뀌지 않는다.
4. `countMatches(index, query, kind: "canvas" | "frame"): number` — 상한 없이 그 종류의 일치 수를 센다(`tokenScore` 공유). 걸러진 결과가 비었을 때만 부른다.
5. `emptyText(kind, query, scope: readonly FolderEntry[], otherCount: number): string` — '필터 탭'의 빈 결과 문구를 고른다(읽는 중·사용할 수 없음이 먼저, 덧붙임, "50+", 단수·복수).
6. `groupResults(results, names: ReadonlyMap<string, { name: string; title: string }>): { root; name; title; rows }[]` — 처음 나온 순서로 root별로 묶고 그룹 안 순서를 지킨다. 화면 순서는 `rows`를 이어 붙인 것이다.
7. `resultKey(result): string`, `resultParts(result, title): { icon: "canvas" | "frame"; name; detail; accessibleName }` — `resultParts`는 지금의 `glyph`·`context`·`where` 조합을 대체한다. `accessibleName`은 지금 option 텍스트와 같다.
8. `outsideDialog(rect, down: { x; y; button }, up: { x; y }): boolean` — 위 '바깥 클릭과 포커스'의 판정(주 버튼, 둘 다 밖, 경계선은 안).

## 포맷·컨벤션·결정 영향

- **포맷**: 없음. JSON Schema와 `v` 변화 없음.
- **컨벤션(ARCHITECTURE §1)·`doan check` 규칙**: 없음.
- **구조 결정**: 서빙 범위, sandbox iframe, append-only 이벤트, 토큰 미처리, git 미조작과 무관하다.
- **제품 결정**: PRODUCT §5 항목 1의 검색 범위·매칭·`searchMatch` 순위는 그대로다. 바뀌는 것은 넷이다. (1) 2026-10-25 design-nav의 'Quick Open footer' 승인을 안내줄·`esc` 칩 제거로 대체한다. (2) "Escape closes and restores focus"에 바깥 클릭 닫기(헤더 띠 제외)가 더해진다. (3) 결과 종류 필터 탭, 빈 검색어 Frames 규칙, 탭별 빈 문구가 더해진다. (4) 결과가 프로젝트별 그룹으로 묶이고 활성 행이 결과 키로 유지된다. 넷 다 승격 때 PRODUCT §5 항목 1 문장과 §7에 날짜·근거로 적고, ARCHITECTURE §7 'Quick Open' 줄(`ARCHITECTURE.md:415`)도 고친다. 공통 결정 10의 buzz-ds 공유 요소 변경(검색 변형)은 §7과 부모 spec 공통 결정 10에 적는다.
- **PoC 의존**: 없다.

## 공용 다이얼로그와의 관계

`.doan-dialog`는 buzz-ds 소유 프리미티브다(공통 결정 10). 사용자가 검색 변형 추가를 승인했다(2026-10-30).

- `<dialog className="doan-dialog qo" data-ui-presentation="search">`. `ds/surfaces.css`에 `.doan-dialog[data-ui-presentation="search"]` 규칙을 더한다: 패딩 `--space-3`(네 방향), 모서리 `calc(--radius-panel + --space-1)`, 배경 `--surface-panel`, `corner-shape: squircle`, 열린 상태 `gap: 0`. 폭·위치(위 128px, 640px)·backdrop·등장 모션은 기본 `.doan-dialog` 그대로 쓴다. 기본 규칙의 값(위 128px, 640px, 상승 12px·220ms)이 Buzz 검색 팔레트(8rem, 40rem, 0.75rem)와 같기 때문이다. 명시도 (0,2,0)이라 480px 미디어쿼리의 `.doan-dialog { padding }`도 이긴다.
- 위 패딩: Buzz는 다이얼로그 위 패딩을 0으로 두고 본문 스크롤 영역이 12px을 가진다. doan에는 따로 스크롤되는 본문이 없으므로 다이얼로그가 네 방향 12px을 가진다. 보이는 위치는 같다.
- 테두리·그림자: Buzz search presentation은 base 다이얼로그의 1px `border-standard`와 `shadow-sm`을 덮지 않는다(overlays.css 26-33행). doan 기본 `.doan-dialog`의 같은 값을 그대로 쓴다.
- `.qo`에는 입력·탭·목록·행처럼 Quick Open 내용 규칙만 남긴다. 표면(위치·폭·모서리·배경·테두리·그림자·backdrop) 규칙은 `.qo`에서 지운다.
- 기존 사용처는 `data-ui-presentation`이 없으므로 영향이 없다. 사용처 목록은 `rg -n 'doan-dialog' app/src/renderer`로 확인한다.

## 초안 (`/design-draft`)

- 경로와 id: `.doan/canvases/buzz-search.html`, `doan:canvas` `buzz-search`, `doan:width` 2560.
- 프레임(모두 새 프레임, `/design-sync` 비교 대상):
  - `results` — 워크스페이스, 검색어 "card", 캔버스·프레임 섞임, 첫 행 활성, 맞은 글자 밑줄, 긴 이름과 긴 경로의 줄임, 목록 스크롤
  - `results-frames` — `results`와 같은 검색어에 Frames 탭
  - `empty-query-home` — Home, 빈 검색어, 프로젝트별 그룹
  - `empty-query-workspace` — 워크스페이스, 빈 검색어, 현재 프로젝트의 캔버스
  - `empty-query-frames` — 워크스페이스, 빈 검색어, Frames 탭, 열린 캔버스의 프레임 먼저
  - `no-match`, `no-match-frames`, `reading`, `unavailable`, `no-canvases` — 빈 상태. 창 없이 다이얼로그만 그린 타일
- 제약: 배경의 헤더·LNB는 main 화면 복사본이다. 그 아래 Home·워크스페이스 본문은 scrim 아래라 단순화하고 비교하지 않는다.
- 토큰 없는 값(컴포넌트 상수): 행 최소 높이 44px(Buzz `2.75rem`), 아이콘 21px(Buzz `PageIcon size={21}`), 행 사이 1px(`navigation-section-rows` gap), 결과 높이 상한 576px, 최소 400px, 초안 한정 결과 높이 429px(780px 창의 `55dvh`), 테두리·밑줄 1px.
- 이력 (모두 2026-10-30 user):
  - 사용자가 feature-review보다 초안 확정을 먼저 하기로 했다.
  - 1차: Buzz 팔레트 입력에 포커스 테두리를 늘 그려서 높고 각진 상자로 보였다. Buzz는 이 테두리를 키보드 탐색 모드에서만 보인다.
  - 2·3차: A(Buzz 팔레트 입력, 78px, `body-lg`, 테두리 투명)와 B(공용 `.doan-input`과 돋보기)를 나란히 그렸고, 사용자가 B를 골랐다.
  - 4차: 필터 탭과 결과 이름 500.
  - 5·6차: 프로젝트(root) 그룹과 썸네일.
  - 7차: 고정 높이와 최소 400px. 8차: 탭 아이콘. 9차: 빈 문구 가운데 정렬.
  - 10차(`harden`·`critique` 점검): 활성 행 `--affordance-selected`, 그룹 제목 `--text-metadata`, 높이 상한 576px, 덧붙임 문구. 점검 5번(Home 일부 프로젝트 읽는 중의 결과 누락 표시)은 PRODUCT §8 후속으로 남긴다.
  - **확정**: 10차 초안(`c56a544f`, 기록 `df23dd4f`). 렌더링 근거는 Chrome headless 캡처다(Electron 실제 렌더링은 `/design-sync`에서 측정한다). 이 초안은 이 자식이 main에 병합될 때까지 정본이다.
  - feature-review 반영(11차): 그룹 제목 `h2` → id가 있는 `div`, 목록 `tabindex="-1"`·`overscroll-behavior: contain`. 화면 모양은 그대로다.

## 가져오지 않는 것

- 결과 높이 180ms 전환(`SearchChoices.tsx`의 ResizeObserver 측정). 목록이 고정 높이라 바뀔 높이가 없다.
- 퇴장 모션. 지금처럼 닫으면 바로 unmount한다.
- 헤더 띠(타이틀바) 클릭 닫기. 부모 '가져오지 않는 Buzz 동작'.
- Shift+Cmd+1~9, 지우기 버튼, 범위·작성자 칩, 인라인 설정 행, 검색 사용 기록 순위(spec 비목표).
- 보이지 않는 다이얼로그 제목. doan은 지금처럼 `aria-label="Quick Open"`을 쓴다.

## POSTMORTEM 함정

- **2026-10-24 — Focus did not return to the row when Set Up… closed from outside**: 모달 뒤 콘텐츠에 포커스를 주지 않는다. 다이얼로그를 닫은 뒤 포커스를 돌린다. 지금 `dismiss`의 순서(`close()` → `opener.focus()`)를 바꾸지 않고, 바깥 클릭도 같은 `dismiss()`를 쓴다. 마크업 래퍼를 바꿀 때 `showModal` 호출 위치를 유지한다.
- **2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking**: 다른 모달 위에 쌓일 수 있는 층은 모달로 쌓는다. Quick Open은 이미 `showModal`이고 다른 모달이 있으면 명령이 비활성이다. 키는 입력에서 처리하므로, 탭·빈 곳 클릭 뒤에도 포커스가 입력에 남는지 probe로 본다.
- **2026-10-25 — Production CSS extraction concealed missing development styles**: CSS는 `styles.css`·`ds/surfaces.css`에만 두고 JS에서 import하지 않는다. 개발·프로덕션 빌드 모두에서 행 `min-height`, 입력 배경·높이, `mark`의 `text-decoration`을 확인한다.
- **projects-home checklist**: 초안의 `overflow`를 그대로 옮기지 않는다. 50개 결과로 목록 끝까지 스크롤되는지 실제 앱에서 확인한다.
- **cascade layer / 옛 규칙**: 대체한 `.qo*` 규칙은 지운다(부모 'CSS를 싣는 방법').
- IME: `isComposing` 중 키를 무시하는 현재 처리를 유지한다.
