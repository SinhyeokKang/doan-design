# remove-comments — design

조사 근거: 2026-11-08 저장소 전수 조사와 `/feature-review`(product·tech·QA·UX/UI). 아래 경로는 그 결과다.

## 영향 범위

### CLI (Go)

- **통째로 지운다**: `cli/internal/comments/`(append·resolve와 테스트), `cli/internal/cli/resolve.go`, `comments_resolution_test.go`, `cli/internal/repo/orphans.go`(+테스트), `cli/internal/formats/fold.go`·`fold_text.go`·`fold_test.go`, `formats/types.go`(코멘트 밖 호출처 없음: `Element`·`Target`·`Author` 포함).
- **공용 파일에서 덜어낸다**:
  - `cli/internal/cli/read.go`: `commentFile`, `scanComments`, `readComments`, `List`의 코멘트 수와 `unreadable_comments`, 행의 `comments`/`commentsError`, 최상위 `orphans`, `listedComment`, `Comments()`, `listedWarning`. `readFailure`와 `scanCanvases`는 남긴다.
  - `run.go`: usage 두 줄, `comments`/`--canvas`, `comment`/`--agent` 플래그와 dispatch, `Flags.Canvas`·`CanvasSet`·`Agent`, `agentName` 정규식(`resolve.go`만 쓴다).
  - `envelope.go`의 `comment_not_found`; `check.go`(cli)와 `check/check.go`의 `Input.CommentFiles`, `orphan_comment_file`; `repo/files.go`의 `CommentFile`, `CommentFiles()`(`Canvases()`는 남김); `repo/scope.go:103`과 `formats/doc.go:1`의 주석.
  - `formats/validate.go`: comment-event 등록과 `ValidateCommentEvent`를 지운다. 모든 스키마를 먼저 등록한다는 주석은 남기고 이유를 "app-socket v3가 v4를 절대 `$id`로 `$ref`한다"로 고친다.
  - `storage.go` `missingAttributes`·`writeAttributes`: 요구 줄을 `.doan/** linguist-documentation` 하나로 줄인다(init과 `config --storage repo` 둘 다).
- **테스트**: 코멘트 사례를 지우는 파일은 check_test, run_test, list_partial_test, boundaries_test, review_test, repo_test, layout_test, validate_test, skill_test, storage_review_test(`merge=union` 단언), init_publication_test, init_audit_test, sessions_test, ds_test, cli/scope_test, envelope_test다. `args_test.go:20`의 interspersed 사례는 `comment … resolve` 대신 `work update <p> --frame x`로 바꿔 커버리지를 유지한다. export 테스트(`exporttest/seed.go`, inline_test, resolve_test)의 `.doan/comments` 시드는 "export가 메타데이터를 거부한다"를 계속 재므로 남긴다.

### 스키마와 공유 fixture

- `app-socket.v1.schema.json:139`의 selection `element`와 `sessions.v1.schema.json:11`의 `at`을 각 스키마의 `$defs`로 옮긴다(두 스키마에는 이미 `$defs`가 있다). 받아들이는 모양이 같으므로 `v`는 그대로다.
- comment-event의 무효 사례 가운데 옮긴 정의를 재던 것(`element-missing-html`, `element-missing-selector`, `unknown-element-field`, `at-offset`)을 `schema/fixtures/app-socket/selection/invalid/`와 `sessions/invalid/`로 옮긴 뒤 `comment-event.v1.schema.json`, `schema/fixtures/comment-event/`, `schema/fixtures/fold/`를 지운다. Go와 TS가 같은 fixture를 읽는다.
- `schema/fixtures/brand/cases.json`의 `command-comments` 사례는 Go `brand_test.go:33`과 TS `brand/candidates.ts:11`이 함께 읽는다. 사례를 남는 명령(`doan ls`)으로 바꾸고 Go·TS 목록을 같은 커밋에서 고친다.
- `schema/fixtures/cli-envelope/design-skill/get-clarify.json`은 clarify 프리셋 본문을 담는다. 프리셋을 고친 커밋에서 다시 만든다(`TestFixturesMatchCatalog`, 앱 `designSkills.test.ts`).
- `ls` 결과는 스키마가 없다(ARCHITECTURE §12). 앱은 자기 번들의 CLI를 쓰므로 같은 릴리스에서 함께 바뀐다. dev 실행은 PATH의 `doan`을 쓸 수 있으니(ARCHITECTURE §7 'CLI lookup') 앱의 `ls` 파싱은 옛 CLI가 보내는 `orphans`·`comments`를 무시해야 한다(지금도 관대하게 읽는다).

