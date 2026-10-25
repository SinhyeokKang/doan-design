# agent-handoff — 넘길 피드백을 확인하고 에이전트에게 넘긴다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-8, L-11, L-12, L-21, 제안 N2·N5와 리뷰 W-2·W-3·W-8, A-4·A-8·A-9·A-10·A-12·A-13, T-5, P-2·P-7. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S1 log 클립보드·`doan active`, S2 #4, S3 #10–#11)에 있다.

## 사용자

- **사람**: 리뷰를 마치고 자기 에이전트(Claude Code, Codex)에게 피드백을 넘기는 사람이다. 무엇을 몇 개 넘기는지 확인하고, 복사하거나 "fix this"라고 말한다.
- **에이전트**: 붙여넣은 지시문이나 "fix this"를 받아 doan CLI/MCP로 댓글을 읽고 적용·해결한 뒤, 무엇을 해결하고 무엇을 남겼는지 대화에서 보고한다.

## 문제 (관찰한 사실)

1. **"Copied"가 사실과 어긋난다(L-8).** Copy all open 뒤 새 댓글을 추가해도 "Copied"와 "Copied all open comments on this canvas."가 남는다(S2 #4). 에이전트가 해결한 카드에도 "Copied"가 남는다(S1 #22). 카드 여러 개를 차례로 복사하면 모두 Copied지만 클립보드에는 마지막 것만 있다(코드 확인).
2. **넘기는 내용을 사람이 확인할 수 없다(L-11).** 클립보드에는 영어 한 문장과 `{"root","canvas","comments":[id…]}`만 있다. 본문, 대상, 개수가 없고 doan이라는 이름도 없다(S1 log). 확인 문구는 댓글 내용을 복사한 것처럼 읽힌다. "에이전트에 붙여넣으세요" 안내가 없다.
3. **넘기는 범위가 둘뿐이다(A-10).** 댓글 하나 또는 캔버스 전체다. "이 프레임"이나 "지금 선택한 대상"만 넘기려면 하나씩 여러 번 붙여넣어야 한다.
4. **"fix this" 경로가 앱에 드러나지 않는다(L-12).** `doan active`는 선택을 정확히 돌려주지만(S1 log), 앱은 에이전트가 선택을 읽는다는 사실을 말하지 않는다. skill은 active 대상에 달린 열린 댓글을 함께 처리하라고 지시하지 않는다.
5. **에이전트가 무엇을 남겼는지 이유를 알 수 없다(A-8).** 지시문과 skill은 "적용한 것만 해결하라"고만 한다. 남긴 댓글과 그 이유를 보고하라는 요구가 없다. 앱의 복사 지시문을 그대로 쓰는 agent-eval 시나리오가 없다.
6. **worktree가 다르면 피드백이 서로 보이지 않는다(L-21).** 댓글은 worktree마다 별도 파일이다(S3 #11). 지시문의 `root`는 사람이 본 worktree다. `active`는 root를 문자 그대로 비교하므로, 다른 worktree에서 물으면 `{}`를 받는다. 에이전트 쪽 동작은 미확인이다.
7. **`project_not_open`의 다음 행동이 틀렸다(A-13).** 실제 원인은 "저장된 프로젝트 목록에 없음"이라 사람이 할 일은 Add Project다. 그런데 안내는 "open this project"라고 한다.

## 완료 조건

- Hand off… 대화상자가 넘길 열린 댓글을 체크박스 목록(대상, 본문 첫 줄)으로 보이고, All/None/Selection 빠른 선택과 지시문 원문 미리보기를 제공한다. 복사 버튼에는 체크된 개수가 있다("Copy 3").
- 복사에 성공하면 대화상자에 "Copied an instruction for 3 comments. Paste it into your Claude Code or Codex session, or select a target and say “fix this”."가 보인다. Comments 머리에는 "Handed off 3 · 14:02"가 남는다. 넘긴 댓글 중 하나가 해결되거나 다시 열리거나 새 열린 댓글이 생기거나 다른 복사를 하면 이 표시는 지워진다.
- 사람은 열린 댓글을 하나 이상 골라 넘길 수 있다. main은 고른 id가 모두 그 캔버스의 열린 댓글일 때만 지시문을 만든다.
- 지시문은 doan을 명시하고("using the doan CLI or MCP tools"), 해결한 댓글과 남긴 댓글을 id별로 이유와 함께 보고하라고 요구한다. 형식 결정 PRODUCT §5 항목 6(경로, 캔버스 id, 댓글 id)은 유지한다.
- 선택이 있을 때 Inspector 머리나 Comments의 Selection 범위에 "Your agent can read this selection — say “fix this”."가 보인다. Home의 "Selected:"는 "Selected for your agent:"가 된다.
- skill 본문에 다음이 추가된다:
  - `doan active` 대상에 열린 댓글이 달려 있으면 그것을 읽고, 사용자의 요청이 그것을 가리키면 적용한 뒤 해결한다.
  - 마지막 답에서 해결한 것과 남긴 것을 id와 이유로 보고한다.
- agent-eval에 두 시나리오를 추가하고, 두 에이전트 모두 기준을 통과한다.
  - 앱의 복사 지시문을 그대로 붙여넣는 시나리오
  - 선택 + 달린 댓글 + "fix this" 시나리오
- `project_not_open`의 nextSteps는 "Ask the user to add this project in Doan (Add Project…)"이다.
- 대화상자가 "Comments are per worktree. Your agent should work in <branch> (<path>)."를 보이고, skill이 JSON root와 작업 디렉터리가 다를 때의 행동을 지시한다. agent-eval 시나리오가 이를 측정한다.

## 범위 밖

- doan이 에이전트를 깨우거나 대화에 직접 넣는 것. 범위 밖 결정(PRODUCT §3-4)을 유지한다.
- 댓글 답글과 대화. 범위 밖 결정(§3-3)을 유지한다. 에이전트의 보고는 에이전트 대화에서만 이뤄진다.
- "넘겼음" 상태를 저장소에 기록하는 것. 넘기기 상태는 앱의 세션 표시일 뿐이다.
- 해결 기록·재확인(`revision-recheck`).

## 결정 (2026-10-25 사용자)

- Q1: 넘기기는 별도 대화상자(Hand off…)로 한다. 미리보기 목록과 지시문 원문을 보인다.
- Q2: 넘길 댓글은 대화상자의 체크박스로 고른다(All / None / Selection 빠른 선택). PRODUCT §5 항목 6·Q6을 바꾼다.
- Q3: worktree는 대화상자 안내, skill 한 줄, agent-eval 측정으로 다룬다.
