# composer-long-paste-chip — tasks

1. **순수 함수**: `pasteAsAttachment`, `pastedTextName`, `pastedTextLabel`, `pasteTextRequest`, `pastedTextBlocks`와 테스트.
   - 확인: `npm --prefix app test` 녹색(기준 경계값, `\r\n` 정규화, 첨부 불가 시 `"field"`, 한도 도달 시 `"limit"`).
   - — 커밋 경계 —
2. **main 저장**: `AttachmentStore.addPastedText`와 `attachments:pasteText` 채널(main·preload·프로토타입 preload). `save` 루틴 재사용, `sent` 마커·시작 시 정리 규칙 공유.
   - 확인: `npm --prefix app test`의 `attachments` 테스트 녹색(저장 파일 내용·이름·크기 상한, 보내기 전 삭제, `sent` 뒤 유지), `npm --prefix app run typecheck`.
   - Antigravity 프롬프트에 텍스트 블록 추가(`acpRunner.ts`). 확인: `npm --prefix app test`의 `acpRunner` 테스트 녹색(Antigravity만 블록을 받고 Cursor·Copilot은 받지 않음).
   - — 커밋 경계 —
3. **컴포저 붙여넣기**: 네 컴포저 호스트의 `paste`가 판단 함수로 분기하고 Checking 칩 → 결과 칩, 실패는 기존 거절 문구 자리. 칩 표시 `attachmentChipView`.
   - 확인: `npm --prefix app test` 녹색(호스트별 붙여넣기 분기, 칩 라벨), `npm --prefix app run lint`.
   - — 커밋 경계 —
4. **실제 앱 확인**: `/runtime-test`로 격리 앱에서 네 컴포저에 기준 이상·미만 텍스트를 붙여넣고, 칩 삭제 시 파일 삭제, 드래프트 복원, 한도 10개를 본다.
   - 확인: `/runtime-test` 보고(스크린샷과 userData 파일 목록).
5. **실제 에이전트 턴**: AGENTS.md 'Real agent sign-ins'대로 복제한 로그인으로 Claude Code, Codex, Cursor, Copilot, Antigravity에 붙여넣은 글을 보내고, 에이전트가 내용을 읽어 답하는지 본다(Claude Code의 Read, Codex의 셸, Antigravity의 텍스트 블록).
   - 확인: 각 턴의 응답이 붙여넣은 글의 고유 문자열을 인용한다. 로그인이 없는 공급자는 미확인으로 보고한다. 명령은 `/runtime-test` 절차를 따른다.
6. **문서 승격**: PRODUCT §5 item 1 'Attachments'(저장 대상, 기준, 칩 표기, 터미널 세션)와 ARCHITECTURE §7 'Attachments'(`addPastedText`, 채널, 이름 접두어)를 현재 규칙으로 고치고 `docs/features/composer-long-paste-chip/`를 지운다.
   - 확인: `node .agents/skills/verify/scripts/verify.mjs` 통과, `docs/features/composer-long-paste-chip/` 없음.