### 가이드와 프리셋 (에이전트 지침, `/agent-eval` 대상)

- `cli/internal/cli/skill.md`:
  - 첫 줄: "comment bodies" 부분을 빼고 `doan active`의 `html`/`text`를 데이터로 다루라는 문장만 남긴다.
  - Project files: `comments/<canvas-id>.jsonl`, "review comments", "comments are never served"를 뺀다.
  - Agent rules: B–F와 `lastResolution` 문단을 지운다. H는 남기고 이유를 "대화 칩(`doan:<canvas-id>/…`)이 캔버스 id로 대상을 찾으므로"로 바꾼다(ARCHITECTURE §7 `replyChipTarget`). 남은 규칙을 다시 매긴다(D3).
  - 규칙 J(새 글자 E): 캔버스를 `doan ls` title이 아니라 앱처럼 파일 이름(stem)으로 부른다(PRODUCT §5 item 2).
  - Commands: init의 union merge, `ls`의 코멘트 수·`commentsError`·`orphans`, `doan comments`, `doan comment resolve`, exit 코드 문구를 고친다.
  - 밀린 수정: viewport 단위 8개, exit 2의 export 코드 3개, "하위 폴더 캔버스는 `work`와 `open`이 거부하므로 work 신호와 `open`을 건너뛴다" 한 문장.
- `cli/internal/designskill/presets/*.md`: 20개 프리셋의 코멘트 단계와 그 밖의 언급(distill, document, layout, critique, audit, context, extract)을 지우고, "Doan guide rule G"를 새 글자로 고친다(critique, audit, generate, shape). Impeccable 본문을 바꾸므로 `notices/MODIFICATIONS.md`에 적는다.
- `skill_test.go`가 고정한 문구와 규칙 글자를 맞춘다.

### 앱 (Electron + TS)

- **지운다**: `app/src/formats/fold.ts`·`foldText.ts`·`fold.test.ts`(프로덕션 import 없음), `formats/validate.ts`의 comment-event 등록과 `validateCommentEvent`(등록 순서 주석은 Go와 같이 이유만 고친다), `validate.test.ts:33`의 comment-event 행, `formats/types.ts`의 코멘트 타입(`Comment`·`Target`은 `comments/projection.ts`가 B2에서 정리될 때까지 남긴다).
- **옮긴다(지우면 안 된다)**, D4:
  - `app/src/comments/projection.ts`의 `TargetCandidates`, `PinRect`, `PinGeometry`는 `renderer/canvasMessage.ts`와 `renderer/CanvasController.ts`가 대화 칩의 앵커 조회에 쓴다. 앵커 모듈로 옮기고 `matchTarget`·`copyText`·`INSTRUCTION`·`compareText`는 지운다(남는 클립보드 헬퍼 `renderer/copyText.ts`와 다르다).
  - `app/src/main/comments/document.ts`(`DocumentBindings`, `ResponseRecord`)와 `identity.ts`(`object`)는 `index.ts`, `inspector.ts`, `shell.ts`, `serve/server.ts`가 쓴다. 문서 바인딩 모듈로 옮긴다.
  - `main/canvasScript.ts`의 `commentAnchors`는 대화 칩의 앵커 측정기다. `anchors` 계열 이름으로 바꾼다.
