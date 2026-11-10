# 폴더 첨부 설계

## 근거와 영향 범위

- PRODUCT §3 Conversation, §5 item 1 Attachments와 ARCHITECTURE §7 Model lists and attachments를 확장한다. §3 Out of scope에 해당하지 않는다.
- `app/src/main/attachments.ts`는 현재 regular file만 허용한다. `app/src/main/conversation/types.ts`의 `AttachmentRecord.kind`는 image/file만 표현한다. 폴더 종류와 표시를 추가해야 한다.
- Electron 선택창, main 첨부 검사, 대화 저장·프롬프트·제공자 전달, renderer 첨부 칩과 세 입력창을 다룬다. CLI와 캔버스 제공 범위는 넓히지 않는다.
- UI는 기존 첨부 칩과 DESIGN.md의 토큰·컨트롤을 따른다. 읽은 프리셋: 설치된 Doan 0.1.3의 `shape` (`doan design-skill shape --json`).

## 처리 경계

세 입력 경로가 main의 같은 폴더 검사와 첨부 등록을 사용한다. 실제 경로와 디렉터리 여부를 확인하고, 전송 수락 시 다시 검사한다. 이름·경로는 프롬프트의 신뢰하지 않는 데이터 영역에 넣는다. 디렉터리의 전체 크기나 파일 목록을 계산하려고 재귀 탐색하지 않는다.

기존 파일처럼 canonical path와 `dev/ino`를 재검사하고, 원래 입력 경로의 링크 대상이 바뀌어도 거부한다. 같은 디렉터리의 하위 내용 변화는 거부 사유가 아니다. 사용자 폴더는 앱 소유 붙여넣기 이미지의 정리 경로인 `Entry.dir`로 표현하지 않는다. 칩 제거·큐 폐기·복원·대화 삭제·재시작 시 원본을 변경하거나 삭제하지 않는다.

기존 제공자 권한과 userData 보호를 유지한다. 프로젝트 밖 경로 첨부 허용과 제공자의 실제 읽기 허용은 별개다. 경로만 전달하며, 이미지 블록 처리에 폴더가 들어가지 않도록 구분한다.

## 순수 함수와 형식

- 첨부 종류별 표시와 프롬프트 descriptor 결정, 파일·폴더 혼합 한도 판정, 종류 변경·누락 결과 변환을 `/tdd` 대상으로 삼는다.
- 앱 내부 IPC와 대화 기록의 attachment 형식이 바뀐다. `kind: "directory"`는 name/path를 가지며 size를 싣지 않는 구분 타입이다. image/file의 기존 size는 유지한다. `conversation/types.ts`, `store.ts`, `drafts.ts`, 프롬프트와 제공자 descriptor, renderer 초안·큐·보낸 메시지 투영의 reader/writer를 함께 갱신한다.
- 기존 기록은 계속 읽는다. 앱 전용 이벤트·초안의 `v`는 유지하며, 예전 앱은 directory를 포함한 새 기록을 읽지 못할 수 있다. 다운그레이드 호환을 약속하지 않는다. TS 전용 fixture로 과거 기록과 새 폴더 기록을 고정하며 공유 JSON Schema·CLI 응답·소켓 버전은 바꾸지 않는다.
- 폴더는 썸네일이나 확장자·용량 메타를 생성하지 않는다. 초안·보낸 메시지는 Folder 아이콘·이름·`Folder`와 경로 툴팁을 사용한다. 큐는 아래 드래프트 요청의 한 줄 압축 표현을 사용한다. 보낸 메시지 투영에도 필요한 경로를 전달한다.
- 캔버스 관례와 `doan check` 규칙 변경은 없다.

## 문구와 입력 일관성

