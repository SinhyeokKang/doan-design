# composer-long-paste-chip — tasks

`/agent-eval`은 필요 없다. guide, CLI 출력과 메시지, `doan check` 규칙, skill stub이 바뀌지 않는다.

1. **순수 함수**: `pasteAsAttachment`, `pastedTextMeta`, `pastedTextName`, `pastedTextLabel`, `pasteTextRequest`, `pastedTextAttachments`와 테스트.
   - 확인: `npm --prefix app test` 녹색. 다음을 각각 테스트한다.
     - 999 / 1,000 코드 포인트, 9 / 10줄, 끝 줄바꿈 하나(9줄 + `\n`은 9줄), CRLF, UTF-16 길이는 1,000을 넘지만 코드 포인트는 넘지 않는 한글·이모지 글.
     - 공백만 있는 글, 첨부 불가, 명령으로 시작하는 필드는 `"field"`. 한도 도달(Checking 중인 칩 포함)은 `"limit"`.
     - `pastedTextAttachments`는 저장소 밖의 `pasted-text-x.txt`를 고르지 않는다.
   - — 커밋 경계 —
2. **main 저장과 전달**
   - `save`가 kind를 받게 하고 `AttachmentStore.addPastedText`를 더한다. `attachments:add-pasted-text`를 `senderAllowed.ts`(두 집합), `attachmentHandlers.ts`(`issued`), `main/index.ts`, preload 두 곳에 연결한다. `pasted-text-` 항목은 재검사에서 시그니처로 kind를 바꾸지 않는다. 시작 시 정리는 바꾸지 않는다.
   - 확인: `npm --prefix app test`의 `attachments.test.ts`, `attachmentHandlers.test.ts`, `senderAllowed.test.ts`, preload 테스트가 녹색. 다음을 테스트한다.
     - 저장 파일 내용(`\n`으로 맞춘 글)·이름·`lines`·`excerpt`.
     - 50 MB 상한(UTF-8 바이트 기준, 경계에서 통과, 1바이트 넘으면 거절).
     - 보내기 전 삭제, `sent` 뒤 유지, `GIF89a`로 시작하는 글이 재검사 뒤에도 `kind: "file"`.
     - 프로토타입 창 소유 칩을 지우고 보낼 수 있다.
   - Antigravity 텍스트 블록(`acpRunner.ts`): 256 KB 이하만 블록으로 보내고, data-not-instructions 틀로 감싸며, `O_NOFOLLOW`로 일반 파일만 읽는다.
   - 확인: `npm --prefix app test`의 `acpRunner` 테스트가 녹색이다. Antigravity만 블록을 받고 Cursor·Copilot은 받지 않는다. 256 KB를 넘으면 경로만 간다. `npm --prefix app run typecheck`.
   - — 커밋 경계 —
3. **컴포저 붙여넣기와 칩 표시**
   - 두 핸들러의 분기, `DockedComposer`의 `onPastedText`와 세 호스트 구현, 칩·큐 행·말풍선 표기, 문구(`REFUSALS`, `removeLabel`, `problemNotice`), 낭독.
   - 확인: `npm --prefix app test` 녹색, `npm --prefix app run lint`. 테스트는 effect가 도는 마운트로 쓴다.
     - 대상 파일: `HomeComposerView.interaction.test.tsx`, `DockedComposer.interaction.test.tsx`, `CanvasConversationPanel.headless.test.tsx`, `prototype/PrototypeConversation.view.test.tsx`, ProjectOverview 테스트, `homeComposer` 칩 표기 테스트.
     - Finder 파일 10개 이상(이름 10줄)은 파일로 첨부된다.
     - 칩 클립보드의 `text/plain`이 1,000자를 넘어도 붙여넣은 글 칩이 아니라 필드의 앵커 칩으로 들어간다.
     - 명령으로 시작하는 필드에서는 필드로 들어간다.
     - 읽기 전용·전송 중·잠긴 필드, 입력기 조합 중에는 칩도 IPC도 없다.
     - 선택 영역이 있을 때 선택한 글이 남는다.
     - 첨부 9개에서 빠르게 두 번 붙여넣으면 두 번째가 한도 문구로 거절된다.
     - Checking 중에 칩을 지우면 나중에 저장된 파일도 지운다.
     - Checking 중에는 Send가 막힌다.
     - 저장 중에 대화를 바꿔도 칩이 다른 드래프트로 가지 않는다.
     - 복원한 드래프트·말풍선 칩은 "Pasted text"와 줄 수, 첫 줄 툴팁을 보여 준다. 큐 행은 초안 `queued-pasted-text`처럼 "Pasted text"만 보이고, 줄 수와 첫 줄은 접근성 이름(`Pasted text, N lines — <첫 줄>`)과 툴팁에 둔다.
     - 사라진 파일·저장 실패·50 MB·한도 문구가 나온다.
     - 낭독 문구가 나온다.
   - — 커밋 경계 —
