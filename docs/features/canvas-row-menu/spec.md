# canvas-row-menu — spec

출처: 사용자 요청(2026-11-02). 사이드바의 캔버스 행(Canvases·Design system 두 그룹 모두)에 프로젝트 행의 `shell-more`(`app/src/renderer/ShellSidebar.tsx`) 같은 아이콘 버튼을 두고, 그 메뉴에 **Export**와 **Move to Trash**를 둔다. chain-261103 링크 5로 나간다. 결정은 사용자와 지휘자가 했다(아래 '결정').

## 사용자

- **사람**: 사이드바 캔버스 행의 버튼으로 메뉴를 연다.
  - **Export**: 저장 대화상자에서 위치를 고르면, 그 캔버스를 한 HTML 파일로 받는다. 이 파일은 Doan이나 repo 없이 브라우저(Chromium 계열과 Safari에서 확인)에서 혼자 열린다. 프레임 목록(drawer)과 확대·축소만 있는 가벼운 viewer 안에 캔버스가 보인다.
  - **Move to Trash**: 경고 대화상자에서 확인하면 캔버스 파일과 그 댓글 파일이 macOS 휴지통으로 간다. repo 작업 트리에서 빠지므로 추적 중인 파일이면 변경이 git에 보이고, 사람이나 에이전트가 커밋한다. Doan은 커밋하지 않는다. 에이전트가 그 캔버스를 작업하는 동안에는 메뉴 항목이 비활성이고 이유를 보인다.
- **에이전트**: `doan export <canvas path> -o <file> [--repo <path>] [--json]`로 같은 파일을 만든다. 사용자가 캔버스를 파일로 내보내 달라고 할 때 가이드(`doan skill`)에서 이 명령을 배운다. 삭제에는 CLI가 없다. 에이전트는 지금처럼 파일을 직접 지운다.

## 문제

- 사이드바 캔버스 행에는 여는 동작 하나뿐이다(`ShellSidebar.tsx`의 `.shell-canvas-row`). 메뉴가 없어서 행에서 할 수 있는 일이 없다.
- 캔버스를 repo 밖 사람에게 보여 줄 방법이 없다. PRODUCT §1의 네 문제에는 없는 새 필요이고, 사용자가 결정 1에서 다시 확인했다(Z1이 §1·§2·§3에 반영한다). 공유는 git으로만 하고(PRODUCT §3 Out of scope 5), 캔버스 HTML은 repo의 token CSS·`.doan/assets/`·공유 CSS를 상대 경로로 읽으므로 파일 하나만 보내면 열리지 않는다. 앱도 같은 이유로 `file://`이 아니라 로컬 서버로 연다(ARCHITECTURE §3).
- 필요 없어진 캔버스를 앱에서 지울 수 없다. 사람은 Finder나 터미널에서 지우고, 댓글 파일(`.doan/comments/<id>.jsonl`)은 따로 남아 `orphan_comment_file` 경고가 된다(ARCHITECTURE §1 `doan check` 규칙).

## 결정

