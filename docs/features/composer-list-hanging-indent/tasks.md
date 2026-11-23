# composer 목록 hanging indent — tasks

순서: PoC와 시안(develop에서 먼저) → `/ship`(test → 구현 → code-review·refactor → 사람 IME 확인 → `/design-sync` → 문서 승격 → verify). 포맷 변경이 없어서 스키마 단계는 없다. 거의 모든 변경이 `chipField.ts`를 거쳐서 병렬 배치로 나눌 이유가 없으므로 `/ship bypass` 하나로 한다.

**develop에서 먼저 하는 것(tasks 1, 2)**: `/ship`은 `/tdd`부터 시작하므로, PoC와 그 결과를 적은 design.md 커밋, 확정된 시안은 lead가 conductor를 띄우기 전에 develop에 있어야 한다. composer 스크롤 수정(PR #378)은 develop에 머지됐다.

1. **PoC**(develop, `.scratch/composer-indent/`): 프로브4를 이어 `app/runtime/electronDom.ts`로 후보 A(목록 줄만 블록)와 후보 B(모든 줄 블록)를 각각 실행한다. 실행 명령은 `node .scratch/composer-indent/probe5.ts`다(AGENTS.md 'Commands'의 `.scratch` 측정 스크립트와 같은 방식). shipped CSS 값, 296px 폭, 16/24 글꼴로 아래를 잰다.
   - 줄바꿈된 줄의 x = 본문 시작점(차이 ≤ 0.5px): 깊이 0·1·2·3, "1. "·"10. "·"100. ", 칩으로 시작하는 줄바꿈 줄, 긴 단어
   - 마커 x 20·40·60, 본문 x 32·52·72, 두 칸·네 칸 깊이 공백이 같은 x, 깊이 0 앞 공백 폭 0
   - 줄 시작 커서 x 20·40·60
   - ↑/↓가 그려진 줄을 모두 지나고, 항목 안팎에서 x 차이 ≤ 1px
   - ←/→가 마커를 건너뜀, ⌥←/⌥→가 숨긴 줄바꿈을 건넘
   - 블록 이웃 빈 줄: 높이 24px, 커서가 그 줄에 있고 입력한 글자가 그 줄에 들어감
   - 줄 경계 삭제·교체 결과 문자열: "- a\n- b"에서 두 번째 본문 시작 Backspace → "- a\nb"(깊이 0 마커 삭제), 그다음 줄 시작 Backspace → "- ab", 선택 "a\n- b" + 입력 x → "- x"
   - ⌘⌫·⌘⌦ 줄 단위(둘째 줄에서의 결과 문자열 포함)
   - CDP textbox 값과 복사 `text/plain`이 입력 텍스트와 같음
   - IME 이벤트 순서: 합성 keydown 229 → compositionstart에서 선택이 한 번만 지워지고, 229만 오면 지워지지 않음
   - 긴 초안(목록 200줄)에서 한 글자 입력당 다시 그리기 시간
   - 결과(측정값, 통과 여부, 고른 후보와 이유, 번호 폭을 주는 방법)를 design.md 'PoC 결과'에 적고 develop에 커밋한다. 안 되는 항목이 있으면 멈추고 사람에게 보고한다.
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
   - 순수 함수 테스트(`composerLists.test.ts`, `anchorField.test.ts`): 줄 단위 그리기 단위(숨긴 줄바꿈 위치, 빈 줄 채움), 범위가 줄바꿈을 포함하는지, 줄 끝·텍스트 없는 줄 시작의 위치 대응.
   - Electron DOM 테스트(`chipField.dom.test.ts`):
     - 하네스가 불러오는 CSS 필터(`:23`)에 새 클래스(블록, `.list-nl`, 마커 pseudo)를 더한다.
     - `:131`("without a hanging indent", `.list-depth` x 0)과 `:150`("a wrapped row starts at x 0")을 새 규칙으로 바꾼다.
     - spec '완료 기준'의 편집·텍스트 항목 전부를 넣는다: 화살표, ⌘←→, ⌥←→, Shift 선택, 드래그, 세 번·두 번 클릭, 줄 경계 삭제들, ⌘⌫·⌘⌦, 선택 교체, 여러 줄 붙여넣기, ⌘A, ⌃T, 실행 취소 단위(글자 입력과 묶임, 구조 변화 되돌리기), 칩·스킬 강조, 맞춤법 제안 교체, 이모지·서로게이트 경계, 끝 줄바꿈, 마지막 빈 줄 커서, 긴 단어, CDP 값, 복사, Look Up `selectionText`, 줄 시작 커서 x, 읽기 전용 선택·복사, 폭 변경.
     - IME: 합성 keydown 229 + compositionstart에서 걸친 선택이 한 번 지워지고 조합 commit과 한 실행 취소 단계가 됨, 229만 오면 아무것도 지워지지 않음, 기존 IME 순서 테스트(`:293-354`).
     - composer 스크롤: 최대 높이 테스트가 블록 구조에서도 통과하고, 마지막 항목이 줄바꿈되는 경우를 더한다.
     - 나머지 기존 DOM 테스트(`:172`~`:394`)는 바꾸지 않고 통과해야 한다.
   - jsdom 테스트(`chipField.test.ts`): `misdrawn`·`repair`가 블록 구조에서 불필요하게 다시 그리지 않고, 숨긴 span에 글자가 들어가면 다시 그림.
   - 그대로 통과해야 하는 테스트: `ComposerParts.test.tsx:648`(네 composer가 같은 입력란), `ConversationThread.lists.dom.test.tsx`(말풍선), `composerLists.test.ts`의 `bubbleBlocks`·`plainTitle`.
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(test) ──
4. **구현**: design.md 'DOM 구조'와 '편집 처리'를 구현한다. 이어서 `/code-review`와 `/refactor`를 한다.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`와 `npm --prefix app run lint` 통과. `/runtime-test` 짧은 프로브로 네 composer에서 줄바꿈된 항목, 화살표, 경계 삭제, 실행 취소, 복사, 스크롤을 확인한다.
   - ── 커밋 경계(구현, 그다음 refactor) ──
5. **사람 확인(IME)**: 마지막 코드 변경 뒤에 한다. `chipField.ts`나 마커 CSS가 이후 바뀌면 다시 확인한다.
   - 준비(conductor가 한다): `go build -o <tmp>/doan ./cli/cmd/doan`, 새 worktree면 `npm --prefix app ci`와 Electron 바이너리 받기, 그다음 `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<tmp>`를 임시 HOME, 가짜 SHELL, `CLAUDE_CONFIG_DIR`·`CODEX_HOME`을 지운 환경에서 띄운다(AGENTS.md 'Commands').
   - composer 하나(Overview의 docked composer)에서 사람이 한글 입력기로 확인한다. 결과 텍스트는 conductor가 입력란의 segment로 읽어 확인한다.
     - 목록 항목 안 조합: 조합한 글자가 빠지거나 겹치지 않음
     - 조합 중 Shift+Enter·Tab, 조합 중 Enter로 보내기
     - "- ab\n- cd"에서 "b\n- c"를 선택하고 '한' 조합 → "- a한d", 실행 취소 한 번에 원래대로
     - ⌘A 뒤 조합
     - 걸친 선택에서 ⌘C, Shift+→, Esc → 아무것도 지워지지 않음
     - VoiceOver가 줄바꿈된 항목을 한 줄로 순서대로 읽음(확인 못 하면 미확인으로 남긴다)
   - 실패하면 design.md '결정'대로 선삭제 코드를 빼고 BACKLOG 'Known defects'에 재현 조건을 남긴다.
   - 검증: 사람이 확인 결과를 말하고, conductor가 PR 본문에 적는다(design.md는 같은 PR에서 지워진다).
6. **`/design-sync`**: 새 시안과 구현을 실제 앱에서 computed style로 비교해 맞춘다. docked composer와 Home composer에서 시안의 프레임을 잰다. `docs/design/canvas-conversation.md`의 'Composer field lists' 절(머리의 Reference를 새 시안으로, 'Marker', 'Depth', 'Line-start caret', 'No hanging indent', 'Names (CDP)', 깊이 0 앞 공백 deviation)을 새 측정값으로 바꾼다. 고친 내용과 측정 기록은 `/design-sync`가 자체 커밋한다.
   - 검증: `/design-sync` 보고서에서 차이가 0이거나 남은 차이가 문서화돼 있다.
7. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/composer-list-hanging-indent/`를 지운다.
   - PRODUCT §5 item 1 'Lists'(hanging indent, 항목마다 본문 정렬, 줄 시작 커서)
   - ARCHITECTURE §7 chip field(`:715`~`:720`): 블록 구조, 숨긴 줄바꿈, 줄바꿈을 지우는 편집은 입력란이 처리, IME 선삭제 규칙, 마커 그리기
   - `docs/design/canvas-conversation.md`에서 `/design-sync`가 고치지 않은 문장
   - BACKLOG: 'Undecided'의 hanging indent 항목 삭제, IME 선삭제의 한계(한자 변환·재변환·받아쓰기)를 기록
   - 검증:
     - `grep -rni "no hanging indent" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design`의 결과가 없다.
     - `grep -n "list-nl" docs/ARCHITECTURE.md`에 새 구조 설명이 있다.
     - `grep -n "hanging indent for list items" docs/BACKLOG.md`의 결과가 없다.
     - `docs/features/composer-list-hanging-indent/` 디렉터리가 없다.
   - ── 커밋 경계(docs, 문서마다) ──
8. **최종 게이트**: push할 HEAD에서 `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.
