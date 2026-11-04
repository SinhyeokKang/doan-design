# canvas-composer-polish — spec

사람이 요청한 작은 다듬기 여섯 가지를 한 feature로 묶는다. 하나씩은 `/ship` 크기이고, 모두 앱 UI와 대화 admission 규칙 안에서 끝난다. CLI·guide·공유 포맷은 바뀌지 않는다.

## 사용자

- **사람(앱 사용자)**: 여섯 가지 모두 사람이 보는 화면과 동작이다.
- **에이전트**: 바뀌는 것이 없다. 4번에서 같은 프로젝트에 project conversation 두 개의 턴이 겹칠 수 있다는 점만 달라진다(아래 '문제' 4).

## 문제

1. **Presets 목록이 바깥 클릭으로 닫히지 않는 경우가 있다.** Presets 버튼이 여는 목록(Radix popover)은 부모 문서의 pointerdown으로 닫히지만, 캔버스 iframe 안을 클릭할 때는 부모 문서가 이벤트를 받지 못해 닫히지 않는 것으로 보인다(코드에서 추론, 앱에서는 확인하지 않음). 필드 첫 글자 `/`로 여는 목록은 바깥 클릭 처리가 아예 없어, 다른 곳을 눌러도 열려 있다(`HomeComposerView.tsx`, `DockedComposer.tsx`). PRODUCT와 DESIGN에는 Presets 목록의 바깥 클릭 규칙이 없다.
2. **Send now를 누른 메시지가 큐에 남아 있다.** 지금은 줄이 큐에 남아 `Sending`으로 읽히다가, 에이전트가 메시지를 읽은 뒤에야 쓰레드에 나타난다(PRODUCT §5 item 1 'Project conversations' Send now). 사람은 메시지가 대화로 들어갔는지 쓰레드에서 볼 수 없다.
3. **캔버스 툴바의 세 번째 도구가 대화창 Picker와 다르게 동작한다.** 툴바 Add to conversation(⌘L)은 이미 선택한 프레임·요소를 칩으로 넣고, 대화창의 Pick from canvas는 한 번의 클릭으로 프레임·요소·지점을 골라 칩을 넣는다. 둘은 출처(기존 선택 / 새 클릭), 프레임 밖 요소(허용 / 거부), 지점 칩(없음 / Shift-클릭), 삽입 위치(캐럿 또는 끝 / 보관한 캐럿)가 다르다.
4. **같은 프로젝트에서 다른 project conversation이 답을 기다리면 Home에서 새 대화를 시작할 수 없다.** PRODUCT §5 item 1 'Project conversations'가 정한 규칙이다: "While one works in a root (preparing, running, waiting, …), no other project conversation can start or send there". 권한 요청처럼 사람의 답을 기다리는 대화 하나 때문에, 사람이 그 답을 하기 전에는 같은 프로젝트에서 아무것도 새로 시작하지 못한다.
5. **툴바에서 캔버스를 내보낼 수 없다.** Export는 사이드바 캔버스 행의 메뉴(Export…)에만 있다(PRODUCT §3 In scope 8, §5 item 1 'Canvas row menu'). 캔버스를 보고 있을 때도 사이드바 메뉴를 열어야 한다.

6. **Overview의 Canvas conversations 목록에서 대화를 지울 수 없다.** 대화 삭제는 제목 메뉴의 대화 행에만 있다(PRODUCT §5 item 3 'Project Overview' Delete). 오른쪽 패널의 Canvas conversations 행에는 Delete가 없어, 캔버스 대화를 지우려면 그 캔버스를 열고 제목 메뉴를 열어야 한다.

## 완료 조건

