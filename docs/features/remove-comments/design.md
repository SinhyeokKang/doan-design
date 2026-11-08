# remove-comments — design

조사 근거: 2026-11-08 저장소 전수 조사(코멘트 관련 파일·줄 목록). 아래 경로는 그 결과다.

## 영향 범위

### CLI (Go)

- **통째로 지운다**: `cli/internal/comments/`(append·resolve와 테스트), `cli/internal/cli/resolve.go`, `cli/internal/cli/comments_resolution_test.go`, `cli/internal/repo/orphans.go`(+테스트), `cli/internal/formats/fold.go`·`fold_text.go`·`fold_test.go`.
- **공용 파일에서 덜어낸다**:
  - `cli/internal/cli/read.go`: `commentFile`, `scanComments`, `readComments`, `List`의 코멘트 수와 `unreadable_comments`, 행의 `comments`/`commentsError`, 최상위 `orphans`, `listedComment`, `Comments()`, `listedWarning`. `readFailure`와 `scanCanvases`는 공용이라 남긴다.
  - `run.go`: usage 두 줄, `comments`/`--canvas`, `comment`/`--agent` 플래그와 dispatch. `agentName` 정규식은 다른 호출처가 없으면 지운다.
  - `envelope.go`: exit 2 목록의 `comment_not_found`.
  - `check.go`(cli)와 `check/check.go`: `Input.CommentFiles`, `orphan_comment_file`.
  - `repo/files.go`: `CommentFile`, `CommentFiles()`. `Canvases()`는 남긴다.
  - `repo/scope.go:103` 주석의 "comment logs".
  - `formats/types.go`: `CommentEvent`, `LocatedEvent`, `Warning`, `Comment`, `LastResolution`, `ParseResult`, `FoldResult`, 그리고 코멘트만 쓰던 `Author`·`Element`·`Target`(다른 비테스트 호출처가 없는 것을 확인한 뒤).
  - `formats/validate.go`: comment-event 등록과 `ValidateCommentEvent`, 등록 순서 주석.
  - `storage.go` `missingAttributes`·`writeAttributes`: 요구 줄을 `.doan/** linguist-documentation` 하나로 줄인다.
  - `brand_test.go`의 하위 명령 목록.
- 코멘트 내용이 많은 테스트(check_test, run_test, list_partial_test, boundaries_test, review_test, repo_test, layout_test, validate_test, skill_test)는 코멘트 사례만 지운다. export 테스트 fixture(`exporttest/seed.go`, inline_test, resolve_test)의 `.doan/comments` 시드는 "export가 메타데이터를 거부한다"를 계속 재는 한 남긴다(디렉터리가 남은 저장소를 흉내 낸다).

### 스키마

- `schema/app-socket.v1.schema.json:139`의 selection `element`와 `schema/sessions.v1.schema.json:11`의 `at`은 지금 `comment-event.v1#/$defs/…`를 `$ref`한다. 같은 정의를 각 스키마의 `$defs`로 옮긴 뒤 `comment-event.v1.schema.json`, `schema/fixtures/comment-event/`, `schema/fixtures/fold/`를 지운다.
- 받아들이는 모양은 바뀌지 않으므로 두 스키마의 `v`는 그대로다. 기존 app-socket·sessions fixture가 Go와 TS 양쪽에서 그대로 통과해야 한다.
- `ls` 결과는 스키마가 없다(ARCHITECTURE §12). 모양 변화는 같은 릴리스의 앱과 CLI가 함께 바뀌고, 앱은 자기 번들의 CLI를 쓰므로 버전을 따로 두지 않는다.

### 가이드와 프리셋 (에이전트 지침, `/agent-eval` 대상)

- `cli/internal/cli/skill.md`:
  - 첫 줄: "comment bodies" 부분을 빼고 `doan active`의 `html`/`text`를 데이터로 다루라는 문장만 남긴다.
  - Project files: `comments/<canvas-id>.jsonl`, "review comments", "comments are never served"를 뺀다.
  - Agent rules: B–F, H, `lastResolution` 문단을 지우고 남은 규칙을 다시 매긴다(결정 D3).
  - Commands: init의 union merge, `ls`의 코멘트 수·`commentsError`·`orphans`, `doan comments`, `doan comment resolve`, exit 코드 문구를 고친다.
  - 밀린 수정 3건: viewport 단위 8개, exit 2의 export 코드 3개, 하위 폴더 캔버스는 `work`와 `open`이 거부하므로 work 신호와 `open`을 건너뛴다는 한 문장.
- `cli/internal/designskill/presets/*.md`: 20개 프리셋의 "open comments를 읽는다"와 "적용한 코멘트만 resolve" 단계, 그 밖의 언급(distill, document, layout, critique, audit, context, extract)을 지운다. Impeccable에서 가져온 본문을 바꾸는 것이므로 `notices/MODIFICATIONS.md`에 적는다.
- `skill_test.go`가 고정한 가이드 문구를 새 문구로 맞춘다. 가이드 크기는 줄어든다.

### 앱 (Electron + TS)