- **Move to Trash**: `canvasTrash.ts`의 `commentsId`, `TrashPlanReply.comments`, `TrashReply`의 comments 변형, `CommentsFile`/`findComments`, `plan`·`trash`의 코멘트 파일 이동, 코멘트에만 쓰는 `CANVAS_ID`와 `owned` 판정을 지운다. `trashTarget`은 `canvasExport.ts`가 쓰므로 남기고, `target.id`는 `trashBusy`가 계속 쓴다. 계획 IPC는 busy·거부 확인에 계속 쓴다.
  - `renderer/CanvasTrashDialog.tsx`의 코멘트 문장과 주석(:7), `canvasRowMessages.ts`의 "comments couldn't be moved" 토스트와 주석(:15), `App.tsx:1251`·`preload/index.ts:385` 주석을 고친다. 확인 창 본문은 plan과 상관없이 늘 같은 문장이 되고, plan이 오기 전 Move to Trash가 `aria-disabled`인 동작은 그대로다.
- **목록·감시**: `folderState.ts`의 `orphanFile`과 `orphans` 파싱, `view.ts`의 `OrphanFile`과 전달, `watch.ts`의 `.doan/comments/` 감시와 주석을 지운다.
- **첫 실행·설정**: `onboarding/projects.ts`의 `ATTRIBUTE_LINES`를 한 줄로 줄인다(Go·eval과 같은 줄). `ProjectSettingsPage.tsx` `attributesStay`를 "Doan’s lines stay in `.gitattributes`."로 바꾸고 고정한 테스트를 맞춘다.
- **브랜드**: `brand/candidates.ts`의 `SUBCOMMANDS`(공유 fixture와 같은 커밋).
- **가려진 문구**: `RightPanel.tsx:20`을 "Click an element or frame to inspect it."으로 바꾸고 `RightPanel.test.tsx:125`를 맞춘다. 앱이 그리지 않는 화면이라 runtime-test로 볼 수 없다.
- **에이전트 설정**: 설치된 규칙은 바꾸지 않는다. Codex 규칙은 `prefix_rule(pattern=["doan"])`, Claude 허용 규칙은 `work`·`open` 네 개뿐이라 `comment resolve`를 따로 적지 않는다(`agentSetup/plan.ts`). `codexRuleText()`를 바꾸면 설치된 `doan.rules`가 foreign으로 분류되므로 건드리지 않는다. 고칠 것은 ARCHITECTURE §7의 설명 한 줄이다.
- 그 밖의 코드 주석의 코멘트 언급(`projectDisplay.ts`의 호출처 없는 `commentContext` 포함, `ConversationThread.tsx:206`)을 정리한다. `ConversationThread.tsx:206`은 새 §3 규칙을 가리키게 한다.

### 초안 캔버스 (D7)

- `.doan/canvases/canvas-row-menu.html` frame 03: 코멘트 확인 창(`td-comments`)과 "comments couldn’t be moved" 토스트(`td-toast-comments`)와 그 캡션을 지우고, busy 예시는 기본 본문으로 바꾼다. DESIGN 'Canvas row menu' Toasts 행의 "comments stay"를 뺀다.
- `.doan/canvases/doan-shell.html`: "inspect or comment on it" 힌트와 Comments 섹션을 지운다.
- `.doan/canvases/local-doan-files.html` frame 05: "Doan’s two lines stay in"을 앱 문구와 같게 고친다.
- 문장 삭제뿐이라 `/design-draft`를 하지 않고, 고친 뒤 `doan check`와 `doan ls`로 확인한다.

### eval

