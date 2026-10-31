# design-system-canvases — tasks

선행: 충족. remove-mcp는 main에 merge됐다(#48).

순서: sidebar 초안(완료) → CLI 순수 함수 → guide·preset → 앱 순수 함수 → 앱 shell(감시·썸네일·대화) → sidebar UI·`/design-sync` → eval 시나리오 → 이 repo design system 재생성 → code-review·verify → `/agent-eval` → 문서 승격. schema 변경은 없다.

## T1. sidebar 초안 (`/design-draft`) — 완료

- `.doan/canvases/design-system-canvases.html`(프레임 `groups`·`empty`·`row-states`, design.md '초안 요청'). commit `2d5e33d8`·`f03f8915`, 사용자가 앱에서 확정했다.

## T2. CLI: `.doan/ds/` 목록·서빙·check (`/tdd` → `/implement`)

- `repo` 캔버스 목록이 두 디렉터리를 걷고, `Scope`·`MetadataPath`에 `.doan/ds`를 더하고, `no_canvases` 조건과 메시지를 바꾼다(design.md '순수 함수' Go 항목).
- 검증: `go test ./...`, `go vet ./...`. 임시 repo 두 개로 CLI를 직접 돌린다. shell `check`는 기기 로컬 session association을 기록할 수 있으므로 격리한 `DOAN_RUNTIME`을 쓴다.
  - (a) `.doan/ds/`만 있는 repo:
    - `go run ./cli/cmd/doan ls --repo <tmp> --json`이 `.doan/ds/button.html` 행과 `scope`의 `.doan/ds`를 보인다.
    - `check`에 `no_canvases`가 없다.
    - `.doan/ds/x.css`를 링크해도 `css_not_served`가 없다.
    - `doan config --add-serve .doan/ds`를 받아들인다.
    - `.doan/ds/` 안의 빈 캔버스, `doan:width` 누락, id 누락 캔버스에 `.doan/canvases/`와 같은 code가 나온다.
    - `.doan/comments/<ds id>.jsonl`이 `orphan_comment_file`이 아니다.
  - (b) 두 디렉터리에 같은 id가 있는 repo: `duplicate_canvas_id`가 나온다.
  - (c) `.doan/ds`가 symlink인 repo: 건너뛴다.

— commit: `feat(cli): list and serve design-system canvases in .doan/ds`

## T3. guide와 preset 본문

- guide의 네 곳(Project files :11, 컨벤션 1·7, `config` 설명 :45), `document.md`(design.md '`document`의 새 기본'), 나머지 preset 18개의 design system 위치와 `context.md:97`의 트리거 조건, `cli/internal/designskill/SOURCES.md`, `notices/MODIFICATIONS.md`.
- 시작할 때 guide의 렌더링된 plain·`--json` 크기를 다시 잰다.
- 검증: `go test ./...`. 출력 예산 `TestSkillGuideFitsToolOutputCap`·`TestDesignSkillFitsToolOutputCap`(`document --json`)과 catalog·본문·marker 테스트를 포함한다. `rg -n 'design-system' cli/internal/designskill/presets/`의 남은 결과가 옛 위치를 설명하는 문장뿐이다.

— commit: `feat(cli): teach .doan/ds design-system canvases in the guide and presets`

## T4. 앱 순수 함수 (`/tdd` → `/implement`)

- `app/src/formats/`의 경로 판단 함수, `sidebarGroups`(보이는 행 키, ←/→ 대상, 열 묶음), `ui-state` `groups` sanitizer, Home 추천 규칙(Q5), `designChange`(repo 기준 상대 경로), 사라진 캔버스 toast 문구(design.md '순수 함수' TS 항목).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

— commit: `feat(app): recognize .doan/ds canvases`

## T5. 앱 shell: 감시·썸네일·대화·설정 문구

- `watch.ts`가 `.doan/ds/`를 감시하고, `.doan` 이름 목록(:132)에 `ds`를 더하고, `Change.names`를 repo 기준 상대 경로로 바꾼다. `shell.ts` 호출부, `thumbnails.ts`, conversation `store.ts`·`transport.ts`·`acp.ts`, toast 호출부, ProjectSettingsDialog 문구(`clarify` preset 먼저)도 맞춘다.
- `rg -n '\.doan/canvases|"canvases"' app/src --glob '!*.test.*'`로 남은 판정을 하나씩 판단한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`.
  - `watch.test.ts`에 다음을 둔다.
    - `.doan/ds`를 지웠다 다시 만들면 `served: true`
    - `.doan/ds`가 symlink일 때
    - 두 디렉터리의 같은 파일 이름이 서로 다른 `revPaths`가 됨
  - `/runtime-test`로 격리한 앱에서 확인한다.
    - `.doan/ds/` 캔버스를 연다. 그 파일을 고치면 그 캔버스만 다시 그려지고, 열린 캔버스는 다시 불러오지 않아 선택이 유지된다.
    - 열린 캔버스를 `.doan/canvases/`에서 `.doan/ds/`로 옮기면 같은 id로 따라간다.
    - 복사한 뒤 원본을 지우면 중복 id 알림이 나온다.
    - 지우면 toast가 디렉터리 이름을 말한다.
    - 비목표 확인: `.doan/ds/`만 있는 프로젝트의 Overview가 `.doan/ds` 섹션을 보이고 FirstPrompt가 나오지 않는다. FirstPrompt 대기 중 `.doan/ds/`에 새로 생긴 캔버스를 도착으로 센다.

— commit: `feat(app): watch, serve and bind .doan/ds canvases`

## T6. sidebar UI와 Quick Open 아이콘

- `ShellSidebar.tsx`가 `sidebarGroups`로 두 묶음을 그린다. 키 이동·typeahead·초점 이동이 두 묶음을 한 줄로 잇고, ←/→는 APG 규칙(Q11)을 따른다. 묶음 펼침 상태를 `ui-state.json`(`app/src/restore/uiState.ts`, `app/src/main/uiState.ts`)에 저장하고, 열린 캔버스가 바뀌면 그 묶음을 연다(Q12). 잠금 중에도 열고 닫는다.
- `QuickOpenDialog.tsx`: 결과 행은 경로에 따라 `SwatchBook`·`PanelsTopLeft`를 쓰고, Canvases 탭은 `PanelsTopLeft`를 쓴다(Q8).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - ShellSidebar 테스트에 다음을 둔다.
    - 묶음 렌더, 실제 키 이벤트 처리기로 ←/→·typeahead(`typeaheadNext`) 이동
    - 닫힌 묶음의 slot이 프로젝트 행에 보임
    - 펼침 상태 저장
  - Quick Open 테스트에 아이콘을 둔다.
  - `/runtime-test`로 두 묶음, `.doan/ds/`만 있는 프로젝트, 재시작 복원을 확인한다.
  - `/design-sync`로 초안과 계산된 스타일을 맞춘다.

— commit: `feat(app): group design-system canvases in the sidebar`

## T7. eval 시나리오

- D10c를 은퇴시키고 D10d를 만든다(같은 seed·prompt, 자기 checks: `.doan/ds/` 캔버스 1개 이상, 토큰이 ds 캔버스 전체와 규칙 문서 양쪽에 있음, 변경은 `.doan/ds/`까지 허용).
- D11e를 더한다(`.doan/ds/`의 비기본 구성 재사용 → 변경 없음, 다시 나누지 않음).
- D13을 더한다(해당 캔버스 파일만 바뀜, `doan ls` id 집합 그대로, check 통과).
- 각 시나리오에 pass·fail fixture를 둔다. `rg -n 'canvases' eval/scenarios`로 `.doan/canvases/`만 허용하는 판정을 판단하고, D12 rubric(:1)을 확인한다.
- 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`가 `self-test PASS`, exit 0.

— commit: `test(eval): design-system canvases in .doan/ds`

## T8. 이 repo의 design system 다시 만들기 (마지막 구현 task, Claude Code·Codex 각각 생성, 지휘자가 품질 판단)

- 시작 조건: T6의 sidebar UI와 `/design-sync`가 끝난 뒤다. 그 전까지는 지금 캔버스를 확인할 일이 있을 수 있으므로 `buzz-ds.html`·`notice.html`을 남긴다.
- `.doan/canvases/buzz-ds.html`과 `notice.html`을 지운다. `.doan/comments/`에 두 id의 파일이 없는지 먼저 확인한다. 사이드바 초안 `design-system-canvases.html`은 남긴다.
- 모델별 생성(design.md Q4): 지휘자가 지운 상태의 commit에서 worktree를 두 개 만든다(Orca `--worktree new-child --base-branch feat-<slug>`). 한쪽은 Claude Code, 한쪽은 Codex의 새 세션이다. 이 task에 한해 사용자가 모델 계열을 넘는 worker를 허용했다.
  - 두 세션은 같은 조건으로 시작한다. 사람의 요청처럼 "이 repo의 design system을 문서로 만들어줘"만 받는다. 분할 방법을 프롬프트로 알려 주지 않는다. preset만으로 나오는 결과를 판단하기 위해서다.
  - CLI는 그 worktree에서 `go build -o <tmp>/doan ./cli/cmd/doan`으로 만든 것을 `PATH` 앞에 둔다. 설치된 `~/.local/bin/doan`은 이 branch의 preset을 모른다.
  - 각 세션은 자기 worktree의 `.doan/ds/`에만 쓰고 commit한다. 지휘자가 두 벌을 같은 기준으로 본다.
- 지휘자가 두 벌을 design.md '품질 기준'으로 판단한다. 어느 쪽이든 preset 탓으로 못 미치면 원인을 `document.md` 문장으로 고치고, 두 worktree의 캔버스를 지우고, 두 모델의 새 세션으로 다시 만든다. 기준을 채울 때까지 반복한다. 회차마다 모델별로 못 미친 기준과 고친 preset 문장을 commit 메시지에 적는다.
- 정리: 둘 다 기준을 채우면 더 나은 한 벌만 feature branch의 `.doan/ds/`로 가져오고, 고른 이유(기준별 비교)를 commit 메시지에 적는다. 다른 벌은 버리고, 두 worktree와 임시 branch를 지운다(지우기 전에 `git status` 확인).
- 끝나면 `docs/DESIGN.md`(98행 'Shared components and surfaces', 140행 'Notices'의 Reference)와 `docs/DIRECTORY.md`(36행)의 참조를 새 경로와 프레임으로 고친다. DESIGN.md의 'buzz-ds 이전' 표시는 파일 참조가 아니라 측정 시점 라벨이라 그대로 둔다.
- 검증:
  - 남긴 벌이 품질 기준을 전부 충족한다(지휘자 판단, 모델별 회차 기록, 고른 이유).
  - 남긴 벌이 최종 `document.md`에서 나왔다. 마지막 preset 수정 뒤에 다시 만든 벌이어야 한다.
  - 두 worktree와 임시 branch가 없다(`git worktree list`).
  - `go run ./cli/cmd/doan check --repo .`에 이 변경으로 생긴 error가 없다.
  - `go run ./cli/cmd/doan ls --repo . --json`에 DESIGN.md가 가리키는 `.doan/ds/*.html`과 프레임이 모두 있다.
  - preset을 고쳤으면 `go test ./...`(출력 예산)
  - `rg -n --hidden 'buzz-ds\.html|notice\.html' docs .doan AGENTS.md README.md --glob '!docs/features/**' --glob '!docs/POSTMORTEM.md'`의 남은 결과가 PRODUCT.md:291뿐이다(T11에서 지운다).

— commit: preset 조정 `feat(cli): <what changed> in the document preset`, 남긴 벌 `docs(design): regenerate the design system in .doan/ds`(어느 모델의 벌인지와 고른 이유)

## T9. code-review·refactor·verify

- `/code-review` → `/refactor` → `node .agents/skills/verify/scripts/verify.mjs --eval`. T8의 preset 조정까지 포함한다.
- 검증: verify 통과, 남은 code-review 지적이 없거나 사용자가 보류에 동의했다.

## T10. `/agent-eval`

- 검증: `npm --prefix app run package` 후 `node eval/run.ts --round design-system-canvases --scenarios D1,D2b,D4b,D5,D6,D7b,D8,D9,D10d,D11d,D11e,D12,D13`. ARCHITECTURE §14의 현재 세트에서 D10c를 D10d로 바꾸고 D11e·D13을 더한 것이다. 결과를 `docs/USABILITY-EVAL.md`에 적는다. U-013으로 설명되는 partial은 그 issue 행에 기록하고 실패로 세지 않는다. 그 밖의 실패와 이 변경으로 생긴 새 issue 행이 없다.

— commit: `docs(eval): design-system-canvases round`

## T11. 문서 승격

- PRODUCT:
  - §5 item 1(sidebar 묶음, 펼침 기억, slot 문장 155행의 괄호에 '그 묶음이 닫힘' 추가, Home 추천 규칙)
  - item 13 `document`
  - 'Dogfooding' 절
  - §6 'Open questions'의 "Design-system canvases" 항목 삭제(291행)
- ARCHITECTURE:
  - §1 Project directory, 컨벤션 1·7, check 규칙 표(`no_canvases`, `css_not_served`)
  - §3 서빙 범위
  - §6 guide 설명
  - §12 `ls`·`config` 규칙
  - §13 Listing·Watching(`Change.names` 형식 포함)
  - §14 시나리오 세트
- DESIGN.md(sidebar 측정값), DIRECTORY.md(`.doan/ds/`).
- README 13행(`.doan/canvases/<spec>.html`)은 화면 초안 설명이라 그대로 둘지 판단해 적는다.
- buzz-restyle spec:
  - #7 `buzz-project` 행에 넘긴다: Overview의 `.doan/ds/` 섹션 표시(제목, 순서, design-system 캔버스만 있을 때의 빈 상태와 FirstPrompt), Home·Overview 불일치
  - 81행의 예시를 `.doan/ds/`로 고친다.
- 검증: `rg -n 'canvases/design-system|Design-system canvases' docs AGENTS.md README.md`의 남은 결과가 과거 기록뿐이다. docs-only라 이 rg와 링크 대상 확인으로 충분하다.

— commit: 문서별로 나눈다. 마지막에 `docs/features/design-system-canvases/`를 지우는 commit을 따로 둔다(`docs(feature): complete design-system-canvases`).
