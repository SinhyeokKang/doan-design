# composer 목록 hanging indent — tasks

순서: PoC와 시안(develop에서 먼저) → `/ship bypass`(test → 구현 → code-review·refactor → 사람 IME 확인 → `/design-sync` → 문서 승격 → verify). 포맷 변경이 없어서 스키마 단계는 없다. 변경이 입력란 하나에 모여 있어 병렬 배치로 나눌 이유가 없다.

**develop에서 먼저 하는 것(tasks 1, 2)**: `/ship`은 `/tdd`부터 시작하므로, PoC 결과를 적은 design.md 커밋과 확정된 시안은 lead가 conductor를 띄우기 전에 develop에 있어야 한다.

1. **PoC — 순수 ProseMirror D 모델**(develop, `.scratch/prosemirror-poc/`): `.scratch/tiptap-poc/`의 D 모델을 TipTap 없이 ProseMirror 패키지만으로 다시 만들고, `app/runtime/electronDom.ts`(숨긴 창)로 잰다. 실행 명령은 `node .scratch/prosemirror-poc/build.mjs && node .scratch/prosemirror-poc/probe.ts`다. 296px 폭, shipped CSS, Geist 16/24.
   - TipTap PoC D 항목 재확인: 줄바꿈 x(차이 ≤ 0.5px), 마커·본문 x, 16개 문자열 왕복, 목록 keymap 15건과 실행 취소, 줄 넘는 native 삭제 4건, ↑/↓, ⌘←/⌘→, 복사, 선택 텍스트, CDP 값, IME(CDP)
   - 새로 잴 것과 기댓값:
     - macOS 삭제 명령 ⌃K·⌃H·⌃D·⌃T·⌘⌫·⌘⌦가 줄 경계에서 입력 텍스트를 지금 입력란과 같게 바꿈(지금 입력란의 결과 문자열을 기준으로 적는다)
     - 맞춤법 제안 교체(`insertReplacementText`)가 항목 안에서 구조를 깨지 않음
     - 마우스 드래그·세 번 클릭·두 번 클릭 선택 뒤 입력과 복사 결과가 지금 입력란과 같음
     - 이모지·서로게이트·ZWJ가 줄 경계에 있을 때 삭제 범위가 맞음
     - 줄 시작 칩 앞 커서: 입력이 칩 앞에 들어가고 커서 사각형이 있음(U+200B 채움이나 widget decoration 중 하나로)
     - ⌥→: keymap으로 다음 줄 첫 단어 끝까지 한 번에 가게 할 수 있는지(지금 입력란 기준선 12→14→21)
     - 커서만 옮긴 뒤 입력이 새 실행 취소 단계가 됨(`closeHistory`)
     - 최대 높이(8줄)에서 Shift+Enter·붙여넣기·실행 취소 뒤 커서가 보임(`scrollIntoView`), 빈 줄 포함
     - 칩 클릭·tooltip·Look Up `selectionText`
     - 번들 크기(minify, gzip)
   - 결과(측정값, 통과 여부, ProseMirror 패키지 버전, 줄 시작 칩 커서 방식, ⌥→ 결과)를 design.md 'PoC 결과'에 적고 develop에 커밋한다. 안 되는 항목이 있으면 멈추고 사람에게 보고한다.
   - 검증: 위 항목마다 기댓값과 측정값, 통과 여부가 design.md 'PoC 결과'에 있다.
   - ── 커밋 경계(docs(feature), develop) ──
2. **시안**(develop): `/design-draft`로 새 파일 `.doan/canvases/composer-hanging-indent.html`에 입력란 목록 프레임을 그린다. 기존 시안은 고치지 않는다. 담을 상태:
   - 줄바꿈된 항목(•와 번호, 깊이 0·1·2·5, "9."·"10."·"100."이 섞인 목록)
   - 일반 줄, 들여쓴 일반 줄, 칩으로 시작하는 줄의 줄바꿈
   - 칩이 본문에 있고 그 칩으로 줄바꿈 줄이 시작하는 항목
   - 긴 단어가 있는 항목
   - 빈 항목, 줄 시작 커서(깊이 0·1·2)
   - 최대 높이에서 스크롤된 상태
   - docked composer 296px, Home 680px, 좁은 폭(프로토타입 창 패널)
   - 검증: `doan check --json`이 오류 없이 통과하고 `doan ls --json`에 프레임이 나온다. 사람이 앱에서 확정하고 design.md에 적는다.
   - ── 커밋 경계(시안, develop에 직접) ──
