# composer 목록 hanging indent — tasks

순서: PoC → 시안 → 순수 함수 → 입력란(DOM·편집) → 사람 확인 → `/design-sync` → 문서 승격. 포맷 변경이 없어서 스키마 단계는 없다. 커밋은 `/ship` 순서를 따른다: 시안(develop) → test 하나 → 구현 하나 → `/design-sync` 자체 커밋 → 문서별 docs 커밋. 선행 조건: composer 스크롤 수정 PR(`fix/composer-scroll-and-list-indent`, Change 1)이 develop에 머지된 뒤 구현한다(`chipField.ts`가 겹친다).

1. **PoC**: `.scratch/composer-indent/`의 프로브4를 이어, 줄 블록 + 숨긴 줄바꿈 + inline 마커 구조를 `app/runtime/electronDom.ts`로 확인한다. 실제 shipped CSS 값과 296px 폭, 16/24 글꼴에서 아래를 기록한다.
   - 줄바꿈된 줄의 x가 본문 시작점과 같음(깊이 0·1·2, "1. "·"10. ")
   - 마커 x 20(깊이마다 +20)과 본문 x 32 유지
   - ↑/↓가 줄바꿈된 줄을 하나씩 지나고 항목 안팎에서 가로 위치를 지킴
   - ←/→가 마커를 건너뜀
   - 블록 이웃 빈 줄의 높이와 커서
   - 블록 경계의 Backspace·Delete와 선택 교체를 입력란이 처리했을 때 텍스트가 맞음
   - ⌘⌫·⌘⌦ 줄 단위
   - 복사 `text/plain`
   - 결과를 `docs/features/composer-list-hanging-indent/design.md`에 적고, 안 되는 항목이 있으면 멈추고 사람에게 보고한다.
   - 검증: 위 항목마다 측정값과 통과 여부가 design.md 'PoC 결과'에 있다.
2. **시안**: `/design-draft`로 새 파일 `.doan/canvases/composer-hanging-indent.html`에 입력란 목록 프레임을 그린다. 기존 시안은 고치지 않는다. 담을 상태:
   - 줄바꿈된 항목(•와 번호, 깊이 0·1·2, "10. ")
   - 일반 줄과 칩으로 시작하는 줄의 줄바꿈
   - 칩이 본문에 있는 항목
   - 빈 항목
   - 최대 높이에서 스크롤된 상태
   - 검증: `doan check --json`이 오류 없이 통과하고 `doan ls --json`에 프레임이 나온다. 사람이 앱에서 확정하고 design.md에 적는다.
   - ── 커밋 경계(시안, develop에 직접) ──
3. **테스트**:
   - 순수 함수 테스트(`composerLists.test.ts`, `anchorField.test.ts`): 줄 단위 그리기 단위, 줄 경계 판단, keydown 229 선삭제 결정, 경계 삭제·교체 결과
   - Electron DOM 테스트(`chipField.dom.test.ts`): `:150` "a wrapped row starts at x 0"을 뒤집고, 위 PoC 항목 전부와 칩·실행 취소·Shift+Enter·Tab·IME 순서(`:293-354`)를 블록 구조에서 확인한다.
   - jsdom 테스트(`chipField.test.ts`): `misdrawn`·`repair`가 블록 구조에서 불필요하게 다시 그리지 않음
   - 네 composer가 같은 입력란을 쓰는지(`ComposerParts.test.tsx:648`)는 그대로 통과해야 한다.
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(test) ──
4. **구현**: design.md 'DOM 구조'와 '편집 처리'를 구현한다.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`와 `npm --prefix app run lint` 통과. `/runtime-test` 짧은 프로브로 네 composer에서 줄바꿈된 항목 표시, 화살표, 경계 삭제, 실행 취소, 복사를 확인한다.
   - ── 커밋 경계(구현) ──
5. **사람 확인(IME)**: 개발 빌드를 격리된 환경(AGENTS.md 'Commands'의 dev run)으로 띄우고, 사람이 한글 입력기로 확인한다.
   - 목록 항목 안 조합
   - 조합 중 Shift+Enter·Tab
   - 목록 줄을 걸친 선택 위에서 조합 시작
   - 검증: 사람이 확인 결과를 말하고, conductor가 design.md에 적는다. 실패하면 멈추고 보고한다.
6. **`/design-sync`**: 새 시안과 구현을 실제 앱에서 computed style로 비교해 맞추고, `docs/design/canvas-conversation.md`의 목록 행('Marker', 'Depth', 'Line-start caret', 'No hanging indent' 등)을 새 측정값으로 바꾼다. 고친 내용과 측정 기록은 `/design-sync`가 자체 커밋한다.
   - 검증: `/design-sync` 보고서에서 차이가 0이거나 남은 차이가 문서화돼 있다.
7. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/composer-list-hanging-indent/`를 지운다. `docs/BACKLOG.md` 'Undecided'의 같은 항목도 지운다.
   - PRODUCT §5 item 1 'Lists'
   - ARCHITECTURE §7 chip field(`:715`~`:720`)
   - `docs/design/canvas-conversation.md`의 남은 문장(`/design-sync`가 고치지 않은 곳)
   - `app/src/renderer/styles.css`의 주석은 구현에서 고친다.
   - 검증: `grep -rn "no hanging indent\|No hanging indent" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design`의 결과가 말풍선이나 예전 측정 기록을 가리키는 것뿐이다. 문서만 바뀌므로 참조 확인으로 검증한다.
   - ── 커밋 경계(docs, 문서마다) ──
