# composer Markdown — tasks

순서: PoC → 디자인 초안 → 순수 함수 → 셸 → UI → 측정. `/ship`은 커밋 경계를 따른다.

1. **(완료, 2026-11-19 리드) PoC: 숨긴 기호 위의 캐럿.** 결과는 design.md 'PoC 결과'. `.scratch/composer-markdown/`에서 `ChipField`와 같은 평평한 contenteditable에 기호 span(글자 숨김 + •)과 깊이 span을 넣고, ←·→가 기호 안쪽에 캐럿을 멈추지 않게 할 수 있는지, 줄 삭제(⌘⌫ 포함)가 깨지지 않는지 본다. 결과(방식, 통과 여부)는 design.md에 적는다. 한글 IME는 PoC 범위가 아니다(합성 이벤트로는 재현되지 않는다).
   - 확인: `node .scratch/composer-markdown/probe.mjs`(리드 체크아웃) 46개 검사 PASS.
   - ── 커밋 경계 (`docs(feature):` PoC 결과) ──
2. **디자인 초안**: `/design-draft`로 입력창 목록(•, 번호, 깊이)과 버블 목록(내어쓰기) 초안을 새 파일 `.doan/canvases/composer-markdown.html`에 그린 뒤 사용자가 앱에서 확인한다.
   - 확인: `doan check` 통과(`.doan/canvases/composer-markdown.html`), 사용자 확인.
   - ── 커밋 경계 (`docs(design):` 초안) ──
3. **`listLines`, `fieldRuns`, `continueList`, `indentItem`, `removeMarker`** 순수 함수와 테스트.
   - 사례: `- `·`* `·`1. `, 4자리 숫자(날짜) 거부, 깊이 판정(공백·탭), 칩으로 시작하는 줄, 번호 +1, 999 다음 평소 줄바꿈, 하위 번호 1부터, 빈 항목 내어쓰기·종료, 부모 없는 들여쓰기 거부, 깊이 0 내어쓰기 거부, 본문 맨 앞 Backspace(내어쓰기·기호 삭제), 스킬 단어·명령과 함께, 목록 붙여넣기.
   - 확인: `npm --prefix app test` 초록.
4. **`bubbleBlocks`, `plainTitle`, `trimBlankLines`** 순수 함수와 테스트.
   - 사례: 중첩 목록 트리, 적힌 번호 그대로, 칩 위치 유지, 칩으로 시작하는 줄, 목록 사이 빈 줄, 들여쓴 비목록 줄, 제목의 기호·깊이 공백 제거, 첫 줄 들여쓰기 보존, 공백만 있는 줄, 공백만 있는 본문, 자동 기호를 더해 32,768 code units를 넘는 본문.
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
5. **`ChipField` 그리기와 키**: `render()`와 `misdrawn()`이 `fieldRuns`를 쓴다. Shift+Enter는 `continueList`, Backspace는 `removeMarker`, Tab은 `ComposerField`의 `onKeyDown`에서 `props.onKey` 뒤에 handle `indent`를 쓴다. Ctrl+Tab은 항상 포커스 이동. 조합 중에는 그리지도 편집하지도 않는다. 네 composer가 `ComposerField` 하나를 쓰는지 테스트로 고정한다.
   - 테스트: Shift+Enter·Backspace 편집이 undo 한 번으로 되돌아감, 다음 메시지 제안이 있을 때 Tab은 제안 수락, `/` 목록이 열렸을 때 Tab은 목록 닫기, 조합 중 Tab·Shift+Enter 보류.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
6. **전송과 제목**: `composeRequest`가 `trimBlankLines`를 쓰고, `messageLine`(`app/src/main/conversation/messageText.ts`)이 `plainTitle`을 거친다. Edit and resend, 복원된 초안, 초안으로 되돌린 큐(프로토타입 창 포함)는 원문을 되돌린다.
   - 확인: `npm --prefix app test` 초록.
7. **보낸 버블**: `UserMessage`가 `bubbleBlocks`로 목록을 그린다(`role="list"`, 기호는 텍스트 span). 선택·복사 규칙(`textSelection.test.ts`) 유지, 복사 텍스트가 원문과 같음을 테스트로 고정.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run lint` 통과.
   - ── 커밋 경계 (`feat:`) ──
8. **`/design-sync`**: 입력창 목록과 버블 목록을 초안과 측정해 맞추고 `docs/design/conversation.md`와 `docs/design/canvas-conversation.md`에 목록 행 값을 더한다. 초안과 차이는 0이거나 편차로 기록한다.
   - 확인: 두 문서에 목록 행 값이 있고, 편차가 있으면 기록되어 있다.
9. **실제 앱 확인**: `/runtime-test`로 네 composer에서 목록 입력, Shift+Enter 이어 쓰기·종료, Tab·Shift+Tab·Ctrl+Tab, Backspace, 보낸 버블 목록, 선택·복사를 짧게 확인한다. 한글 IME 조합은 사람에게 확인을 요청하고, 못 하면 BACKLOG 'Not verified in the real app'에 남긴다.
   - 확인: `/runtime-test` 스크린샷과 PASS 기록, IME 확인 결과 또는 BACKLOG 항목.
10. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
    - 확인: verify PASS.
11. **승격**: PRODUCT §5 item 1('Composer', 'Highlight', 'Sending', Send 규칙)과 ARCHITECTURE §7('Renderer primitives' 'Chip field', 'Input and prompt'의 `messageLine`)을 현재 규칙으로 고쳐 쓰고(근거는 커밋 메시지), `docs/features/composer-markdown/`을 지운다. 새 디자인 섹션이 생기면 DESIGN.md 색인도 고친다.
    - 확인: `grep -rn "composer-markdown" docs/ app/` 결과 없음(`.doan/canvases/composer-markdown.html` 초안 파일 제외).
    - ── 커밋 경계 (`docs(PRODUCT):`, `docs(ARCHITECTURE):` 문서별) ──