1. **범위 게이트(사용자 재확인)**: 지휘자가 PRODUCT §3 Out of scope 5(서버 없음, 공유는 git으로), 1(그리기 도구가 아님), 7(사람이 Doan에서 캔버스를 직접 고치지 않음)을 들어 되물었고, 사용자가 두 기능을 다시 요청했다. 재확인으로 본다. PRODUCT §3·§5를 고치는 작업을 tasks.md Z에 둔다.
2. **삭제 = macOS 휴지통으로 옮기기(사용자 결정)**: Electron `shell.trashItem`을 쓴다. 파일은 repo 작업 트리에서 빠지고 휴지통에서 되살릴 수 있다. Doan은 아무것도 커밋하지 않는다(PRODUCT §3 Out of scope 6 그대로). 메뉴 이름은 "Move to Trash".
3. **확인 대화상자(사용자 결정)**: 지우기 전에 Alert Dialog가 실제 파일(과 댓글)이 repository에서 빠진다고 경고한다. 이미 있는 대화상자 부품(`.doan-dialog` compact, `role="alertdialog"`)을 쓴다. 문구는 clarify 프리셋으로 정한다(tasks P1).
4. **댓글 파일도 함께(사용자 결정)**: 캔버스의 댓글 파일 `.doan/comments/<id>.jsonl`도 함께 휴지통으로 간다(사용자: 댓글은 어차피 단계적으로 빠지는 중이다). 그 ID를 다른 캔버스도 쓰거나 판단할 수 없으면 댓글 파일은 남긴다(design.md '삭제').
5. **작업 중이면 삭제 막기(사용자 결정)**: 에이전트가 그 캔버스를 작업하는 동안 Move to Trash는 비활성이고 이유를 보인다. 작업 중이란 그 캔버스의 앱 대화가 작업 중이거나 답을 기다리는 것, 같은 root의 project conversation이 그 캔버스를 그리는 중인 것(promotion 판정 전), 또는 터미널 `doan work`가 그 캔버스를 작업 중인 것(terminal-agent-activity의 work 목록)이다.
6. **Export는 Go CLI 명령(사용자 결정)**: `doan export <canvas path> -o <file> [--repo] [--json]`이 독립 HTML 파일 하나를 쓴다. 캔버스가 닿는 repo 자산을 모두 안에 넣는다(token CSS와 그 `@import`·`url()`, `.doan/assets/` 이미지·폰트는 data URI, 로컬 script). 외부 URL은 링크로 남기고 결과에 적는다. 결과는 가벼운 Doan viewer shell로 감싼다: 프레임 목록(drawer)과 확대·축소만 있고, 도구·선택·대화·댓글은 없다. 앱의 Export 메뉴는 저장 대화상자(기본 이름 `<캔버스 stem>.html`)를 보이고 CLI를 부른다. 가이드와 CLI가 바뀌므로 `/agent-eval` 영향이 있다(AGENTS.md 'Workflow').
7. **휴지통으로 간 캔버스에 묶인 대화(지휘자 판단)**: 손대지 않는다. 기기 로컬 대화 기록은 그대로 두고, 이미 있는 'canvas left the project' 규칙(PRODUCT §5 item 1 행 상태 자리, item 3 'Canvas conversations' 특수 행, archived 대화의 안내)을 그대로 쓴다. 파일을 휴지통에서 되살리면 canvas ID로 다시 붙는다.
8. **공유 CSS도 값으로 넣기(지휘자 판단)**: 캔버스가 닿는 로컬 CSS는 다른 캔버스와 함께 쓰는 것(`tokens.css`, `.doan/ds/index.css`, `.doan/assets/ds-canvas.css` 등)이라도 모두 그 HTML 안에 넣는다. 결과 파일 하나가 혼자 열려야 하기 때문이다(사용자: 단일 파일로도 정상 출력되도록 한 HTML로 합친다).
9. **결과 크기 상한 50 MiB(지휘자 판단)**: 넘으면 파일을 쓰지 않고 `export_too_large`(exit 2)로 거절하고, 가장 큰 자산을 메시지에 적는다. 앱의 붙여 넣은 이미지 상한(50 MB, PRODUCT §5 item 1 'Attachments')과 같은 크기다.
10. **초안 범위(지휘자 판단)**: 새 초안 캔버스 하나(`.doan/canvases/canvas-row-menu.html`)에 행 버튼, 메뉴, Alert Dialog, Export 토스트, viewer shell 다섯 가지를 그린다. 행 버튼이 상태 자리와 자리를 나누는 방식은 제안으로 그리고, 사용자가 초안에서 확정한다(tasks P2).

## 완료 조건

### 행 버튼과 메뉴

- Canvases·Design system 두 그룹의 모든 캔버스 행에 메뉴 버튼이 있다. 접근 이름은 `<캔버스 이름> menu`이고(프로젝트 행 `<프로젝트 이름> menu`와 같은 형식), 메뉴에는 Export와 Move to Trash가 이 순서로 있다.
- 행 버튼을 눌러도 캔버스가 열리지 않는다(프로젝트 행 버튼처럼 click·keydown이 행으로 올라가지 않는다).
- 키보드: 포커스가 캔버스 행에 있을 때 Tab이 그 행의 버튼으로 간다(프로젝트 행과 같다). Enter·Space로 메뉴를 열고, Esc로 닫으면 포커스가 버튼으로 돌아온다. 화살표·Home/End·typeahead는 지금처럼 행 사이만 움직인다. 메뉴 항목은 "Export…"(저장 대화상자가 이어진다)와 "Move to Trash"(확인 대화상자만 이어진다)이다. 기존 "Remove from Doan"처럼 확인만 여는 항목에는 줄임표가 없다.
- 비활성 항목도 화살표로 닿고, 보조 기술이 이유 줄을 읽는다(`disabled`가 아니라 `aria-disabled`, DESIGN 'Locked Back'과 같은 규칙).
- 행 상태 자리(권한·작업 중 스피너·안 본 알림 dot)는 초안에서 확정한 방식으로 버튼과 함께 보인다. 상태 자리의 접근 이름은 버튼이 보이는 동안에도 남는다.
- 읽기 오류가 있는 행(`row.error`)에도 버튼이 있다. Export는 비활성이고 이유를 보이며, Move to Trash는 쓸 수 있다.
- 행이 잠긴 동안(`props.locked`) 버튼은 다른 행 동작처럼 `aria-disabled`이고 포커스 순서에 남는다. 메뉴가 열린 채 잠기면 메뉴가 닫힌다.
- 하위 디렉터리의 캔버스(`.doan/canvases/a/b.html`) 행도 같은 메뉴를 갖는다.

