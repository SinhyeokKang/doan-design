# project-feedback — 프로젝트의 피드백을 한곳에서 보고, 갈 곳 잃은 댓글을 찾는다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-3, L-5, 제안 N3과 리뷰 W-1, A-3, T-4, P-12. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S3 #5, #8, #9)와 CLI 재현(`doan ls --json` → `internal_error … permission denied`)에 있다.

## 사용자

- **사람**: 여러 캔버스에 걸친 피드백을 훑어보고 이동하는 사람이다. 에이전트가 캔버스 id를 바꾸거나 캔버스를 지운 뒤 남은 댓글을 찾는다.
- **에이전트**: `doan ls`가 댓글 파일 하나의 읽기 실패로 전체 실패하지 않는다. 갈 곳 잃은 댓글 파일이 `ls` 결과에 나온다.

## 문제 (관찰한 사실)

1. **캔버스 id가 바뀌면 그 댓글이 앱에서 사라진다(L-3).** 열린 캔버스의 `doan:canvas`를 바꾸자 패널이 "Open 0 · Resolved 0"이 되고 사이드바 배지가 사라졌다(S3 #8). `doan check`는 `orphan_comment_file` 경고만 낸다. `doan comments --json`은 같은 댓글을 여전히 열린 상태로 돌려준다. 앱에는 이 댓글을 보거나 다룰 화면이 없다. 캔버스를 삭제해도 같다(코드 확인).
2. **댓글 파일 하나를 읽지 못하면 프로젝트 전체가 "Config error"가 된다(L-5).** `.doan/comments/<id>.jsonl` 하나가 읽기 불가이면 `doan ls`가 `internal_error`로 실패한다(`read.go` `readComments`). 앱은 상태 줄 "Config error", 빈 트리, 절대 경로가 든 원문 오류를 보인다(S3 #5). 캔버스 파일 하나를 읽지 못할 때도 같은 경로로 실패한다(`readCanvases`, 코드 확인).
3. **프로젝트 단위로 피드백을 볼 곳이 없다(N3, P-12).** Overview 카드와 트리는 캔버스별 열린 수만 보인다. 어느 캔버스의 어느 프레임에 무엇이 남았는지 보려면 캔버스를 하나씩 열어야 한다. Overview의 오른쪽 패널은 "No canvas open"으로 비어 있다.

## 완료 조건

- Overview에서 프로젝트의 피드백 목록(Overview의 오른쪽 Feedback 패널)이 보인다. 열린 댓글을 캔버스 → 프레임 순으로 묶고, Resolved 전환과 각 묶음의 개수를 둔다. 행을 누르면 그 캔버스를 열고 대상 위치로 간다(`revision-recheck`의 위치로 가기).
- 갈 곳 잃은 댓글 파일(목록에 같은 id의 캔버스가 없는 `.doan/comments/<id>.jsonl`)은 목록 맨 위 "Comments without a canvas" 묶음에 보인다. 옛 id, 열린 수·해결 수, 본문이 보이고, 안내 "Restore `<meta name="doan:canvas" content="<id>">` in the canvas, or ask your agent."가 있다. 각 댓글에 Resolve와 Delete가 있다(Q1 결정). Delete는 기존 삭제 확인을 거친다. 작성·편집·Reopen과 위치로 가기는 없다.
- 열린 캔버스의 id가 바뀌어 댓글이 갈 곳을 잃으면, 그 캔버스의 Comments 패널에 "N comments stay under the previous ID <old-id>. Show"가 보인다. Show는 피드백 목록의 그 묶음으로 간다.
- 댓글 파일 하나를 읽지 못해도 `doan ls`는 성공한다. 그 캔버스 행에 읽기 오류가 표시되고, 앱 트리는 남는다. 그 캔버스의 Comments 패널만 "Couldn’t read comments"를 보인다. 캔버스 파일 하나를 읽지 못할 때도 그 행만 오류다.
- Home 행과 Overview 카드의 열린 수에 갈 곳 잃은 댓글의 열린 수가 따로 보인다("2 open · 3 without a canvas").

## 범위 밖

- 갈 곳 잃은 댓글을 다른 canvas id로 옮기거나 다시 붙이는 것. 이벤트 기록을 다시 쓰는 일이고, 대상 재부착 금지 결정(PRODUCT §5 항목 5 Q2)과 맞지 않는다.
- 여러 프로젝트에 걸친 피드백 목록. 이번에는 한 프로젝트(한 root) 단위다.
- 재확인 흐름(`revision-recheck`), 넘기기(`agent-handoff`).

## 결정 (2026-10-25 사용자)

- Q1: 갈 곳 잃은 댓글은 Feedback 패널에서 보고, 사람이 Resolve하거나 Delete할 수 있다. 이를 위해 앱 쓰기 권한 규칙을 확장한다.
- Q2: 프로젝트 피드백 목록은 Overview의 오른쪽 패널(Feedback)에 둔다.
- Q3: `doan ls`는 파일 하나의 읽기 실패를 행 단위 오류로 낮추고, 갈 곳 잃은 댓글 파일 요약 `orphans`를 더한다.
