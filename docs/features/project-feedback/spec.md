# project-feedback — 프로젝트의 피드백을 한곳에서 보고, 갈 곳 잃은 댓글을 찾는다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-3, L-5, 제안 N3과 리뷰 W-1, A-3, T-4, P-12. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S3 #5, #8, #9)와 CLI 재현(`doan ls --json` → `internal_error … permission denied`)이다.

선행 기능:
- `comments-readability`: `targetLabel`, Comments 카드 형식
- `revision-recheck`: 위치로 가기, 프로젝트 댓글 읽기 IPC, Review 진입, 이벤트 여러 개 attempt
- `revision-continuity`: (root, canvas id) 키 원칙

## 사용자

- **사람**: 여러 캔버스에 걸친 피드백을 훑어보고 이동하는 사람이다. 에이전트가 캔버스 id를 바꾸거나 캔버스를 지운 뒤 남은 댓글을 찾고 처리한다.
- **에이전트**: `doan ls`가 파일 하나를 읽지 못해도 전체가 실패하지 않는다. 갈 곳 잃은 댓글 파일이 `ls` 결과(`orphans`)에 나오고, skill은 그 파일을 지우거나 다시 붙이지 말라고 안내한다.

## 문제 (관찰한 사실)

1. **캔버스 id가 바뀌면 그 댓글이 앱에서 사라진다(L-3).**
   - 열린 캔버스의 `doan:canvas`를 바꾸자 패널이 "Open 0 · Resolved 0"이 되고 사이드바 배지가 사라졌다(S3 #8).
   - `doan check`는 `orphan_comment_file` 경고만 낸다.
   - `doan comments --json`은 같은 댓글을 여전히 열린 상태로 돌려준다.
   - 앱에는 이 댓글을 보거나 다룰 화면이 없다. 캔버스를 삭제해도 마찬가지다(코드 확인).
2. **댓글 파일 하나를 읽지 못하면 프로젝트 전체가 "Config error"가 된다(L-5).**
   - `.doan/comments/<id>.jsonl` 하나를 읽을 수 없으면 `doan ls`가 `internal_error`로 실패한다(`cli/internal/cli/read.go` `readComments`).
   - 앱은 상태 줄에 "Config error"를 띄우고, 트리를 비우고, 절대 경로가 든 원문 오류를 보인다(S3 #5).
   - 캔버스 파일 하나를 읽지 못할 때도 같은 경로로 실패한다(`readCanvases`, 코드 확인).
3. **프로젝트 단위로 피드백을 볼 곳이 없다(N3, P-12).**
   - Overview 카드와 트리는 캔버스별 열린 수만 보인다.
   - 어느 캔버스의 어느 프레임에 무엇이 남았는지 보려면 캔버스를 하나씩 열어야 한다.
   - Overview의 오른쪽 패널은 "No canvas open"으로 비어 있다.

## 완료 조건

### Feedback 패널
- Overview의 오른쪽 패널은 **Feedback**이다.
- 맨 위에 Open/Resolved 전환이 있다.
- 그 아래 묶음 순서는 다음과 같다.
  1. "Comments without a canvas"(있을 때)
  2. 캔버스 묶음(Overview 카드 순서)
  3. 캔버스 묶음 안의 프레임 묶음(문서 순서). 프레임이 없는 대상은 맨 앞 "Whole canvas" 묶음에 들어간다. `ls`에 없는 저장된 프레임은 끝에 "<id> (not in canvas)"로 둔다.
- 행 표시
  - 행은 `targetLabel`(프레임 묶음 안에서는 " · in <frame>" 부분을 뺀다)과 본문 첫 줄이다.
  - Resolved는 해결 시각 역순이다.
  - 같은 제목의 캔버스는 묶음 머리에 파일 이름을 함께 보인다.
- 캔버스 묶음 머리에 확인할 해결이 있으면 "N resolved to review"가 보인다. 누르면 그 캔버스를 열고 Review를 시작한다(`revision-recheck`).
- 캔버스 행 클릭
  - 그 캔버스를 연다(초안 가드 적용). 상태 필터는 행의 상태, 범위는 Canvas로 맞추고 대상 위치로 간다. 포커스는 그 카드로 간다.
  - 마지막 review 시각은 바꾸지 않는다.
- 상태와 문구

  | 상태 | 표시 |
  |---|---|
  | 로딩 | "Reading comments…"(`role="status"`) |
  | 전체 실패 | "Couldn’t read comments" + Retry 한 블록 |
  | 일부 캔버스 실패 | 그 캔버스 묶음 안에 같은 블록 |
  | 비었음 | "No open comments in this project" / "No resolved comments in this project" |
  | 갈 곳 잃은 댓글만 있음 | 그 묶음만 보인다(Overview가 "No canvases in design/ yet"이어도) |
  | 많음 | 묶음을 접을 수 있다 |

- 키보드는 사이드바 트리와 같다.
  - ↑↓·Home/End로 이동하고 ←→로 묶음을 접고 편다. Enter와 클릭은 열기다. 행 버튼은 Tab으로 닿는다.
  - 행이나 묶음이 사라지면 포커스는 다음 행으로, 없으면 이전 행으로, 그것도 없으면 패널 제목으로 간다.

### 갈 곳 잃은 댓글
- 정의: 목록의 어떤 캔버스도 첫 `doan:canvas` 문자열이 같지 않은 `.doan/comments/<id>.jsonl`이다. id가 유효하지 않거나 중복이어도 같으면 일치로 본다. `doan check`의 `orphan_comment_file`과 같은 규칙이다.
- "Comments without a canvas" 묶음
  - 파일(옛 id)별로 묶인다.
  - 안내 문구: "No canvas uses the ID <id>. Give a canvas this ID again to bring these comments back, or ask your agent."
  - 각 댓글은 Comments 카드 형식으로 보인다. 작성자, 시각, 본문 전체가 있고 버튼이 항상 보인다.
  - 열린 댓글에는 Resolve와 Delete가, 해결된 댓글에는 Reopen과 Delete가 있다. Delete는 기존 삭제 확인을 거친다.
  - 작성·편집·위치로 가기는 없다.
  - 성공·실패·Git 이름 없음·저장 불확실 표시는 Comments 카드와 같다.
- 캔버스 행 가운데 읽기 오류나 파싱 오류가 하나라도 있으면 이 묶음은 읽기 전용이다. 이때 "Some canvases couldn’t be read; these comments may belong to one of them."을 보이고 버튼을 숨긴다.
- id가 kebab 형식이 아닌 파일은 수만 보이는 읽기 전용 행이다.
- 보이는 댓글이 0개인 고아 파일(전부 삭제되었거나 읽을 수 있는 줄이 없음)은 묶음에 보이지 않는다. `doan check` 경고는 그대로 남는다.
- 열린 캔버스의 id가 바뀌어 댓글이 갈 곳을 잃으면, 그 캔버스의 Comments 패널 머리에 "3 comments still use the old ID <old-id> and no longer show here. Show"가 보인다(1개면 단수).
  - Show는 Overview의 그 묶음으로 가고(초안 가드 적용) 포커스를 묶음 머리로 보낸다.
  - 이 안내는 id를 되돌리거나 갈 곳 잃은 댓글이 0개가 되면 사라진다. 컨트롤러 메모리라서 재시작하면 사라진다.

### `doan ls`와 수
- 파일 하나를 읽지 못해도 `doan ls`는 성공한다.
  - 그 캔버스 행에 `commentsError`(댓글 파일) 또는 `error`(캔버스 파일)가 붙는다.
  - 앱 트리는 남는다. 그 캔버스의 Comments 패널만 "Couldn’t read comments"를 보인다.
  - 트리 행에는 경고 표시와 고정 문장이 붙는다(`aria-describedby` 연결).
    - 댓글 파일: "Couldn’t read this canvas’s comments — run doan check"
    - 캔버스 파일: "Can't read this canvas — run doan check"
  - 원문은 Details에만 둔다.
- Home 요약 줄은 "2 open · 1 resolved to review · 3 without a canvas" 순서다. 좁으면 둘째 줄로 내린다. Overview 카드에는 갈 곳 잃은 수를 보이지 않는다.

## 범위 밖

- 갈 곳 잃은 댓글을 다른 canvas id로 옮기거나 다시 붙이는 것. 이벤트 기록을 다시 쓰는 일이고, 대상 재부착 금지 결정(PRODUCT §5 항목 5 comments-ui Q2)과 맞지 않는다.
- 여러 프로젝트에 걸친 피드백 목록. 이번에는 한 프로젝트(한 root) 단위다.
- `doan comments`·`doan check`·`doan comment resolve`의 부분 실패. 이 명령들은 파일 하나를 읽지 못하면 지금처럼 전체가 실패한다.
- 앱이 꺼져 있는 동안 id가 바뀐 경우의 id 변경 안내. 이 경우에는 Feedback 묶음으로만 보인다.
- 재확인 흐름 자체(`revision-recheck`), 넘기기(`agent-handoff`).

## 결정 (2026-10-25 사용자)

- Q1: 갈 곳 잃은 댓글은 Feedback 패널에서 보고, 사람이 Resolve하거나 Delete할 수 있다. 앱 쓰기 권한 규칙을 확장한다.
- Q2: 프로젝트 피드백 목록은 Overview의 오른쪽 패널(Feedback)에 둔다.
- Q3: `doan ls`는 파일 하나의 읽기 실패를 행 단위 오류로 낮추고 `orphans`를 더한다.
- 리뷰 PF1: 캔버스 행에 읽기·파싱 오류가 있으면 갈 곳 잃은 묶음은 읽기 전용이다.
- 리뷰 PF2: 갈 곳 잃은 해결 댓글에 Reopen을 둔다(사람은 다시 열 수 있다는 기존 결정과 같다).
- 리뷰 PF3: Feedback의 Resolved 정렬과 Review 진입을 `revision-recheck`에 맞춘다. 행 클릭은 마지막 review 시각을 바꾸지 않는다.
- 리뷰 PF4: 고아 판정 규칙, `ls` 계약, 쓰기 경로, 상태와 키보드, 문구, eval과 승격은 위와 design대로 한다.
