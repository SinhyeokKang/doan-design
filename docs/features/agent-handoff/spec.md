# agent-handoff — 넘길 피드백을 확인하고 에이전트에게 넘긴다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-8, L-11, L-12, L-21, 제안 N2·N5와 리뷰 W-2·W-3·W-8, A-4·A-8·A-9·A-10·A-12, T-5, P-2·P-7. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S1 log의 클립보드·`doan active` 출력, S2 #4, S3 #10–#11, `review-A.md` A-13)에 있다.

선행 기능:
- `comments-readability`: `targetLabel`
- `revision-continuity`: (root, canvas id) 키 원칙과 `rename`

## 사용자

- **사람**: 리뷰를 마치고 자기 에이전트(Claude Code, Codex)에게 피드백을 넘기는 사람이다. 무엇을 몇 개 넘기는지 확인한 뒤 복사하거나, 대상을 선택하고 "fix this"라고 말한다.
- **에이전트**: 붙여넣은 지시문이나 "fix this"를 받아 doan CLI/MCP로 댓글을 읽고, 적용하고, 해결한다. 끝나면 해결한 댓글과 남긴 댓글을 대화에서 보고한다.

## 문제 (관찰한 사실)

1. **"Copied"가 사실과 어긋난다(L-8).**
   - Copy all open 뒤에 새 댓글을 추가해도 "Copied"와 "Copied all open comments on this canvas."가 그대로 남는다(S2 #4).
   - 에이전트가 해결한 카드에도 "Copied"가 남는다(S1 #22).
   - 카드 여러 개를 차례로 복사하면 모두 Copied로 표시되지만 클립보드에는 마지막 것만 있다(코드 확인).
2. **넘기는 내용을 사람이 확인할 수 없다(L-11).**
   - 클립보드에는 영어 한 문장과 `{"root","canvas","comments":[id…]}`만 들어간다. 본문, 대상, 개수가 없고 doan이라는 이름도 없다(S1 log).
   - 확인 문구는 댓글 내용을 복사한 것처럼 읽힌다.
   - "에이전트에 붙여넣으라"는 안내가 없다.
3. **넘기는 범위가 둘뿐이다(A-10).** 댓글 하나 아니면 캔버스 전체다. 지금 선택한 대상의 댓글만, 또는 몇 개만 골라 넘기려면 하나씩 여러 번 붙여넣어야 한다.
4. **"fix this" 경로가 앱에 드러나지 않는다(L-12).**
   - `doan active`는 선택을 정확히 돌려준다(S1 log). 그런데 앱은 에이전트가 선택을 읽는다는 사실을 알려주지 않는다.
   - skill은 active 대상에 달린 열린 댓글을 함께 처리하라고 지시하지 않는다.
5. **에이전트가 남긴 댓글과 그 이유를 알 수 없다(A-8).**
   - 지시문과 skill은 "적용한 것만 해결하라"고만 한다.
   - 앱의 복사 지시문을 그대로 쓰는 agent-eval 시나리오가 없다.
6. **worktree가 다르면 피드백이 서로 보이지 않는다(L-21).**
   - 댓글은 worktree마다 별도 파일이다(S3 #11).
   - 지시문의 `root`는 사람이 본 worktree다.
   - `active`는 root를 문자 그대로 비교하므로, 다른 worktree에서 물으면 `{}`가 돌아온다.
7. **`project_not_open`의 다음 행동이 틀렸다(A-13).** 실제 원인은 "저장된 프로젝트 목록에 없음"인데 안내는 "open this project"다.

## 완료 조건

### 넘기기 대화상자
- Comments 머리에 "Hand off…"를 둔다. 카드의 넘기기도 "Hand off…"이며, 그 댓글 하나만 체크된 같은 대화상자를 연다. 해결된 카드에는 Hand off…가 없다.
- 대화상자 구성
  - 제목은 "Hand off to your agent"이고 프로젝트·worktree·캔버스 이름을 보인다.
  - 열 때 고정한 열린 댓글 목록을 체크박스 행(대상 `targetLabel`, 본문 첫 줄 한 줄 말줄임, 전체는 title)으로 보인다. 행 순서는 Canvas 목록과 같다.
  - 목록만 내부 스크롤한다(최대 8행 높이). 머리와 버튼 줄은 고정한다.
  - 빠른 선택은 All / None / Selection이다. 누를 때마다 적용되는 버튼이며 눌린 상태를 표시하지 않는다.
    - Selection은 연 시점의 선택에 Comments Selection 필터와 같은 규칙을 적용한다.
    - 선택이 없으면 비활성이고 title은 "Select an element or frame on the canvas first."다.
    - 선택한 대상에 열린 댓글이 없으면 비활성이고 title은 "No open comments on <target>."다.
  - 지시문 원문 미리보기는 "Show instruction" 펼침 안에 둔다. 읽기 전용이고 선택할 수 있는 텍스트다.
  - worktree 안내: 같은 저장소에 worktree가 둘 이상일 때만 보인다. "Comments are per worktree. Your agent should work in <branch> (<path>)." 브랜치가 없으면 "Your agent should work in <path>."다.
  - 버튼은 [Cancel] [Copy N]이다.
    - 체크가 0개이면 Copy는 비활성이고 "Choose at least one comment."를 보인다.
- 키보드
  - 대화상자를 열면 Copy N에 포커스가 가고, Return은 Copy를 누른다.
  - Escape는 Cancel이며 포커스를 대화상자를 연 버튼으로 돌린다. 그 버튼이 사라졌으면 Comments 제목으로 돌린다.
  - Space는 체크박스를 토글한다.
  - Tab 순서는 빠른 선택 → 목록 → 미리보기 펼침 → worktree 안내 → Cancel → Copy다.
  - IME 조합 중에는 Return과 Escape를 무시한다.
- 상태
  - 복사 중: 버튼이 "Copying…"이고 체크박스와 버튼은 비활성이다.
  - 실패: 기존 `COPY_FAILED` 문구를 `role="alert"`로 보이고 버튼은 "Retry copy"가 된다. 체크는 유지하고 Handed off는 바꾸지 않는다.
  - 성공: "Copied an instruction for 3 comments. Paste it into your Claude Code or Codex session."이 보이고(1개면 단수), [Done]이 기본 버튼이 된다. 복사 중에 대화상자를 닫았어도 성공하면 Handed off를 남긴다.
  - 연 사이 바뀜: 체크한 댓글 가운데 이미 열린 상태가 아닌 것이 있으면 main이 복사를 거부한다. 그러면 "2 comments are no longer open and were removed from the list. Review and copy again."이 보이고, 남은 체크는 유지되며 새로 생긴 열린 댓글은 체크되지 않은 채 추가된다.

### Handed off 표시
- Comments 머리의 Hand off… 옆에 "Handed off 3 · 14:02:10"이 보인다. 시각 형식은 Activity와 같다.
- 넘긴 id가 모두 열린 상태가 아니게 되거나 다른 복사를 하면 지운다. 새 댓글이 생기거나 일부만 해결된 경우에는 유지한다. 부분 진행은 `revision-recheck`가 보인다.
- 앱 세션 안에서 (root, canvas id)마다 기억하므로 캔버스를 오가거나 이동·rename해도 남는다. 재시작하면 사라진다.
- 카드별 Copied 표시는 없앤다.

### 지시문
- 지시문은 doan을 명시하고, 목록에 있는 댓글만 해결하며, 적용한 것만 해결하라고 요구한다. 마지막 답에서 각 댓글을 id·대상·본문 앞부분으로 밝히고 해결/남김과 이유를 보고하라고 요구한다. root가 작업 디렉터리와 다르면 사용자에게 묻게 한다.
- 형식 결정 PRODUCT §5 항목 6(경로, 캔버스 id, 댓글 id)은 유지한다.

### "fix this"
- 선택이 있을 때 Inspector 머리의 `use-hint` 줄 아래에 "Your agent can read this selection — say “fix this”."가 보인다.
- Home의 "Selected:"는 "Selected for your agent:"가 된다.

### skill과 CLI
- skill 본문
  - 규칙 C: `doan active` 대상에 열린 댓글이 달려 있으면 그것을 읽고, 사용자의 요청이 그 댓글을 가리키면 적용한 뒤 해결한다.
  - 규칙 F: 마지막 답에서 해결한 것과 남긴 것을 id·대상·이유로 보고한다.
  - 지시문 root가 작업 디렉터리와 다르면 사용자에게 어느 worktree에서 일할지 묻는다.
- `project_not_open`의 nextSteps는 "Ask the user to add this project in Doan (Add Project…), or work in the worktree that is open in Doan"이다.

### agent-eval
- 새 시나리오 세 개
  - 복사 지시문 그대로: 해결한 집합이 적용한 집합과 같다. 목록 밖 댓글은 해결하지 않는다. 마지막 답에 모든 id의 해결/남김과 이유가 있다.
  - 선택 + 달린 댓글 + "fix this"(MCP 사용): `active`를 호출하고, 대상에 달린 댓글만 읽고 해결한다.
  - worktree 불일치: root가 작업 디렉터리와 다르면 다른 worktree를 고치지 않고 사용자에게 묻는다.
- 두 에이전트 모두 `--repeat 3`에서 3/3 pass(check와 교차 judge)여야 한다.

## 범위 밖

- doan이 에이전트를 깨우거나 대화에 직접 넣는 것. 범위 밖 결정 PRODUCT §3-4를 유지한다.
- 댓글 답글과 대화. 범위 밖 결정 §3-3을 유지한다. 에이전트의 보고는 에이전트 대화에서만 이뤄진다.
- "넘겼음" 상태를 저장소에 기록하는 것. Handed off는 앱 세션 표시일 뿐이다.
- 프레임과 그 하위 댓글을 한 번에 묶는 빠른 선택. 프레임 단위는 체크박스로 고른다.
- 여러 캔버스를 한 지시문으로 넘기는 것. 지시문 형식에는 캔버스가 하나뿐이다.
- 다른 worktree로 댓글을 옮기거나 합치는 것(git 연산 없음, §3-6).
- 해결 기록·재확인(`revision-recheck`). 단, Review Done 뒤의 "Hand off…" 진입점은 이 대화상자를 다시 연 id가 체크된 상태로 연다.

## 결정 (2026-10-25 사용자)

- Q1: 넘기기는 별도 대화상자(Hand off…)로 하고, 미리보기 목록과 지시문 원문을 보인다.
- Q2: 넘길 댓글은 체크박스로 고른다(All / None / Selection). PRODUCT §5 항목 6·Q6을 바꾼다.
- Q3: worktree는 대화상자 안내, skill 한 줄, agent-eval 측정으로 다룬다.
- 리뷰 AH1: 카드의 Hand off…도 대화상자를 열고, Copy를 기본 버튼으로 둔다(클릭 → Return).
- 리뷰 AH2: Handed off는 넘긴 댓글이 모두 열린 상태가 아니게 되거나 다른 복사를 할 때만 지운다. (root, canvas id)별로 세션 동안 기억한다.
- 리뷰 AH3: 지시문 root가 다르면 에이전트는 사용자에게 묻는다.
- 리뷰 AH4: eval 러너를 확장해 worktree 상황을 측정한다.
- 리뷰 AH5: 대화상자의 키보드와 상태, 문구, CopyScope 단순화, eval 기준, 승격 위치는 위와 design대로 한다.