- **지운다**: `app/src/formats/fold.ts`·`foldText.ts`·`fold.test.ts`(이미 테스트만 쓴다), `formats/types.ts`의 코멘트 타입과 `Author`, `formats/validate.ts`의 comment-event 등록과 `validateCommentEvent`.
- **옮긴다(지우면 안 된다)**:
  - `app/src/comments/projection.ts`의 `TargetCandidates`, `PinRect`, `PinGeometry`는 `renderer/canvasMessage.ts`와 `renderer/CanvasController.ts`가 대화 칩의 앵커 조회에 쓴다. 앵커 모듈로 옮기고(결정 D4), `matchTarget`·`copyText`·`INSTRUCTION`·`compareText`는 지운다.
  - `app/src/main/comments/document.ts`(`DocumentBindings`, `ResponseRecord`)와 `identity.ts`(`object`)는 inspector·shell·서버가 쓴다. 이름에 맞는 위치로 옮긴다(결정 D4).
  - `main/canvasScript.ts`의 `commentAnchors`는 대화 칩의 앵커 측정기다. 이름을 `anchors` 계열로 바꾼다(결정 D4).
- **Move to Trash**: `canvasTrash.ts`의 `commentsId`, `TrashPlanReply.comments`, `TrashReply`의 comments 변형, `CommentsFile`/`findComments`, `plan`·`trash`의 코멘트 파일 이동을 지운다. 계획 IPC 자체는 busy·거부 확인에 계속 쓴다. `CANVAS_ID`와 `trashTarget`의 소유 판정은 코멘트 파일 이동만을 위한 부분인지 확인해 그 부분만 지운다. `renderer/CanvasTrashDialog.tsx`의 코멘트 문장, `canvasRowMessages.ts`의 "comments couldn't be moved" 토스트를 지운다.
- **목록·감시**: `folderState.ts`의 `orphanFile`과 `orphans` 파싱, `view.ts`의 `OrphanFile`과 전달, `watch.ts`의 `.doan/comments/` 감시를 지운다.
- **첫 실행**: `onboarding/projects.ts`의 `ATTRIBUTE_LINES`를 한 줄로 줄인다(CLI와 같은 줄).
- **브랜드**: `brand/candidates.ts`의 `SUBCOMMANDS`에서 `comment`, `comments`를 뺀다.
- **문구**: `renderer/RightPanel.tsx:20` "Click an element or frame to inspect or comment on it."에서 comment를 뺀다. 문구는 구현 때 Doan의 clarify 프리셋으로 다듬는다.
- **토큰**: `renderer/tokens.css`의 `--surface-comment`, `--text-comment`는 쓰는 곳이 없다(DESIGN 'Design system' 'Defined but unused'). 지운다.
- 코드 주석의 코멘트 언급(`projectDisplay.ts`의 호출처 없는 `commentContext` 포함)을 정리한다.
- UI는 문장 삭제뿐이라 `/design-draft`를 하지 않는다. Trash 확인 창은 기존 초안(`.doan/canvases/canvas-row-menu.html`)의 코멘트 없는 상태와 같아진다.

### eval

- `eval/lib`: `context.ts`의 `commentEvents()`, `types.ts`의 해당 타입, `scenario.ts`의 focus `"comments"`, `socket.ts`의 `ATTRIBUTE_LINES`(한 줄로).
- 시나리오(결정 D5):
  - 은퇴: 코멘트가 측정 대상인 H1, H4, H6, H7, H8, R1, R3, R6b, R7b. H6·H7은 앱의 `copyText`를 가져다 쓰므로 함께 지운다.
  - 코멘트 없이 유지: 코멘트를 곁들여 시드하거나 확인하던 H2, H3, R4, W2는 코멘트 시드와 코멘트 확인만 뺀다. W2의 `comment_element_id_preserved`(audit.test)는 id 보존을 다른 확인으로 재거나 뺀다.
  - 약 20개 시나리오 시드의 `.gitattributes`에서 union 줄을 뺀다.
  - `regression.test.ts`, `audit.test.ts`, lib 테스트의 코멘트 사례를 정리한다.
- USABILITY-EVAL의 열린 이슈 가운데 코멘트에만 걸린 것은 "obsolete (comments removed)"로 닫는다. 라운드 기록은 그대로 둔다.

### 문서

- PRODUCT: §3 In scope의 코멘트 언급, §3 Out of scope 6의 `.gitattributes` 줄 수, §4 'Loop' 3·5와 'Frames'·'Ids', §5 item 1 Move to Trash, item 5 'Comments'(삭제), item 8 init, item 9 명령, item 11 check.
- ARCHITECTURE: §1(프로젝트 디렉터리, id 규칙 근거 문장, 규칙 A–J, `unparsable_canvas`, `orphan_comment_file`), §2 'Comment storage' 삭제(번호는 비워 둔다; §5도 비어 있다), §3 문서 origin·export, §6, §7 Codex 허용 규칙과 Canvas row menu IPC, §10, §11, §12 exit 코드·`ls` 모양·명령, §13.
- DIRECTORY, DESIGN('Defined but unused'의 두 토큰), README(명령 표, 예시 프롬프트), AGENTS(용어 목록), 개발 스킬(code-review의 코멘트 로그 규칙, tdd의 fold 규칙, feature·feature-review의 "append-only events", agent-eval), BACKLOG(코멘트 항목 정리, 'Known defects'의 가이드 항목 삭제), 저장소 루트 `.gitattributes` 첫 줄.

