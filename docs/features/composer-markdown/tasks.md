# composer Markdown — tasks

순서: PoC → 순수 함수 → 셸 → UI. `/ship`은 커밋 경계를 따른다.

1. **PoC: 입력창 목록 그리기.** `.scratch/composer-markdown/`에서 `ChipField`와 같은 구조의 contenteditable에 목록 줄(• 대체 기호, 깊이 들여쓰기, 내어쓰기)을 두 방식(줄 래퍼, 기호 span + 음수 들여쓰기)으로 그리고, 캐럿 이동·줄 삭제·한글 IME 조합이 깨지지 않는 쪽을 고른다. 결과(방식, 통과 여부)는 design.md에 적는다.
   - 확인: Playwright `_electron` 또는 Chromium에서 PoC 페이지의 캐럿·삭제 동작 기록.
   - ── 커밋 경계 (`docs(feature):` PoC 결과) ──
2. **`listLines`, `fieldRuns`, `continueList`, `indentItem`** 순수 함수와 테스트(`- `·`* `·`1. `, 깊이 판정, 칩으로 시작하는 줄, 번호 +1, 하위 번호 1부터, 빈 항목 내어쓰기·종료, 부모 없는 들여쓰기 거부, 스킬 단어와 함께).
   - 확인: `npm --prefix app test` 초록.
3. **`bubbleBlocks`, `plainTitle`, `trimBlankLines`** 순수 함수와 테스트(중첩 목록 트리, `ol` 시작 번호, 칩 위치 유지, 제목 기호 제거, 첫 줄 들여쓰기 보존).
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
4. **`ChipField` 그리기와 키**: `render()`와 `misdrawn()`이 `fieldRuns`를 쓰고, Shift+Enter가 `continueList`, 깊이 키가 `indentItem`을 쓴다. 조합 중에는 그리지도 편집하지도 않는다. 네 composer가 `ComposerField` 하나를 쓰는지 테스트로 고정한다.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
5. **전송과 제목**: `composeRequest`가 `trimBlankLines`를 쓰고, 제목·큐 행이 `plainTitle`을 거친다. Edit and resend와 복원된 초안은 원문을 되돌린다.
   - 확인: `npm --prefix app test` 초록.
6. **보낸 버블**: `UserMessage`가 `bubbleBlocks`로 목록을 그린다. 선택·복사 규칙(`textSelection.test.ts`) 유지, 복사 텍스트에 기호 포함.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run lint` 통과.
   - ── 커밋 경계 (`feat:`) ──
7. **디자인**: `/design-draft`로 입력창 목록과 버블 목록 초안을 그린 뒤 사용자가 앱에서 확인한다. 구현 후 `/design-sync`로 측정값을 `docs/design/conversation.md`와 `docs/design/canvas-conversation.md`에 기록한다.
   - 확인: `doan check` 통과, `/design-sync` 측정 기록.
8. **실제 앱 확인**: `/runtime-test`로 네 composer에서 목록 입력, Shift+Enter 이어 쓰기·종료, 깊이 바꾸기, 한글 IME 조합, 보낸 버블 목록, 선택·복사를 짧게 확인한다.
   - 확인: `/runtime-test` 스크린샷과 PASS 기록.
9. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: verify PASS.
10. **승격**: PRODUCT §5 item 1('Composer', 'Highlight', Send 규칙, 대화 제목·큐 행)과 ARCHITECTURE §7('Renderer primitives' 'Chip field')을 현재 규칙으로 고쳐 쓰고(근거는 커밋 메시지), `docs/features/composer-markdown/`을 지운다.
    - 확인: `grep -rn "composer-markdown" docs/ app/` 결과 없음.
    - ── 커밋 경계 (`docs(PRODUCT):`, `docs(ARCHITECTURE):` 문서별) ──