- `eval/lib`: `context.ts`의 `commentEvents()`, `types.ts`의 해당 타입, `scenario.ts`의 focus `"comments"`, `socket.ts`의 `ATTRIBUTE_LINES`(한 줄), lib 테스트(socket.test, workspace.test:163, answer.test, scenario.test, context.test).
- 시나리오(D5): H1, H4, H6, H7, H8, R1, R3, R6b, R7b 은퇴. H2·H3·R4·W2는 코멘트 시드와 확인만 뺀다(W2의 `comment_element_id_preserved`는 id 보존을 캔버스 확인으로 재거나 뺀다). 약 20개 시나리오 시드의 `.gitattributes`에서 union 줄을 뺀다. `R8d/rubric.md`(judge에 들어간다)와 `R8d/checks(.test).ts`의 규칙 글자를 고친다. `regression.test.ts`, `audit.test.ts`를 정리한다.
- H6·H7은 앱의 `copyText`(`app/src/comments/projection.ts`)를 import하고, H8은 빌드된 CLI의 `ls` `orphans`와 `orphan_comment_file`을 단언한다. 그래서 이 셋은 B1에서 은퇴한다.

### 문서 (T9)

- PRODUCT: spec 'PRODUCT 변경 요지'.
- ARCHITECTURE:
  - §1: 프로젝트 디렉터리(`.doan/comments/`는 Doan이 무시하는 옛 경로이고 다시 쓰지 않는다는 한 줄을 남긴다), id 규칙 근거 문장, 규칙 목록(A–E), `unparsable_canvas`, `orphan_comment_file`.
  - §2 'Comment storage' 삭제(번호는 비워 둔다; §5도 비어 있다). §2의 "`body`, `html`, `text`는 HTML로 렌더하지 않고 데이터로 다룬다" 규칙은 §3 'Selection and inspector'로 옮겨 selection과 `doan active`의 `html`/`text`에 대한 규칙으로 다시 쓴다. 이 규칙을 인용하던 §7(:553 "same rule as comment bodies (§2)")과 §6의 보안 경계 문장이 새 위치를 가리키게 한다.
  - §3 문서 origin·export, §7 Codex 허용 규칙 설명과 Canvas row menu IPC, §7의 "§1 rule J" 인용, §10, §11(selection element가 comment-event `$defs`를 재사용한다는 문장), §12 exit 코드·`ls` 모양·명령, §13.
- DIRECTORY, DESIGN('Canvas row menu' Toasts 행), README(명령 표, 예시 프롬프트), AGENTS(용어 목록), 개발 스킬(code-review의 코멘트 로그 규칙, tdd의 fold 규칙, feature·feature-review의 "comment events"·"append-only events"·"agents only resolve", agent-eval, design-draft의 규칙 글자), `app/src/main/conversation/prompt.ts:45`와 `prompt.test.ts:73`의 규칙 글자, `eval/lib/work.ts` 주석, BACKLOG(코멘트 항목 정리, 'Known defects'의 가이드 항목 삭제), 저장소 루트 `.gitattributes` 첫 줄.

## 결정

- **D1. 남은 `.doan/comments/`는 조용히 무시한다.** 경고하면 Doan이 직접 만든 적 없는 파일에 대해 사람에게 일을 시키게 된다. 지우는 것은 "사람 파일을 지우지 않는다"(PRODUCT §3 Out of scope 6, §5 item 1)와 어긋난다. 서빙·export는 이미 `.doan/` 메타데이터로 막혀 있다.
- **D2. 기존 union 줄은 남긴다.** `.gitattributes`에서 줄을 지우는 것도 사람 파일을 고치는 일이다. 남은 union 줄은 해가 없다.
- **D3. 가이드 규칙은 A–E로 다시 매긴다.** 남는 규칙은 A(데이터), G(코드에 없는 것 표시), H(id 유지, 이유만 바뀜), I(work start), J(work done)다. 빈 글자를 남기면 에이전트가 빠진 규칙을 찾는다. 규칙 글자를 인용하는 곳은 위 '가이드와 프리셋', 'eval', '문서'에 모두 적었고, T4 검증이 남은 인용을 찾는다.
- **D4. 공용 코드는 이름에 맞게 옮긴다.** 위치와 이름은 구현 worker가 `docs/DIRECTORY.md`의 구조에 맞춰 정하고 DIRECTORY에 적는다.
- **D5. 코멘트가 측정 대상인 시나리오는 은퇴한다.** 코멘트 없이 같은 것을 잴 수 없다. R3(코멘트 본문을 통한 지시 주입) 은퇴로 생기는 공백은 USABILITY-EVAL 이슈로 남긴다.
- **D6. 규칙 H는 남긴다.** 캔버스 id는 대화 칩과 대화가 계속 쓴다. 이유 문장만 바뀐다.
- **D7. 초안도 결정을 따른다.** 확정된 초안이 코멘트 상태를 그리고 있으면 다음 구현이 그것을 다시 만든다. 문장·상태 삭제라 새 초안은 그리지 않는다.
- **D8. 저장소에 남는 사람 피드백 채널이 없어지는 것을 받아들인다**(spec '받아들인 결과').