1. **Presets 목록 닫기.** Presets 버튼의 목록과 `/` 목록은 목록과 그 트리거 밖에서 pointerdown이 일어나면 닫힌다. 캔버스 iframe 안의 pointerdown도 바깥으로 본다. 바깥 클릭으로 닫으면 프리셋을 고르지 않은 것으로 보고 필드의 글자는 바꾸지 않는다. `/` 목록은 Escape로 닫은 것과 같이, 필드가 다시 빌 때까지 열리지 않는다. 포커스는 클릭한 곳으로 간다(목록이 포커스를 되돌려 받지 않는다). Escape·Tab·고르기로 닫는 기존 규칙은 그대로다.
2. **Send now는 메시지를 바로 쓰레드로 옮긴다.** Send now를 누르면 그 줄은 큐에서 빠지고, 같은 메시지가 쓰레드 끝에 사람 메시지로 나타나며 보내는 중임을 보인다. 에이전트가 메시지를 읽으면 그 표시는 사라지고 메시지는 턴 안의 실제 위치에 남는다. provider가 거절하거나 턴이 먼저 끝나면 쓰레드의 메시지는 사라지고 메시지는 큐의 원래 자리로 돌아온다. 턴이 아직 실행 중일 때의 거절은 지금처럼 그 줄 아래에 "Couldn’t send now. It stays queued."를 보인다. Send now를 보이는 조건(Claude Code·Codex, 실행 중이거나 권한 답 대기 중인 턴)은 바뀌지 않는다.
3. **툴바 Picker.** 캔버스 툴바는 Select, Hand, Picker 순서다. Picker는 대화창의 Pick from canvas와 같은 동작이다: 누르면 한 번의 픽을 시작하고, 프레임 배경 클릭은 프레임 칩, 요소 클릭은 요소 칩, 프레임 안 Shift-클릭은 지점 칩을 대화창 필드의 보관한 캐럿에 넣으며, 프레임 밖은 무시하고 픽을 이어 간다. 픽 중에는 툴바 Picker와 대화창 Pick 버튼이 함께 눌린 상태로 보이고, 둘 중 어느 것을 다시 누르거나 Esc를 누르면 픽을 취소한다. ⌘L은 툴바 Picker와 같이 픽을 시작한다. 대화창이 접혀 있으면 Picker와 ⌘L은 대화창을 펼친 뒤 픽을 시작한다. Picker를 쓸 수 없을 때(대화창 필드가 없거나 잠김 등, 지금 Pick from canvas가 비활성인 조건)는 툴바 Picker도 비활성이고 같은 이유를 tooltip으로 보인다. "Add to conversation"(기존 선택을 넣기)은 없어진다.
4. **답을 기다리는 대화는 같은 프로젝트를 막지 않는다.** 같은 root의 project conversation이 사람의 답(권한 요청)을 기다리는 동안에는 Home과 Overview에서 다른 project conversation을 시작하거나 보낼 수 있다. 준비 중, 실행 중, 끝난 지 10초가 안 되어 아직 판정하지 않음, 큐를 보내려는 중인 대화는 지금처럼 막는다. 답을 기다리던 대화는 사람이 답하면 이어서 실행되므로, 그동안 같은 root에서 두 턴이 함께 실행될 수 있다. 막힐 때의 이유 줄은 "Another conversation is still running in <project>."만 남고, "needs your answer" 문구는 쓰지 않는다.
5. **툴바 Export.** 캔버스 툴바의 맨 오른쪽(구분선 뒤)에 Export 버튼이 있다. 누르면 사이드바 캔버스 행 메뉴의 Export…와 같은 내보내기를 열린 캔버스에 실행한다: 저장 패널, 진행 toast, 결과 toast와 Show in Finder, 거절 이유. 행 메뉴에서 Export가 안 되는 조건(행 읽기 오류, 그 캔버스의 내보내기 실행 중)과 목록에 없는 페이지·프로젝트 문제에서는 비활성이고 같은 이유를 tooltip으로 보인다.

6. **Canvas conversations 행의 Delete.** Overview 오른쪽 패널의 Canvas conversations 행마다 Delete(휴지통) 버튼이 있다. 제목 메뉴의 Delete와 같은 규칙을 쓴다: 포인터가 행 위에 있거나 키보드 포커스가 행·버튼에 있을 때 보이고, tooltip은 “Delete conversation”, 대화가 working이거나 답을 기다리면 누를 수는 있지만 아무것도 하지 않고 이유를 tooltip과 접근 설명으로 준다. 누르면 같은 compact 확인(Cancel 먼저, Delete)을 거쳐 같은 main 삭제를 실행하고, 삭제된 대화는 목록에서 빠진다. 행을 눌러 캔버스를 여는 기존 동작은 그대로다.

## 비목표

- 대화창의 Pick from canvas 버튼을 없애는 것. 대화창 안의 버튼은 그대로 두고 툴바 Picker와 같은 픽을 공유한다.
- 같은 root에서 실행 중인 두 project conversation을 동시에 허용하는 것. 4번은 답 대기만 풀고, 실행 중인 대화는 계속 막는다.
- promotion 판정 규칙의 변경. 겹친 두 턴이 같은 캔버스를 고쳤을 때의 판정은 기존 규칙(여러 후보면 project conversation으로 남음)을 그대로 따른다.
- Export viewer 자체의 변경(별도 feature), 툴바에서 다른 캔버스를 내보내는 것.
- ACP provider의 Send now.