3. **테스트**(`/ship` 시작):
   - 순수 함수 테스트: segment ↔ 문서 왕복(PoC 16개 문자열과 칩 포함), decoration 계산(목록 여부, `--body`, 깊이·마커·스킬 범위), `--body` 계산, 실행 취소 경계 규칙.
   - Electron DOM 테스트(`chipField.dom.test.ts`):
     - 하네스가 불러오는 CSS 필터(`:23`)에 새 클래스(목록 decoration, glyph 마커, ProseMirror 필수 규칙)를 더한다.
     - `:131`과 `:150`("a wrapped row starts at x 0")을 새 규칙으로 바꾼다.
     - spec '완료 기준'의 편집·텍스트 항목 전부를 넣는다: 화살표, ⌘←→, ⌥←, Shift 선택, 드래그, 세 번·두 번 클릭, 줄 경계 삭제들과 macOS 삭제 명령, 선택 교체, 여러 줄 붙여넣기, ⌘A, 실행 취소 단위(글자 입력과 묶임, 커서 이동 뒤 새 단계, 구조 변화 되돌리기), 칩·스킬 강조, 맞춤법 제안 교체, 이모지 경계, 끝 줄바꿈, 마지막 빈 줄 커서, 긴 단어, CDP 값(빈 줄 차이는 기대값으로 고정), 복사, Look Up `selectionText`, 줄 시작 커서 x, 읽기 전용 선택·복사, placeholder, 폭 변경.
     - IME: 기존 IME 순서 테스트(`:293-354`)를 ProseMirror 위에서 같은 결과로, CDP로 걸친 선택 위 조합 → "- a한d"와 실행 취소 한 번.
     - composer 스크롤: 최대 높이 테스트(PR #378)가 그대로 통과하고, 마지막 항목이 줄바꿈되는 경우를 더한다.
     - 나머지 기존 DOM 테스트는 결과가 같아야 한다(바뀌는 DOM 구조에 맞춘 조회 변경만 허용).
   - jsdom 테스트(`chipField.test.ts`): ProseMirror 위에서 의미가 없어지는 테스트(redraw 건너뛰기, `misdrawn`)는 지우고 이유를 커밋 메시지에 적는다. 나머지는 같은 결과.
   - 그대로 통과해야 하는 테스트: `ComposerParts.test.tsx`(네 composer가 같은 입력란, Tab·포커스), 호스트 IME 테스트(`homeComposer.test.ts`, `HomeComposerView.interaction.test.tsx`, `App.bubbleAdd.test.tsx`), `ConversationThread.lists.dom.test.tsx`(말풍선), `composerLists.test.ts`, `anchorField.test.ts`.
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(test) ──
4. **구현**: ProseMirror 의존성을 추가하고(`npm --prefix app install --save-exact <pkg@version>`), design.md '입력란 구조'와 '편집 처리'대로 `chipField.ts`를 다시 쓴다. 이어서 `/code-review`와 `/refactor`를 한다.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`·`npm --prefix app run lint`·`npm --prefix app run build` 통과. `/runtime-test` 짧은 프로브로 네 composer에서 줄바꿈된 항목, 화살표, 경계 삭제, 실행 취소, 복사, 칩, 스킬, 스크롤, 메뉴 실행 취소를 확인한다.
   - ── 커밋 경계(구현, 그다음 refactor) ──
5. **사람 확인(IME)**: 마지막 코드 변경 뒤에 한다. 입력란 코드나 마커 CSS가 이후 바뀌면 다시 확인한다.
   - 준비(conductor가 한다): `go build -o <tmp>/doan ./cli/cmd/doan`, 새 worktree면 `npm --prefix app ci`와 Electron 바이너리 받기, 그다음 `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<tmp>`를 임시 HOME, 가짜 SHELL, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`을 지운 환경에서 띄운다(AGENTS.md 'Commands').
   - Overview의 docked composer에서 사람이 한글 입력기로 확인한다. 결과 텍스트는 conductor가 입력란의 segment로 읽어 확인한다.
     - 일반 줄과 목록 항목 안 조합: 조합한 글자가 빠지거나 겹치지 않음
     - 조합 중 Shift+Enter·Tab, 조합 중 Enter로 보내기
     - "- ab\n- cd"에서 "b\n- c"를 선택하고 '한' 조합 → "- a한d", 실행 취소 한 번에 원래대로
     - ⌘A 뒤 조합
     - 칩 옆에서 조합(조합 중 칩 대기 포함)
     - VoiceOver가 줄바꿈된 항목을 순서대로 읽음(확인 못 하면 미확인으로 남긴다)
   - 걸친 선택 위 조합이 실패하면 design.md '결정'대로 BACKLOG 'Known defects'에 재현 조건을 남긴다. 다른 항목이 실패하면 멈추고 보고한다.
   - 검증: 사람이 확인 결과를 말하고, conductor가 PR 본문에 적는다.
6. **`/design-sync`**: 새 시안과 구현을 실제 앱에서 computed style로 비교해 맞춘다. docked composer와 Home composer에서 시안의 프레임을 잰다. `docs/design/canvas-conversation.md`의 'Composer field lists' 절(머리의 Reference를 새 시안으로, 'Marker', 'Depth', 'Line-start caret', 'No hanging indent', 'Names (CDP)', 깊이 0 앞 공백 deviation)을 새 측정값으로 바꾸고, 받아들인 차이(⌥→, CDP 빈 줄)를 deviation으로 적는다. 고친 내용과 측정 기록은 `/design-sync`가 자체 커밋한다.
   - 검증: `/design-sync` 보고서에서 차이가 0이거나 남은 차이가 문서화돼 있다.
7. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/composer-list-hanging-indent/`를 지운다.
   - PRODUCT §5 item 1 'Lists'(hanging indent, 항목마다 본문 정렬, 줄 시작 커서, 받아들인 차이)
   - ARCHITECTURE §7 'Setup'(ProseMirror 런타임 의존성과 버전 고정)과 chip field(`:715`~`:720`): ProseMirror 문서 모델(줄 = 문단 `<div>`, 칩 = inline atom), decoration으로 그리는 목록, 클립보드·실행 취소·메뉴 실행 취소·스크롤
   - `docs/design/canvas-conversation.md`에서 `/design-sync`가 고치지 않은 문장
   - BACKLOG: 'Undecided'의 hanging indent 항목 삭제, 'Known defects'에 ⌥→ 추가 멈춤(남았으면)과 CDP 빈 줄 차이, IME 실패 시 그 재현 조건
   - 검증:
     - `grep -rni "no hanging indent" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design`의 결과가 없다.
     - `grep -n "prosemirror" docs/ARCHITECTURE.md`에 의존성과 구조 설명이 있다.
     - `grep -n "hanging indent for list items" docs/BACKLOG.md`의 결과가 없다.
     - `docs/features/composer-list-hanging-indent/` 디렉터리가 없다.
   - ── 커밋 경계(docs, 문서마다) ──
8. **최종 게이트**: push할 HEAD에서 `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.