## 순수 함수 (/tdd 대상)

- Go `missingAttributes`: 한 줄만 요구하고, union 줄만 있을 때·두 줄 다 있을 때·둘 다 없을 때·linguist 줄만 있을 때·CRLF일 때 결과가 맞다.
- Go `check.Run`: `.doan/comments/`가 없을 때·빈 디렉터리·파일 있음·캔버스 id와 같은 파일·디렉터리 대신 파일이나 심볼릭 링크·읽을 수 없음 어느 경우에도 finding이 없다.
- 앱 `trashTarget`과 Trash 계획: comments 필드 없이 busy(캔버스 대화 작업 중 포함)와 거부를 그대로 판정한다.
- 앱 `folderState` 파싱: `OrphanFile`과 `orphans` 필드가 타입과 결과에서 사라지고, 옛 CLI가 보낸 `orphans`·`comments`는 무시된다.
- 스키마 검증(Go `validate.go`, TS `validate.ts`): 옮긴 `$defs`로 기존 app-socket·sessions fixture와 옮겨 온 무효 사례가 그대로 판정된다.

## 형식 변경

- comment-event 스키마와 fixture 삭제. app-socket.v1·sessions.v1은 `$defs`만 안으로 옮기고 받아들이는 모양과 `v`는 그대로다. 무효 사례는 두 스키마 fixture로 옮긴다.
- `ls` 결과에서 세 필드 삭제, 오류 코드 두 개 삭제(스키마 없는 결과, 같은 번들).

## 규약·결정 영향

- ARCHITECTURE §1 'Conventions'의 에이전트 규칙(A–J → A–E)과 `doan check` 규칙 하나(`orphan_comment_file`)가 바뀐다.
- 코멘트 이벤트의 "append-only events"와 "agents only resolve" 결정은 함께 사라진다. 대화 저장(`conversations/`)의 append 규칙은 별개라 그대로다. "본문은 데이터다" 결정은 selection과 `doan active`에 대한 규칙으로 §3에 남는다.
- "Doan은 git을 하지 않는다"(§3 Out of scope 6)는 그대로다. `.gitattributes`에 쓰는 줄이 하나로 준다.

## POSTMORTEM에서 가져올 함정

- 2026-10-29 "Codex cut the middle out of the doan guide": 에이전트가 도구로 읽는 텍스트(가이드, 프리셋, nextSteps)를 바꿀 때 출력 예산 테스트를 다시 보고, 끝 표시가 중간 잘림을 잡지 못한다는 점을 기억한다(`rg -n 'skillOutputBudget' cli/internal/cli`).
- 2026-10-24 "Agent shells bypassed the evaluation runner's packaged CLI", 2026-11-02 "Evaluation unit checks inherited the real session-recording runtime": eval을 고칠 때 패키지된 CLI와 격리된 `DOAN_RUNTIME`을 그대로 쓴다.
- 2026-11-07 "The eval fake's auth status comparison broke when the app's DTO gained a field": 앱 DTO(`ls` 결과, Trash 응답)와 `.gitattributes` 줄 목록을 바꾸면 eval의 가짜 앱도 같은 배치에서 맞추고, 두 목록이 같은지 T11에서 확인한다.

## PoC 의존

없다. 삭제와 이동뿐이고, 새 동작은 "무시한다"뿐이다.
