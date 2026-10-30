# buzz-search — spec

부모 [buzz-restyle](../buzz-restyle/spec.md)의 자식 4번이다. Quick Open(Cmd+K) 다이얼로그의 내용, 입력창, 결과 행을 Buzz 전역 검색 팔레트의 값과 규칙으로 바꾼다. 선행 `buzz-shell`은 main에 병합됐다(PR #30). 부모 공통 결정 1~14를 따른다.

## 사용자

- **사람(앱 사용자)**: Home이나 워크스페이스에서 Cmd+K, Go > Quick Open…, LNB의 Search 버튼으로 Quick Open을 열고, 캔버스와 프레임을 찾아 연다. 보이는 모양과 결과 행 구성이 바뀐다.
- **에이전트**: 바뀌는 것이 없다. CLI, MCP, 스킬, 공유 포맷은 그대로다.

## 확정한 질문 (2026-10-30 user)

1. 키 안내줄과 `esc` 칩: 둘 다 없앤다. 2026-10-25 design-nav의 Quick Open 안내줄 승인을 대체한다(PRODUCT §7 기록).
2. 결과 그룹: 그룹 없이 한 목록. 종류는 행 아이콘으로 구분한다.
3. 바깥 클릭: 닫는다. Quick Open에만 적용한다.
4. 표면: 공용 `.doan-dialog`에 검색 변형을 더해 쓴다.
5. 입력창(초안 비교): Buzz 팔레트 입력 대신 공용 `.doan-input`과 앞쪽 돋보기를 쓴다.
6. 필터 탭: 입력과 목록 사이에 `All` / `Canvases` / `Frames`. 빈 검색어의 Frames 탭은 같은 범위의 프레임을 열린 캔버스 먼저 보인다.
7. 결과 이름은 500(medium)으로 한 단계 굵게 한다.

## 문제 (관찰한 사실, 2026-10-30 main `17adca69`)

- Quick Open은 design-nav(2026-10-25) 구성 그대로다. 다이얼로그 너비 560px, 창 위에서 64px, 모서리 12px, 1px 테두리다(`styles.css:536`). Buzz 검색 팔레트는 표준 다이얼로그 폭 40rem(640px), 위 8rem(128px), 모서리 32px(`radius-panel` + 4px), 테두리 없는 패널 표면이다.
- 입력줄은 14px 글자에 글리프 `⌕`, 오른쪽 `esc` 키 칩, 아래 구분선이 있다. Buzz는 돋보기 없이 20px `body-lg` 입력이고 구분선이 없다.
- 결과 행은 30px 한 줄에 12.5px 글자다. 글리프 문자(`◧`, `#`), 이름, ` — 경로`, ` · 프로젝트`가 한 줄로 이어진다(`QuickOpenDialog.tsx:18-26`). Buzz 결과 행은 최소 44px, 12px 패딩, 20px 모서리, 24px 아이콘 칸, 이름과 보조 정보의 두 줄이다.
- 활성 행 배경은 `--surface-navigation-selected`다. 목록 아래에 `↑↓ to move · ↩ to open · esc to close` 안내줄(10.5px)이 있다. Buzz에는 안내줄이 없다.
- 크기와 글자 값이 토큰이 아닌 고정 px(12.5px, 11.5px, 10.5px, 30px, 6px)로 적혀 있다.
- [DESIGN.md 'Design navigation'](../../DESIGN.md) 절의 Quick Open 값은 다크 테마 시절 측정값이고, "buzz-ds 이전" 표시가 붙어 있다. 이 절의 Quick Open 부분은 이 자식 담당이다(부모 design.md 'DESIGN.md 절과 담당').

## 완료 조건

1. Quick Open 다이얼로그가 새 초안 `.doan/canvases/buzz-search.html`과 일치한다. 확인: `/design-sync` 측정에서 초안과 구현의 computed style 차이가 0이거나 DESIGN.md에 근거와 함께 기록된 차이만 남는다.
2. 기존 동작이 그대로다. 검색 범위(저장된 정상 프로젝트·워크트리 전체), NFC·대소문자 무시 토큰 매칭, 점수 → 현재 root → 같은 저장소 → 다른 저장소 순위, 최대 50개, 빈 검색어의 결과, ↑/↓ 순환·Enter·Escape, IME 조합 중 키 무시, 포커스 복귀, 다른 모달이 열려 있을 때 비활성, 고른 결과의 jump/open/switch 처리. 확인: 기존 `quickOpen.test.ts`·`QuickOpenDialog.test.tsx`가 바뀌지 않은 채 통과하고(행 마크업 단언만 새 구조로 갱신), 짧은 실제 앱 probe로 Cmd+K → 입력 → Enter → 캔버스 열림, Escape → 연 곳으로 포커스 복귀를 확인한다.
3. 접근성 이름과 역할이 유지된다. `dialog` "Quick Open"(modal), `combobox` "Search canvases and frames", `listbox` "Results", 결과 `option`, 빈 결과 polite `status`. 확인: `QuickOpenDialog.test.tsx` 역할·이름 단언 통과, probe에서 접근성 트리 확인.
4. 결과 행 이름에서 검색어와 맞은 글자에 밑줄이 그어지고, 행의 접근성 이름은 바뀌지 않는다. 확인: 매칭 위치 순수 함수 단위 테스트, 렌더 테스트에서 `<mark>` 위치와 option 이름 확인.
5. Quick Open 규칙에 고정 px 글자·크기 대신 doan 토큰을 쓰고, 대체된 `.qo*` 옛 규칙이 남지 않는다. 확인: `grep -nE '12\.5px|11\.5px|10\.5px' app/src/renderer/styles.css`에 Quick Open 규칙이 없다.
6. 빈 상태 네 가지(검색어 불일치, 읽는 중, 사용할 수 없는 프로젝트, 캔버스 없음)가 새 모양으로 보이고 문구는 그대로다. 확인: 렌더 테스트와 초안의 해당 프레임.
7. 키 안내줄과 입력창 `esc` 칩이 없다(2026-10-30 user). 결과는 그룹 제목 없이 지금 순위의 한 목록이다(2026-10-30 user). 확인: 렌더 테스트에 `.qo-foot`·`esc` 칩·그룹 제목이 없다.
   - 필터 탭 `All`/`Canvases`/`Frames`가 입력 아래에 있고, 열 때마다 `All`이다. 탭은 50개 상한 전에 종류를 거르고, 각 탭 안의 순위는 기존 규칙이다. 빈 검색어의 `Frames`는 같은 범위의 프레임을 열린 캔버스 먼저 저장 순서로 보인다. 탭별 빈 결과 문구는 design.md '필터 탭'대로다(2026-10-30 user). 확인: `searchMatch` 종류 필터·빈 검색어 프레임 단위 테스트(기존 순위 테스트는 수정 없이 통과), 렌더 테스트의 tablist 역할·`aria-selected`, probe에서 탭 클릭 뒤 입력 포커스 유지와 ←/→ 이동.
   - 입력은 공용 `.doan-input` 기본 크기와 앞쪽 돋보기이고, 결과 이름은 `--type-weight-medium`이다. 확인: `/design-sync` 측정.
8. 다이얼로그 바깥(backdrop)을 누르고 뗀 클릭이 Escape와 같은 경로로 Quick Open을 닫고 연 곳으로 포커스를 돌린다. 다이얼로그 안에서 누르고 바깥에서 뗀 경우는 닫지 않는다(2026-10-30 user). 다른 다이얼로그의 닫기 동작은 바뀌지 않는다. 확인: 바깥 판정 순수 함수 단위 테스트, probe에서 바깥 클릭 닫기와 포커스 복귀.
9. Quick Open 표면이 공용 `.doan-dialog`의 검색 변형(`data-ui-presentation="search"`)을 쓴다(2026-10-30 user, 공통 결정 10에 따른 buzz-ds 프리미티브 변경 승인). 기존 `.doan-dialog` 크기·동작은 그대로다. 확인: `ds/surfaces.css`에 변형 규칙이 있고, 기존 다이얼로그(설정·프로젝트 추가 등)의 computed style이 변하지 않았음을 probe에서 대표 하나로 확인.
10. DESIGN.md 'Design navigation' 절의 Quick Open 행이 새 측정값으로 바뀌고, 그 절의 "buzz-ds 이전" 표시 범위에서 Quick Open이 빠진다(표시 자체는 buzz-project가 지운다). 확인: DESIGN.md diff.
11. `node .agents/skills/verify/scripts/verify.mjs` 통과.

## 비목표

- 검색 범위·매칭·순위 변경, 결과 종류 추가(설정, 명령, 프로젝트 자체 등). 필터 탭은 기존 두 종류(캔버스·프레임)를 거를 뿐이다. Buzz의 페이지·메시지·사람 검색, 검색 연산자(`from:`), 범위 칩, 인라인 설정 행은 doan에 대응하는 대상이 없다.
- Buzz의 Shift+Cmd+1~9 결과 바로 열기. 새 단축키라 기존 기능 보존(공통 결정 6) 밖이다.
- 입력창 지우기(×) 버튼. Buzz 팔레트는 지우기 칸을 두지만 doan에는 지우기 동작이 없다.
- LNB의 Search 진입 버튼, Go 메뉴 항목, 단축키. buzz-shell 소유다.
- 공용 `.doan-dialog` 프리미티브의 기존 크기·동작 변경. 검색 변형 추가만 한다(공통 결정 10, buzz-ds 소유).
- 결과 그룹 제목(종류별·프로젝트별). 그룹으로 나누면 결정된 순위(PRODUCT §5 항목 1)가 바뀐다.
- 입력창 오른쪽 클릭 편집 메뉴(부모 tasks '앱 전체 후속').
- 기존 `.doan/canvases/design-nav.html`의 `quick-open` 프레임 갱신(공통 결정 11).