4. **실제 앱 확인**: `/runtime-test`로 격리 앱에서 확인한다.
   - 확인: 아래가 모두 맞으면 통과다.
     - 네 컴포저에서 999자는 필드에, 1,000자는 칩이 된다. 9줄과 10줄도 같다.
     - ⌘V, Edit > Paste, 오른쪽 클릭 Paste의 결과가 같다.
     - 저장 파일 바이트가 `\n`으로 맞춘 클립보드 글과 같다.
     - 칩을 지우면 `attachments/<id>/`가 사라진다.
     - 큐에 넣은 뒤 재시작하면 폴더가 남고, 복원된 칩이 "Pasted text · N lines"다. 보낸 뒤에는 `sent` 표시가 있고 파일이 남는다.
     - 첨부 10개에서 붙여넣으면 그 컴포저 아래에 거절 문구가 나온다.
     - 프로토타입 창을 닫으면 보내지 않은 칩과 파일이 사라진다.
     - 대화를 지워도 보낸 파일은 남는다.
     - Claude 턴 중 Send now로 보낸 붙여넣은 글은 큐에서 기다렸다가 다음 턴에 읽힌다.
5. **실제 에이전트 턴**: AGENTS.md 'Real agent sign-ins'대로 복제한 로그인으로 Claude Code, Codex, Cursor, Copilot, Antigravity에 붙여넣은 글을 보낸다.
   - 확인: 아래가 모두 맞으면 통과다.
     - 각 턴의 응답이 붙여넣은 글의 고유 문자열을 인용한다.
     - fence 두 방향을 본다. 이번 턴 폴더는 읽히고, 다른 대화의 붙여넣기 폴더는 막힌다. Claude Code의 Read와 Codex의 셸 둘 다 본다.
     - 확인이 끝난 뒤 실제 HOME의 로그인이 그대로 동작한다.
     - 로그인이 없는 공급자는 미확인으로 보고한다.
   - 명령: 미정. 로그인 복제본을 격리 앱의 Doan 프로필에 넣는 절차는 `/runtime-test`와 `app/runtime/`에 없으므로 사용자 확인이 필요하다.
6. **문서 승격**: 현재 규칙으로 고친다.
   - PRODUCT §5 item 1 'Attachments': 저장 대상, 기준, 칩 표기, 명령·터미널 세션, Antigravity 블록, 재시작 보존.
   - ARCHITECTURE §7 'Attachments': `addPastedText`, 채널, 이름 접두어, `lines`·`excerpt`, Antigravity 블록.
   - `pasted image`라는 표현을 grep해 붙여넣은 글도 포함하도록 고친다. 대상은 PRODUCT 'Text edit menu'("Paste attaches Finder files and path-less images"), 'Resume and permissions'("this turn's pasted images"), 대화 삭제("pasted image copies stay"), ARCHITECTURE 'Fence'("this turn's pasted-image directories"), §7 Send now 대기, BACKLOG의 참조 카운트 항목, DESIGN에 칩 표기가 있으면 그 줄이다.
   - 그다음 `docs/features/composer-long-paste-chip/`를 지운다.
   - 확인: `node .agents/skills/verify/scripts/verify.mjs` 통과, `docs/features/composer-long-paste-chip/` 없음.
