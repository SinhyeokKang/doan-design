# composer-long-paste-chip — spec

## 사용자

- **사람**: 컴포저(Home, Overview의 docked 컴포저, 캔버스 대화 패널, 프로토타입 창 패널)에 스펙·로그·코드 같은 긴 글을 붙여넣는 사람. 필드가 긴 글로 채워지지 않고, 붙여넣은 글을 칩 하나로 본다.
- **에이전트**: 붙여넣은 글을 메시지 본문이 아니라 첨부 파일 경로로 받는다. 붙여넣은 이미지와 같은 길이다(PRODUCT §5 item 1 'Attachments'). Claude Code·Codex·Cursor·Copilot은 경로를 받아 파일 도구나 셸로 읽는다. Antigravity는 워크스페이스 밖 경로를 `view_file`로 읽지 못하므로(ARCHITECTURE §7 'Attachments') 경로와 함께 글 내용을 텍스트 블록으로도 받는다.

## 문제 (관찰된 사실)

- 지금 컴포저에 텍스트를 붙여넣으면 길이와 상관없이 필드에 그대로 들어간다(`chipField.ts` `paste`). 필드는 여덟 줄에서 높이가 멈추고 스크롤되므로(`styles.css` `.composer-input`), 긴 글을 붙여넣으면 앞뒤에 직접 쓴 요청이 묻힌다.
- 메시지 본문은 32,768 UTF-16 코드 유닛으로 제한된다(`messageText.ts` `LIMITS.text`). 이보다 긴 스펙은 한 메시지로 보낼 수 없다.
- 첨부는 경로만 넘기고, 경로가 없는 붙여넣은 이미지와 캔버스 캡처만 userData에 저장한다(PRODUCT §5 item 1 'Attachments', ARCHITECTURE §7 'Attachments'). 붙여넣은 텍스트를 파일로 넘기는 길은 없다.
- 앱은 시작할 때 `sent` 표시가 없는 붙여넣기 폴더를 지운다(ARCHITECTURE §7 'Attachments'). 큐·예약·전송 중·돌려받은 메시지는 드래프트 저장소에 기록되기 전에 `sent` 표시를 받으므로 재시작을 넘긴다. 컴포저의 보내지 않은 드래프트는 메모리에만 있어 재시작하면 사라진다.

## 완료 조건

1. 붙여넣기(⌘V, Edit > Paste, 텍스트 편집 메뉴의 Paste)는 이 순서로 판단한다. 네 컴포저 모두 같다.
   1. Finder 파일·폴더·경로 없는 이미지는 지금처럼 첨부한다. Finder에서 파일 10개 이상을 복사해 `text/plain`에 이름 10줄이 있어도 파일로 첨부된다.
   2. 칩 클립보드(어느 캔버스에서 복사했든)는 지금처럼 필드로 간다.
   3. 필드의 첫 단어가 알려진 명령(`/review`, `/compact` 등, PRODUCT §5 item 1 'Built-in commands')이면 글은 필드로 간다.
   4. 첨부를 받지 않는 컴포저(터미널 세션, 이어 받은 외부 세션)에서는 글이 필드로 간다.
   5. 남은 일반 텍스트가 **1,000 코드 포인트 이상 또는 10줄 이상**이면 첨부 칩 하나가 되고, 필드에는 글이 들어가지 않는다. 줄바꿈은 `\n`으로 맞추고, 끝의 줄바꿈 하나는 줄 수에 넣지 않는다. 공백·줄바꿈만 있는 글은 필드로 간다.
2. 입력기 조합 중이거나, 읽기 전용·전송 중·잠긴 필드에서는 긴 붙여넣기도 아무 일도 하지 않는다. 칩·Checking 상태·저장 파일이 생기지 않는다.
3. 칩이 될 때 캐럿과 필드의 선택 영역은 그대로 남는다(선택한 글을 지우지 않는다). 칩이 준비되면 화면 낭독기에 "Pasted text attached, N lines"를 알린다. ⌘Z는 칩을 지우지 않는다. 칩은 × 버튼으로 지운다.
4. 칩은 파일 아이콘, "Pasted text", 줄 수("1 line" / "N lines")를 보여 주고, 툴팁과 접근성 설명은 글의 첫 줄 앞 80자다. 컴포저, 재시작 뒤 복원한 드래프트, Edit로 다시 보내기, 큐 행, 보낸 말풍선에서 모두 같다. 저장하는 동안은 다른 첨부처럼 Checking 칩이 잠깐 보인다(깜빡임은 예상 동작).
5. 보내지 않고 칩을 지우면 저장한 파일도 지운다. 지우기 버튼 이름은 "Remove pasted text"다.
6. 거절과 실패는 다른 첨부처럼 그 컴포저 아래에 한 줄로 알린다.
   - 첨부가 이미 10개: "Only 10 attachments can be added, so the pasted text wasn’t added. Remove one and paste again."
   - 50 MB 초과: "This text is over 50 MB, so it wasn’t attached."
   - 저장 실패: "Couldn’t save the pasted text. Paste it again."
   - 저장한 파일이 사라짐: "Pasted text was moved or deleted. Remove it, or paste the text again."
7. 보낸 메시지에서 에이전트는 붙여넣은 글의 경로를 받고, 이번 턴의 fence가 그 폴더 읽기를 연다. Antigravity는 경로와 함께 내용을 텍스트 블록으로도 받는다(256 KB까지, 넘으면 경로만). Claude Code, Codex, Cursor, Copilot, Antigravity의 실제 턴 응답이 붙여넣은 글의 고유 문자열을 인용한다. 로그인이 없는 공급자는 미확인으로 보고한다.
8. 수명:
   - 보내지 않고 지움 → 파일 삭제.
   - 보냄 → `sent` 표시, 대화를 지워도 파일은 남는다(BACKLOG의 참조 카운트 한계 그대로).
   - 재시작 → 붙여넣은 이미지와 같은 규칙이다. 큐·예약·전송 중·돌려받은 메시지의 폴더는 `sent` 표시로 남고, `sent` 표시가 없는 폴더만 지운다. 복원한 칩을 지워도 파일은 남는다(BACKLOG의 참조 카운트 한계 그대로).
9. 받아들이는 한계:
   - fence가 걸린 턴에 Send now로 보낸 붙여넣은 글은 그 턴에 열리지 않으므로 다음 턴까지 큐에서 기다린다(붙여넣은 이미지와 같다, ARCHITECTURE §7).
   - 붙여넣은 글만 보내면 첨부만 보낼 때의 고정 요청이 가고, 대화 제목도 거기서 나온다.

## 비목표

- 칩 내용 미리보기, 칩 안 글 편집.
- 붙여넣은 글을 다시 필드 텍스트로 펼치기. 처음부터 필드에 글로 붙여넣는 우회(Paste and Match Style 등)도 없다. 칩이 된 글을 필드에 넣으려면 칩을 지우고 기준 미만으로 나눠 붙여넣는다.
- 드롭한 텍스트(드래그 앤 드롭 텍스트 조각)의 칩 변환.
- 대화 스레드 말풍선에서 붙여넣은 글 내용 보기. 말풍선은 칩만 보여 준다.
- 보낸 붙여넣기 파일 정리용 참조 카운트(BACKLOG 항목 그대로).