### Move to Trash

- Move to Trash를 고르면 Alert Dialog가 열린다. 제목·본문은 캔버스 이름과 repo 상대 경로를 말하고, 댓글 파일이 함께 갈 때만 댓글을 말한다(대화상자를 열 때 main에 묻는다, design.md '댓글 파일'). 동작은 Cancel, Move to Trash 순서다. Esc와 Cancel은 아무것도 바꾸지 않고 포커스를 그 행의 메뉴 버튼으로 돌린다. 처음 포커스는 Cancel에 있다.
- 대화상자가 열린 사이에 그 행이 목록에서 사라지면 대화상자가 닫힌다. 에이전트가 작업을 시작하면 Move to Trash 버튼이 `aria-disabled`가 되고 이유 줄이 본문 아래에 보인다.
- 확인하면 캔버스 파일이 휴지통으로 가고, 결정 4의 조건이 맞으면 댓글 파일도 간다. 결과는 토스트 하나로 알린다. 댓글 파일만 옮기지 못하면 그 사실과 남은 파일의 repo 상대 경로를 같은 토스트에서 말한다.
- 그 캔버스가 열려 있었으면 그 프로젝트의 Overview로 간다. 일반 '캔버스가 없어졌다' 토스트는 따로 뜨지 않는다. 같은 canvas ID를 쓰는 다른 캔버스가 있어도 그쪽으로 따라가지 않는다(design.md '삭제 뒤 화면').
- Back/Forward는 지운 캔버스 방문을 건너뛴다(PRODUCT §5 item 1의 'skipping deleted targets' 그대로).
- 사이드바 포커스는 지운 행의 다음 행으로 간다(없으면 이전 행, 그룹이 비면 그룹 머리).
- 앱 대화가 그 캔버스에서 작업 중이거나 답을 기다리는 동안, 또는 그 캔버스의 project conversation이 그리고 있는 동안(promotion 판정 전), 또는 터미널 `doan work` 목록에 그 (root, path)가 있는 동안 Move to Trash는 비활성이고 이유 한 줄이 메뉴 안에 보인다. main도 자기가 가진 근거로 같은 조건을 다시 확인해 거절한다(대화상자가 열린 사이에 작업이 시작된 경우, design.md '작업 중 판정').
- main은 renderer가 보낸 경로를 그대로 쓰지 않는다. 등록된 root, 그 root 목록에 있는 행, `.doan/canvases|ds/` 아래(하위 디렉터리 포함) `.html`, 경로의 모든 segment가 심볼릭 링크가 아니고 캔버스가 일반 파일일 때만 옮긴다(design.md '삭제' 경로 확인).
- Doan은 git 명령을 부르지 않는다. 추적 중인 캔버스면 지운 결과가 `git status`에 삭제로 보인다. 추적하지 않는 캔버스는 휴지통에서만 되살릴 수 있다.

### Export

