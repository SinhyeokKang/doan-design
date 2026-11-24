# composer-long-paste-chip — design

## 영향 받는 구성 요소

- **앱 renderer**: 네 컴포저 호스트의 `paste` 핸들러(`HomeComposerView.tsx`, `DockedComposer.tsx`가 쓰는 공용 경로, 캔버스 대화 패널, 프로토타입 창 패널). 호스트가 먼저 클립보드를 보고, 기준 이상의 일반 텍스트면 `preventDefault()` 후 main에 저장을 요청하고 Checking 칩을 띄운다. 기준 미만이거나 칩 클립보드(`CLIPBOARD_TYPE`)면 지금처럼 필드의 `paste`로 넘긴다(`ComposerParts.tsx` `onPaste`).
- **앱 main**: `attachments.ts`에 `addPastedText`를 더한다. `addPasted`·`addCaptured`가 쓰는 `save` 루틴으로 `<userData>/attachments/<id>/pasted-text-<ISO>.txt`(UTF-8)를 쓰고, `pasted: true`, `kind: "file"` 항목을 만든다. 이미지 시그니처 검사·재인코딩은 하지 않는다. 크기 상한은 기존 50 MB(`MAX_IMAGE_BYTES`)를 같이 쓴다. 새 IPC 채널 `attachments:pasteText`(preload와 프로토타입 preload 둘 다).
- **칩 표시**: `attachmentChipView`가 붙여넣은 텍스트 항목을 알아보고 "Pasted text"와 줄 수를 보여 준다. 알아보는 방법은 캡처 칩과 같이 `pasted` + 파일 이름 접두어 `pasted-text-`다(`AttachmentInfo`에 필드를 늘리지 않는다).
- **에이전트 전달**: 경로 descriptor와 fence의 "이번 턴의 pasted 디렉터리 읽기"는 그대로 적용된다(ARCHITECTURE §7 'Attachments', 'Fence'). Antigravity에는 이미지에 ACP 이미지 블록을 더하듯, 붙여넣은 텍스트 항목마다 main이 저장한 파일을 읽어 ACP 텍스트 블록을 더한다(`conversation/acpRunner.ts`). 다른 ACP 에이전트(Cursor, Copilot)는 경로만 받는다.
- CLI·skills: 영향 없음.

## 참고한 도구 (2026-11-24 설치본에서 확인)

- **Orca 1.4.263** (`/Applications/Orca.app` app.asar, `NativeChatComposer` `_B`·`mB`): 붙여넣은 글이 32,768자 또는 32,767바이트 이상이거나 메시지가 한도를 넘을 때만 `savePastedTextAsFile`로 파일을 저장하고 `[Pasted text](orca-paste:<id>)` 칩을 넣는다. 파일로 저장해 넘기는 방식은 여기서 가져왔다.
- **Claude Code 2.1.331** (`~/.local/share/claude/versions/2.1.331` 바이너리 문자열, `VN=800`, `IX` = 줄바꿈 수): 800자를 넘거나 줄바꿈이 2개를 넘으면 `[Pasted text #N +M lines]`로 접고, 보낼 때 본문에 원문을 펼친다. 파일은 만들지 않는다.
- 기준은 둘 사이인 1,000자 또는 10줄 이상으로 정했다. 짧은 코드 조각은 필드에 남기고, 필드 여덟 줄을 넘는 글은 칩으로 바꾼다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `pasteAsAttachment(text, { acceptsAttachments, attached, limit })` → `"field" | "attach" | "limit"`: 1,000자 이상 또는 10줄 이상(줄 수 = `\n` 개수 + 1)인지, 첨부를 받는지, 첨부 개수 여유로 판단한다. 첨부를 받지 않으면 `"field"`, 기준 이상인데 한도가 찼으면 `"limit"`(기존 거절 문구). 줄바꿈은 필드와 같이 `\r\n?` → `\n`으로 정규화한 뒤 센다. 글자 수는 UTF-16 길이가 아니라 코드 포인트로 센다(한글·이모지가 같은 기준을 받게).
2. `pastedTextName(at: Date)`: `pastedName`·`capturedName`과 같은 규칙의 파일 이름.
3. `pastedTextLabel(lines)`: 칩의 줄 수 표기("1 line" / "N lines").
4. main의 `pasteTextRequest(value)`: IPC 입력 검증(문자열, 바이트 상한).
5. `pastedTextBlocks(attachments)`: Antigravity 프롬프트에 더할 텍스트 블록 목록(붙여넣은 텍스트 항목만, 이름과 내용).

## 형식 변경

- 공유 JSON Schema 변경 없음. 첨부 기록은 기존 `kind: "file"` 레코드(이름, 크기, 경로)로 대화 기록과 드래프트에 들어가므로 이벤트·드래프트 `v`를 올리지 않는다.

## 규약·결정 영향

- ARCHITECTURE §1 'Conventions'·`doan check` 규칙 변경 없음.
- PRODUCT §5 item 1 'Attachments'의 "only a pasted image without a path and a canvas capture are saved"가 바뀐다: 기준 이상의 붙여넣은 텍스트도 저장한다. 구현 뒤 마지막 작업에서 고친다.
- fence(ARCHITECTURE §7 'Fence')는 경로 목록을 넓히지 않는다. 같은 pasted 디렉터리 규칙을 탄다.
- Antigravity: `view_file`이 워크스페이스 밖 경로를 거절하므로(ARCHITECTURE §7 'Attachments'), 붙여넣은 텍스트의 내용을 ACP 텍스트 블록으로도 보낸다. 승인 없이 읽히고 칩 UI는 다른 에이전트와 같다.

## postmortem에서 가져온 함정

- `2026-11.md` 'Shift+Enter in a composer at its maximum height left the new line out of view': 필드를 코드로 다시 그리고 캐럿을 놓는 편집은 직접 스크롤해야 한다. 이 기능은 긴 글을 필드에 넣지 않으므로 새 캐럿 배치를 만들지 않는다. 기준 미만 붙여넣기는 기존 경로 그대로다.
- `2026-11.md` fence deny 항목: deny 규칙을 시험할 때는 막힌 경로와 함께 이번 턴의 attachments가 모든 실행 경로에서 읽히는지 확인한다. 실제 턴 확인(작업 5)에서 Claude Code의 Read와 Codex의 셸 둘 다 본다.

## PoC 의존

- 없음. 저장·수명·전달은 붙여넣은 이미지 경로가 이미 검증했다. Antigravity가 이미지 블록 옆의 텍스트 블록을 읽는지는 작업 5의 실제 턴에서 확인한다.

## 디자인 프리셋

- `shape` 프리셋을 읽었다. 기존 첨부 칩 표면을 확장하는 일이라 새 시각 방향은 없고, 칩의 이름·줄 수 표기와 상태만 정한다.