`ComposerParts.tsx`·`homeComposer.ts`의 폴더 드롭 거부를 제거하고 Home·Overview·캔버스 대화가 같은 종류·한도 판정을 쓴다. Attach 도움말은 `Attach files or folders`, 선택창 제목은 `Attach Files or Folders`로 표시한다. 한도 안내는 `Only 10 attachments can be added. 1 was left out.`이며 제외 수에 맞춰 수와 단복수를 바꾼다. 지원하지 않는 종류는 `<name> isn’t a file or folder, so it wasn’t attached.`로 안내한다. 읽기 실패는 기존 `<name> couldn’t be read, so it wasn’t attached.`를 유지한다. 폴더만 전송한 고정 요청은 기존 첨부 전용 요청을 유지한다. 기존 파일 전용 안내나 폴더를 Add Projects로 보내는 안내를 남기지 않는다. 상태·부분 실패·포커스는 spec의 표를 따른다.

## PoC와 회귀 예방

macOS 선택창의 파일·폴더 혼합 선택, 실제 Finder 드롭·붙여넣기, 다섯 제공자의 폴더 경로 처리를 먼저 확인한다. 현재 확인한 것은 코드와 문서이며 실제 동작 검증은 하지 않았다.

POSTMORTEM 2026-11-09의 userData 보호 예방 규칙은 “the decoy is blocked, and the run's own profile, `runtime.json` and attachments are reachable”이다. 외부 폴더를 허용해도 다른 제공자의 프로필 접근을 열지 않는 양방향 검증을 유지한다. 경로 오류는 POSTMORTEM 2026-10-21의 “test `ENOTDIR`, a NUL byte, an over-long name, a symlink loop”를 적용한다. Finder 붙여넣기 probe는 `app/runtime/`의 클립보드 보존 지원을 사용해 POSTMORTEM 2026-10-27의 빈 MIME 항목·find pasteboard 복구 실패를 방지한다.

## 디자인 드래프트 요청

- 경로: `.doan/canvases/folder-attachments.html`, 캔버스 ID: `folder-attachments`.
- 현행 renderer와 DESIGN.md의 레이아웃·타이포그래피·간격·컨트롤을 복사하고, 아래 첨부 요소와 상태만 추가한다. 예전 드래프트와 현행 코드가 다르면 현행 코드를 따른다.
- `folder-home`: Home 입력창의 폴더·파일 혼합 첨부.
- `folder-overview`: Overview의 보낸 메시지·큐·입력창 폴더 칩과 본문 없는 폴더 첨부.
- `folder-canvas`: 캔버스 대화의 기존 캔버스 앵커 칩과 폴더 첨부.
- `folder-states`: 검사 중·일부 실패·소실·교체·혼합 10개 한도와 11번째 거부·긴 이름과 경로 툴팁·제거 버튼 키보드 포커스를 이름 붙인 타일로 그린다.
- 네이티브 선택창은 다시 그리지 않는다. Attach·드롭·붙여넣기가 같은 칩을 만드는 흐름을 설명한다.
- 큐는 기존 행 안에서 메시지 앞에 작은 폴더 아이콘과 폴더 이름을 인라인으로 표시한다. 첨부가 여러 개면 첫 폴더 이름 뒤에 `+N`으로 나머지 첨부 개수를 표시한다. 긴 폴더 이름과 메시지는 말줄임을 허용하고, 전체 경로는 툴팁으로 확인한다. 오른쪽 Send now·전체 삭제 버튼은 유지하며 첨부별 삭제 버튼이나 별도 칩 줄은 추가하지 않는다. 큐에서는 초안·보낸 메시지의 두 줄 칩 대신 이 압축 표현을 쓴다.
- 다른 폴더로 교체되면 칩에 `Replaced`, 안내에 `<name> now points to a different folder. Remove it, or attach it again.`을 표시한다. 실제 소실은 기존 `Moved or deleted`를 유지한다. 하위 파일 변경은 교체 오류가 아니다.
- 초안은 구현 전 시각 검토 자료이며, 네이티브 입력·제공자 PoC 통과나 사용자 시각 승인을 뜻하지 않는다.
