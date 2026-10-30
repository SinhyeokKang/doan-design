# buzz-search — tasks

순서: 초안 → 순수 함수 → 마크업 → CSS → 대조 → 승격. 포맷 변경이 없어 schema·fixture 단계는 없다. 진행 경로는 `/ship`이다(한 화면, 렌더러만).

## D. 초안 (`/design-draft`, 구현 전)

- [ ] D1. `.doan/canvases/buzz-search.html`에 Quick Open 초안을 새 파일로 그린다. 프레임: 결과 있음(캔버스·프레임 섞임, 활성 행, 맞은 글자 밑줄, 긴 경로로 둘째 줄 줄임), 빈 검색어(Home·워크스페이스), 빈 상태 네 가지, 키보드 포커스 입력. Home과 워크스페이스 위에 띄운 모습 하나씩. 검색 변형의 테두리·그림자는 design.md '공용 다이얼로그와의 관계'대로 Buzz `overlays.css` base 규칙을 다시 읽고 정한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`에 이 파일의 오류가 없고 `go run ./cli/cmd/doan ls --repo .`에 프레임이 나온다. 사용자가 앱에서 초안을 확인한다.

── commit: `docs(canvas): add buzz-search draft` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `matchPositions`·`markRuns`(design.md '순수 함수' 1·2) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 접두어·단어 시작·부분 문자열, 여러 토큰, 대소문자, NFC 입력과 NFD 이름, 이름이 아닌 필드로만 맞은 경우, 빈 검색어.
  - 검증: `npm --prefix app test` 통과(새 테스트가 구현 전 red였음을 기록).
- [ ] T2. `searchMatch` 종류 필터와 빈 검색어 프레임 목록, `emptyText`(design.md '순수 함수' 3) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 상한 전 거르기(다른 종류가 50개를 넘는 인덱스), 탭별 순위 유지, 빈 검색어 Frames의 열린 캔버스 먼저·범위·50개, 탭별 빈 문구.
  - 검증: `npm --prefix app test` 통과, 기존 `quickOpen.test.ts` 순위 단언은 수정 없이 통과.
- [ ] T2c. `groupResults`(design.md '순수 함수' 4) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. `searchMatch`가 점수를 함께 돌려주게 넓히되 기존 순위 단언은 수정 없이 통과해야 한다.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T2b. `resultParts` 개편(design.md '순수 함수' 5). `accessibleName`이 지금 option 텍스트와 같음을 단언한다.
  - 검증: `npm --prefix app test` 통과, 기존 `quickOpen.test.ts` 순위 단언은 수정 없이 통과.
- [ ] T3. `outsideDialog`(design.md '순수 함수' 6) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: 사각형 안, 밖 네 방향, 경계선 위.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).

── commit: `feat(app): Quick Open match positions, row parts and outside test` ──

## U. 마크업과 CSS

- [ ] U1. `QuickOpenDialog.tsx` 마크업을 새 구성으로 바꾼다: `doan-dialog` 클래스와 `data-ui-presentation="search"`, 글리프·안내줄·`esc` 칩 제거, 결과 행 두 줄과 lucide 아이콘, `<mark>` 밑줄, 공용 `.doan-input`과 돋보기, 프로젝트 그룹과 제목, 필터 탭(Home 그룹 탭의 `tabKey` 재사용), `outsideDialog`를 쓴 바깥 클릭 닫기(`dismiss()` 경로). 역할·이름·키 처리·포커스 복귀 순서는 그대로다.
  - 검증: `npm --prefix app test`에서 `QuickOpenDialog.test.tsx`의 역할·이름·키·빈 상태 단언 통과(행 마크업 단언만 새 구조로 갱신, `.qo-foot`·`esc` 칩 없음 단언 추가), `npm --prefix app run typecheck` 통과.
- [ ] U2. `ds/surfaces.css`에 `.doan-dialog[data-ui-presentation="search"]` 변형을 더하고, `styles.css`의 `.qo*` 규칙을 design.md '화면 구성'의 내용 값으로 대체한다. `.qo`의 표면 규칙과 `.qo-foot` 규칙은 지운다.
  - 검증: `grep -nE '12\.5px|11\.5px|10\.5px|\.qo-foot' app/src/renderer/styles.css`에 Quick Open 규칙 없음, `npm --prefix app test`의 `ds/checks.test.ts` 통과, `npm --prefix app run build` 통과.

── commit: `feat(app): restyle Quick Open as the Buzz search palette` ──

## S. 대조와 실제 앱 확인

- [ ] S1. `/design-sync`로 초안과 구현을 computed style로 맞춘다(개발·프로덕션 빌드 둘 다에서 행·입력 확인). 남는 차이는 근거와 함께 DESIGN.md에 적는다.
  - 검증: `node .scratch/design-sync/buzz-search/measure.mjs` 결과에 기록되지 않은 차이 없음.
- [ ] S2. `/runtime-test`로 짧은 probe: Cmd+K → 입력 → Enter로 다른 프로젝트 캔버스 열림, 같은 캔버스 프레임 jump, Escape 뒤 연 곳으로 포커스 복귀, 50개 결과 끝까지 스크롤, IME 조합 중 Enter 무시, 바깥 클릭 닫기와 포커스 복귀(헤더 띠 위 backdrop 포함), 안에서 누르고 바깥에서 뗀 경우 열려 있음, 기존 다이얼로그 하나(예: Add Projects)의 표면 computed style 불변.
  - 검증: probe가 완료 표시와 함께 exit 0, 스크린샷 기록.
- [ ] S3. DESIGN.md 'Design navigation' 절의 Quick Open 행(외형·접근성)을 새 측정값으로 바꾸고, 그 절 "buzz-ds 이전" 표시의 담당 문장에서 buzz-search를 뺀다.
  - 검증: `grep -n 'buzz-search' docs/DESIGN.md`가 표시 문장에 없다.

── commit: `fix(app): align Quick Open with its draft` / `docs(design): record buzz-search measurements` ──

## Z. 승격과 정리

- [ ] Z1. `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] Z2. 결론 승격: PRODUCT §5 항목 1 Quick Open 문단에 바깥 클릭 닫기와 필터 탭(종류 필터, 빈 검색어 Frames 규칙)과 프로젝트 그룹(최고 점수 순)을 더한다. §7 결정 로그에 buzz-search 줄을 더한다(Buzz 기준 커밋 `c40dfdf4`와 참고 파일, 조정 항목, 2026-10-25 'Quick Open footer' 승인의 대체, 공통 결정 10에 따른 `.doan-dialog` 검색 변형 추가). 부모 spec 공통 결정 10에 검색 변형을 한 줄 더한다. ARCHITECTURE 변경 없음을 확인한다. 부모 [tasks.md](../buzz-restyle/tasks.md)의 C4 체크는 병합 뒤 다음 자식 시작 때 한다(부모 '자식 진행 규칙' 1).
  - 검증: `grep -n 'buzz-search' docs/PRODUCT.md`에 §7 줄이 있다.
- [ ] Z3. `docs/features/buzz-search/`를 지운다.
  - 검증: `ls docs/features/buzz-search` 실패.

── commit: `docs(product): promote buzz-search` / `docs(feature): complete buzz-search` ──