## 결정

- **D1. 남은 `.doan/comments/`는 조용히 무시한다.** 경고하면 Doan이 직접 만든 적 없는 파일에 대해 사람에게 일을 시키게 된다. 지우는 것은 PRODUCT의 "사람 파일을 지우지 않는다"(§3 Out of scope 6, §5 item 1)와 어긋난다. 서빙·export는 이미 `.doan/` 메타데이터로 막혀 있다(`repo/scope.go` `MetadataPath`).
- **D2. 기존 union 줄은 남긴다.** `.gitattributes`에서 줄을 지우는 것도 사람 파일을 고치는 일이다. 남은 union 줄은 해가 없다.
- **D3. 가이드 규칙은 다시 매긴다(A–D).** 남는 규칙은 A(데이터), G(코드에 없는 것 표시), I(work start), J(work done)다. 빈 글자를 남기면 에이전트가 빠진 규칙을 찾는다. 규칙 글자를 인용하는 곳(ARCHITECTURE §1, `.agents/skills/design-draft/SKILL.md`, `eval/lib/work.ts` 주석, eval 체크)을 함께 고친다.
- **D4. 공용 코드는 이름에 맞게 옮긴다.** `TargetCandidates`·`PinRect`·`PinGeometry`는 renderer의 앵커 모듈로, `main/comments/document.ts`·`identity.ts`는 `main/` 아래 문서 바인딩 모듈로 옮기고, `commentAnchors`는 `anchors`로 바꾼다. 위치와 이름은 구현 worker가 기존 구조(`docs/DIRECTORY.md`)에 맞춰 정하고 DIRECTORY에 적는다.
- **D5. 코멘트가 측정 대상인 시나리오는 은퇴한다.** 코멘트 없이 같은 것을 잴 수 없기 때문이다. R3(코멘트 본문을 통한 지시 주입)가 은퇴하면 `doan active` `html`/`text`를 통한 주입은 지금 eval에서 재지 않는다. 그 공백은 USABILITY-EVAL 이슈로 남긴다(새 시나리오는 비목표).

## 순수 함수 (/tdd 대상)

- `missingAttributes`(Go)와 앱의 `.gitattributes` 계획: 한 줄만 요구하고, union 줄이 있든 없든 결과가 같다.
- `check` 규칙 목록: `.doan/comments/`가 있어도 finding이 없다.
- `ls` 결과 조립(`List`): 코멘트 필드와 `orphans`가 없다.
- 앱 `canvasTrash` 계획 함수: comments 필드 없이 busy·거부 판정이 그대로다.
- 스키마 검증(Go `validate.go`, TS `validate.ts`): 옮긴 `$defs`로 기존 app-socket·sessions fixture가 통과한다.

## 형식 변경

- comment-event 스키마와 fixture 삭제. app-socket.v1·sessions.v1은 `$defs`만 안으로 옮기고 받아들이는 모양과 `v`는 그대로다.
- `ls` 결과에서 세 필드 삭제, 오류 코드 두 개 삭제(스키마 없는 결과, 같은 번들).

## 규약·결정 영향

- ARCHITECTURE §1 'Conventions'의 에이전트 규칙(A–J → A–D)과 `doan check` 규칙 하나(`orphan_comment_file`)가 바뀐다.
- ARCHITECTURE의 "append-only events" 결정은 코멘트 이벤트에 대한 것이므로 함께 사라진다. 대화 저장(`conversations/`)의 append 규칙은 별개라 그대로다.
- "Doan은 git을 하지 않는다"(§3 Out of scope 6)는 그대로다. `.gitattributes`에 쓰는 줄이 하나로 준다.

## POSTMORTEM에서 가져올 함정

- 2026-10-29 "Codex cut the middle out of the doan guide": 에이전트가 도구로 읽는 텍스트(가이드, 프리셋, nextSteps)를 바꿀 때 출력 예산 테스트를 다시 보고, 끝 표시가 중간 잘림을 잡지 못한다는 점을 기억한다(`rg -n 'skillOutputBudget' cli/internal/cli`). 이번에는 줄어드는 변경이지만 밀린 수정 3건이 더해진다.
- 2026-10-24 "Agent shells bypassed the evaluation runner's packaged CLI", 2026-11-02 "Evaluation unit checks inherited the real session-recording runtime": eval 시나리오를 고칠 때 패키지된 CLI와 격리된 `DOAN_RUNTIME`을 그대로 쓴다.
- 2026-11-07 "The eval fake's auth status comparison broke when the app's DTO gained a field": 앱 DTO(`ls` 결과, Trash 응답)의 모양을 바꾸면 eval의 가짜 앱과 답 파서도 같은 커밋에서 맞춘다.

## PoC 의존

없다. 삭제와 이동뿐이고, 새 동작은 "무시한다"뿐이다.
