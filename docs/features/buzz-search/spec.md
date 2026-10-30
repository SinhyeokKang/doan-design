# buzz-search — spec

부모 [buzz-restyle](../buzz-restyle/spec.md)의 자식 4번이다. Quick Open(Cmd+K) 다이얼로그의 표면, 입력창, 필터 탭, 결과 그룹과 행, 빈 상태를 Buzz 전역 검색 팔레트를 레퍼런스로 다시 만든다. 선행 `buzz-shell`은 main에 병합됐다(PR #30). 부모 공통 결정 1~14를 따른다.

## 사용자

- **사람(앱 사용자)**: Home이나 워크스페이스에서 Cmd+K, Go > Quick Open…, LNB의 Search 버튼으로 Quick Open을 열고, 캔버스와 프레임을 찾아 연다. 모양, 결과 묶음, 종류 필터, 바깥 클릭 닫기가 바뀐다.
- **에이전트**: 바뀌는 것이 없다. CLI, MCP, 스킬, 공유 포맷은 그대로다.

## 확정한 결정 (2026-10-30 user)

1. 키 안내줄과 `esc` 칩: 둘 다 없앤다. 2026-10-25 design-nav의 'Quick Open footer' 승인을 대체한다.
2. 결과 그룹: 처음에는 그룹 없이 한 목록으로 정했다가, 초안 5차에서 프로젝트(root) 단위 그룹으로 바꿨다. 그룹 제목은 프로젝트 썸네일과 이름이다. 그룹 순서는 그룹 안 최고 일치 순이다(design.md '결과 그룹').
3. 바깥 클릭: 닫는다. Quick Open에만 적용한다. 56px 헤더 띠 위 클릭은 닫지 않고 창 드래그로 둔다(feature-review). 부모 '가져오지 않는 Buzz 동작'의 타이틀바 클릭 닫기와 같은 판단이다.
4. 표면: 공용 `.doan-dialog`에 검색 변형을 더해 쓴다(공통 결정 10에 따른 buzz-ds 프리미티브 변경 승인).
5. 입력창(초안 비교): Buzz 팔레트 입력 대신 공용 `.doan-input`과 앞쪽 돋보기를 쓴다.
6. 필터 탭: 입력과 목록 사이에 `All` / `Canvases` / `Frames`, 탭마다 아이콘. 빈 검색어의 Frames 탭은 같은 범위의 프레임을 보이고, 워크스페이스에서만 열린 캔버스의 프레임이 먼저다(Home은 저장 순서, feature-review). 탭에서 ↓를 누르면 입력으로 돌아간다(feature-review).
7. 결과 이름은 500(medium)으로 한 단계 굵게 한다.
8. 결과 목록은 고정 높이다(`min(55dvh, 576px)`, 최소 400px). 창이 작으면 남은 높이로 줄여 다이얼로그 자체는 스크롤되지 않는다(feature-review).
9. 활성 행은 결과 키로 기억한다. Quick Open이 열린 채로 결과가 바뀌어도 보던 행이 활성으로 남고, 그 행이 사라지면 첫 행이 활성이 된다(feature-review).
10. `harden`·`critique` 점검 반영: 활성 행 `--affordance-selected`, 그룹 제목 `--text-metadata`, 필터가 모든 결과를 가렸을 때의 덧붙임 문구.
11. 부모 spec 공통 결정 10에 검색 변형을 적는 일은 이 자식의 PR에서 한다(feature-review, 공통 결정 14).

## 문제 (관찰한 사실, 2026-10-30 main `17adca69`)

- Quick Open은 design-nav(2026-10-25) 구성 그대로다. 다이얼로그 너비 560px, 창 위에서 64px, 모서리 12px, 1px 테두리다(`styles.css:536`). Buzz 검색 팔레트는 표준 다이얼로그 폭 40rem(640px), 위 8rem(128px), 모서리 32px(`radius-panel` + 4px), 패널 표면이다. 1px 테두리와 `shadow-sm`은 base 다이얼로그 값 그대로다.
- 입력줄은 14px 글자에 글리프 `⌕`, 오른쪽 `esc` 키 칩, 아래 구분선이 있다.
- 결과 행은 30px 한 줄에 12.5px 글자다. 글리프 문자(`◧`, `#`), 이름, ` — 경로`, ` · 프로젝트`가 한 줄로 이어진다(`QuickOpenDialog.tsx:18-26`). Buzz 결과 행은 최소 44px, 12px 패딩, 20px 모서리, 24px 아이콘 칸, 이름과 보조 정보의 두 줄이다.
- 활성 행 배경은 `--surface-navigation-selected`다. 목록 아래에 `↑↓ to move · ↩ to open · esc to close` 안내줄(10.5px)이 있다. Buzz에는 안내줄이 없다.
- 크기와 글자 값이 토큰이 아닌 고정 px(12.5px, 11.5px, 10.5px, 30px, 6px)로 적혀 있다.
- 활성 행은 인덱스로 기억한다(`QuickOpenDialog.tsx:59`). 열린 채로 결과가 바뀌면 Enter가 보던 것과 다른 결과를 열 수 있다.
- [DESIGN.md 'Design navigation'](../../DESIGN.md) 절의 Quick Open 값은 다크 테마 시절 측정값이고, "buzz-ds 이전" 표시가 붙어 있다. 이 절의 Quick Open 부분은 이 자식 담당이다(부모 design.md 'DESIGN.md 절과 담당').

## 완료 조건

1. Quick Open 다이얼로그가 확정 초안 `.doan/canvases/buzz-search.html`과 일치한다. 확인: `/design-sync` 측정에서 초안과 구현의 computed style 차이가 0이거나 DESIGN.md에 근거와 함께 기록된 차이만 남는다.
2. 고르는 결과와 그 순위는 그대로다. `searchMatch`가 고르는 결과(저장된 정상 프로젝트·워크트리 전체, NFC·대소문자 무시 토큰 매칭, 점수 → 현재 root → 같은 저장소 → 다른 저장소 순위, 최대 50개, 빈 검색어 규칙)는 All·Canvases 탭에서 바뀌지 않는다. 화면 순서는 그 순위를 root로 묶은 순서이고, 첫 행은 늘 전체 최고 일치다. ↑/↓·Enter·`aria-activedescendant`는 화면 순서를 따른다. 확인: 기존 `quickOpen.test.ts`의 순위 단언이 수정 없이 통과하고, 렌더 테스트에서 두 번째 그룹 첫 행의 id와 `aria-activedescendant`가 화면 순서를 따른다.
3. 그 밖의 기존 동작이 그대로다. ↑/↓ 순환·Enter·Escape, IME 조합 중 키 무시, 포커스 복귀, 다른 모달이 열려 있을 때 비활성, Quick Open이 열려 있을 때 Cmd+K는 아무것도 하지 않음(메뉴 비활성, `menuState.ts:21`), 고른 결과의 jump/open/switch 처리. 확인: `QuickOpenDialog.test.tsx`의 역할·이름·키·빈 상태 문구 단언이 그대로 통과한다(안내줄 단언, `resultParts` 모양, 행 마크업 단언만 바꾼다). probe로 Cmd+K → 입력 → Enter → 캔버스 열림, Escape → 연 곳으로 포커스 복귀를 확인한다.
4. 접근성 이름과 역할이 유지된다. `dialog` "Quick Open"(modal), `combobox` "Search canvases and frames", `listbox` "Results", 결과 `option`(접근성 이름은 지금 문자열 `이름 — 맥락 · 프로젝트`), 빈 결과 polite `status`. 새로 `tablist` "Result types"와 listbox 안 `group`(제목으로 이름, heading이 아님)이 생긴다. 확인: 렌더 테스트의 역할·이름 단언, probe에서 접근성 트리 확인.
5. 결과 이름에서 검색어와 맞은 글자에 밑줄이 그어지고, 행의 접근성 이름은 바뀌지 않는다. 확인: `matchPositions`·`markRuns` 단위 테스트, 렌더 테스트에서 `<mark>` 위치와 option 이름 확인.
6. 결과는 root마다 한 그룹이고, 제목은 프로젝트 썸네일과 지금 행 끝에 붙던 프로젝트 이름(`<저장소> · <브랜치>` 또는 폴더 이름)이다. 그룹 순서는 각 root가 결과에 처음 나오는 순서다. 이는 그룹 안 최고 점수 → 근접도 → 기존 결과 순서와 같다. 그룹 안 행은 기존 순서를 지킨다. 빈 검색어는 저장 순서의 root별 그룹이다. 확인: `groupResults` 단위 테스트, 렌더 테스트의 `role="group"`과 제목.
7. 필터 탭 `All`/`Canvases`/`Frames`가 입력 아래에 있고, 열 때마다 `All`이다. 탭은 50개 상한 전에 종류를 거르고, 각 탭 안의 순위는 기존 규칙이다. 빈 검색어의 `Frames`는 같은 범위의 프레임을 저장 순서로 보이고, 워크스페이스에서는 열린 캔버스의 프레임이 먼저다. 탭을 바꾸면 검색어는 그대로, 첫 행이 활성, 목록 스크롤은 맨 위다. 탭에서 ↓를 누르면 입력으로 포커스가 돌아간다. 탭별 빈 결과 문구와 덧붙임 문구는 design.md '필터 탭'대로다. 확인: `searchMatch` 종류 필터·빈 검색어 Frames, `countMatches`, `emptyText` 단위 테스트, 렌더 테스트의 tablist 역할·`aria-selected`, probe에서 탭 클릭 뒤 입력 포커스 유지, ←/→, 탭에서 ↓, Tab 순환(입력 ↔ 탭 목록).
8. 입력은 공용 `.doan-input` 기본 크기와 앞쪽 돋보기이고, 결과 이름은 `--type-weight-medium`, 활성 행은 `--affordance-selected`, 그룹 제목은 `--text-metadata`다. 키 안내줄과 `esc` 칩은 없다. 확인: `/design-sync` 측정, 렌더 테스트에 `.qo-foot`·`esc` 칩이 없다.
9. 결과 목록은 고정 높이 `min(55dvh, 576px)`, 최소 400px이고, 창에 남은 높이가 그보다 작으면 남은 높이로 줄어 다이얼로그 자체는 스크롤되지 않는다. 확인: `/design-sync`의 780px 창 측정, probe에서 600px 창의 다이얼로그 `scrollHeight`가 `clientHeight`와 같다.
10. Quick Open이 열린 채로 결과가 바뀌어도 활성 행은 같은 결과(root·path·frame)에 남고, 그 결과가 사라지면 첫 행이 활성이 된다. 확인: 렌더 테스트에서 entries를 바꾼 뒤의 활성 행.
11. 다이얼로그 바깥(헤더 띠 아래 backdrop)을 주 버튼으로 누르고 뗀 클릭이 Escape와 같은 경로로 Quick Open을 닫고 연 곳으로 포커스를 돌린다. 다이얼로그 안에서 누르고 바깥에서 뗀 경우, 바깥에서 누르고 안에서 뗀 경우, 주 버튼이 아닌 클릭은 닫지 않는다. 헤더 띠 위 클릭은 창 드래그로 간다. 다른 다이얼로그의 닫기 동작은 바뀌지 않는다. 확인: `outsideDialog` 단위 테스트, probe에서 바깥 클릭 닫기와 포커스 복귀, 안에서 누르고 밖에서 뗀 경우.
12. 다이얼로그 안의 빈 곳(패딩, 그룹 제목, 빈 상태 문구)이나 탭을 클릭해도 입력이 포커스를 잃지 않는다. 확인: probe.
13. 빈 상태(검색어 불일치, 종류 탭 불일치와 덧붙임, 읽는 중, 사용할 수 없는 프로젝트, 캔버스 없음, 프레임 없음)가 목록 가운데에 보인다. All 탭의 기존 네 문구는 그대로다. 확인: `/design-sync`의 `no-match`·`no-match-frames`·`reading`·`unavailable`·`no-canvases` 프레임 측정, `emptyText` 단위 테스트.
14. Quick Open 표면이 공용 `.doan-dialog`의 검색 변형(`data-ui-presentation="search"`)을 쓰고, 기존 `.doan-dialog` 사용처의 크기·동작은 그대로다. 확인: `ds/surfaces.css`에 변형 규칙이 있고, 기존 다이얼로그 하나(Add Projects)의 표면 속성이 main 빌드 측정값과 같다.
15. Quick Open 규칙에 고정 px 글자·크기 대신 doan 토큰을 쓰고, 대체된 `.qo*` 옛 규칙이 남지 않는다. 확인: `grep -nE '^\.qo[^{]*\{[^}]*(12\.5|11\.5|10\.5)px|\.qo-foot|^\.qo(::backdrop)? \{' app/src/renderer/styles.css` 결과 없음.
16. 결론이 승격됐다. PRODUCT §5 항목 1 Quick Open 문단과 §7(이 feature의 결정, 2026-10-25 'Quick Open footer' 행의 superseded 표시), §8(Home 일부 프로젝트 읽는 중의 결과 누락 표시), ARCHITECTURE §7 'Quick Open' 줄, 부모 spec 공통 결정 10, DESIGN.md 'Design navigation' 절의 Quick Open 부분. 확인: tasks Z의 각 grep.
17. `node .agents/skills/verify/scripts/verify.mjs` 통과.

## 비목표

- 검색 범위·매칭·`searchMatch` 순위 규칙 변경, 결과 종류 추가(설정, 명령, 프로젝트 자체 등). 필터 탭은 기존 두 종류(캔버스·프레임)를 거를 뿐이다. Buzz의 페이지·메시지·사람 검색, 검색 연산자(`from:`), 범위 칩, 인라인 설정 행은 doan에 대응하는 대상이 없다.
- Buzz의 Shift+Cmd+1~9 결과 바로 열기, 탭 전환 단축키. 새 단축키라 기존 기능 보존(공통 결정 6) 밖이다.
- 입력창 지우기(×) 버튼. doan에는 지우기 동작이 없다.
- 헤더 띠 위 클릭으로 닫기. 헤더 드래그 영역은 buzz-shell 소유다.
- LNB의 Search 진입 버튼, Go 메뉴 항목, 단축키. buzz-shell 소유다.
- 공용 `.doan-dialog` 프리미티브의 기존 크기·동작 변경. 검색 변형 추가만 한다.
- 종류별 그룹 제목. 종류는 필터 탭이 맡는다.
- Home에서 일부 프로젝트를 아직 읽는 중일 때 결과가 빠졌다는 표시. PRODUCT §8 후속으로 남긴다.
- 퇴장 모션. 지금처럼 닫으면 바로 사라진다.
- 입력창 오른쪽 클릭 편집 메뉴(부모 tasks '앱 전체 후속').
- 기존 `.doan/canvases/design-nav.html`의 `quick-open` 프레임 갱신(공통 결정 11).