- `doan export .doan/canvases/x.html -o /tmp/out/x.html --json`이 `{v:1, ok:true, result:{path, output, bytes, frames, external, links}}`를 내고(모양은 design.md 'CLI 결과'), 결과 파일을 Doan·repo·네트워크 없이 Chromium과 Safari에서 열면 앱과 같은 폭(`doan:width`)으로 캔버스가 보인다. 외부 URL은 네트워크가 있을 때만 불러온다.
- 결과 파일은 repo 안 어떤 경로도 상대 참조로 남기지 않는다. 예외는 CSS 파일 안에서 가리키는 대상이 없는 참조(`@import`·`url()`)뿐이고, 앱에서도 실패하므로 그대로 둔다(design.md '자산 해석'). 캔버스가 닿는 로컬 자산(stylesheet `<link>`, `<style>`과 CSS 파일의 `@import`·`url()`, `img`·`source`·`video`·`audio`·`track`의 `src`·`srcset`·`poster`, `<script src>`, `link rel="icon|preload|modulepreload"`, SVG `<image>`·`<use>`의 `href`)은 모두 안에 들어간다.
- 앱이 보여 주지 않는 파일은 내보내지 않는다. 로컬 참조가 repo 밖이거나 serving scope 밖이면(직접이든 CSS 안이든), 또는 캔버스가 직접 닿는 파일이 없으면 결과를 쓰지 않고 거절한다(`export_refused`, exit 2, 메시지에 참조 목록). 판정은 앱 서버와 `doan check`가 쓰는 `repo.Resolve`·`repo.Scope`를 그대로 쓴다.
- `<iframe>`·`<frame>`·`<object>`·`<embed>`가 로컬 문서를 가리키면 거절한다(이번 범위 밖, 비목표). `<a href>`·`<form action>`의 로컬 참조는 그대로 두고 결과 `links`에 적는다.
- 결과 HTML이 50 MiB를 넘으면 쓰지 않고 `export_too_large`(exit 2)로 거절한다.
- `-o` 파일이 이미 있으면 기존 코드 `destination_exists`(exit 2)로 거절한다. `--force`가 있으면 바꿔 쓴다. 상대 `-o`는 현재 디렉터리 기준이다. 출력 경로의 디렉터리 중 하나라도 이름이 `.doan`이면(어느 repo든) 거절한다(`usage_error`): 새 캔버스처럼 목록에 잡히기 때문이다.
- 캔버스 인자는 그 repo의 `doan ls` 목록에 있는 캔버스여야 한다(repo 상대 또는 repo 안 절대 경로). 아니면 `canvas_not_found`. 파싱할 수 없거나 `doan:width`가 없거나 틀린 캔버스는 `export_refused`.
- 결과 파일의 viewer는 캔버스 이름(브라우저 탭 제목도 캔버스 stem), frame drawer(문서 순서, 번호와 제목 또는 id, 처음 1,000개까지, 고르면 앱의 frame jump처럼 그 프레임에 맞춘다), 확대·축소(Fit, 100%, 50%, 200%, 버튼·⌘휠·핀치, shell에 포커스가 있을 때 ⇧1 Fit·⇧0 100%)만 있다. 선택·picking·대화·댓글·Reload·도구 모음은 없다.
- viewer 상태: 프레임이 0개면 drawer는 비활성이고 "No frames"를 보인다. drawer는 Esc로 닫히고 포커스가 trigger로 돌아온다. 캔버스가 높이를 보내지 않으면(스크립트 오류) 5초 뒤 마지막 높이로 멈추고 Fit한다. JavaScript가 돌지 않는 곳(Quick Look, 메일 미리보기)에서는 캔버스가 `doan:width` × 한 화면 높이로 보이고, 브라우저에서 열면 전체가 보인다는 한 줄이 보인다.
- 캔버스 높이는 앱처럼 문서 높이에 맞춘다. `min-height: 100vh` 문서가 높이를 쫓아 커지지 않고, 웹 폰트가 늦게 들어와도 아래가 잘리지 않으며, 절대 위치 프레임만 있는 캔버스도 멈춘다(design.md 'viewer shell').
- 앱: Export를 고르면 macOS 저장 대화상자가 기본 이름 `<캔버스 stem>.html`로 열린다. 저장 대화상자를 취소하면 아무 일도 없다. 저장하면 CLI를 부르고, 끝나면 토스트에 결과를 보이고 Show in Finder를 준다(저장 위치는 사람이 이미 골랐으므로 편의 기능이다). 외부 URL이 있으면 토스트가 인터넷이 있어야 일부가 보인다고 말한다. 실패하면 이유와, 막힌 참조가 있으면 그 수와 첫 참조를 토스트로 보인다. 같은 캔버스의 Export가 진행 중이면 다시 시작하지 않는다.
- 가이드(`doan skill`)에 `doan export`와 부르는 때(사용자가 캔버스를 파일로 내보내 달라고 할 때만)가 있다. `doan help` usage에도 있다.

## 비목표

- 여러 캔버스를 한 번에 내보내기, 프로젝트 전체 내보내기, PDF·이미지 내보내기.
- 로컬 HTML을 품는 iframe·object·embed 안쪽까지 넣기(거절한다).
- JavaScript 안의 `import`·`fetch`가 읽는 로컬 파일을 따라가 넣기. JS는 해석하지 않는다. 그런 캔버스는 결과에서 그 요청이 실패한다(알려진 한계).
- 캔버스 행에서 이름 바꾸기, 복제, Show in Finder, 우클릭 context menu.
- 휴지통에서 되살리기·Undo를 앱에서 제공하기. 사람이 Finder 휴지통에서 꺼낸다(`shell.trashItem`으로 옮긴 파일에 Put Back이 되는지는 T13에서 확인한다).
- 에이전트용 삭제 명령(`doan rm` 같은 것). 에이전트는 지금처럼 파일을 직접 지운다.
- 내보낸 HTML에 댓글·대화·선택을 넣기. 결과는 보기 전용이다.
- 내보낸 파일 호스팅·업로드·링크 공유(PRODUCT §3 Out of scope 5의 '서버 없음'은 그대로다).
