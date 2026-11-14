# cli-remove — design

## 흐름

```
doan remove [--repo <path>]
  CLI(run.go): DOAN_RUNTIME 검사(상대 경로면 usage_error) → 인자 → repo 발견(루트)
               → v7 요청 {v:7, token, root}  (bootstrap 없음)
  main(answerLine v:7):
    schema → token → 등록된 루트(project_not_open)
    → 준비(openLinksReady(), 그룹의 루트를 아직 읽는 중이면 busy)
    → 첫 실행·Buddy 화면(busy)
    → renderer가 보낸 마지막 메뉴 상태: modal(busy), locked(busy, 페이지별 문장)
    → 그룹 루트 계산(groupProjects)
    → liveTurns()에서 그룹 루트의 running 턴(conversation_running)
    → removeRoots(그룹 루트) — folders:remove 처리기에서 뽑은 공용 함수
        unavailable → project_not_open
        removed     → renderer에 folders:removed {paths} → 답 {removed, project, roots}
  renderer: folders:removed를 받아 removeNow의 뒤처리를 그대로 한다(판단하지 않는다)
```

### renderer에 묻지 않는 이유

- 판단에 필요한 것은 main에 다 있다.
  - 메뉴 상태: `menu:state`로 받은 `menuInputs`의 `modal`·`locked`(`index.ts`).
  - 대화: `ConversationService.liveTurns()`. 프로젝트, 캔버스, 프로토타입 창의 모든 대화를 루트와 함께 주고, 권한 요청·질문을 기다리는 턴도 `running`이다.
  - 그룹: `groupProjects`(`renderer/homeCards.ts`). main이 이미 `notifyService.ts`에서 쓰는 순수 함수다.
- v4처럼 renderer에 묻고 답 시한(1000 ms, `deepLinks.ts`)을 두면, 디스크 쓰기를 기다리는 `removeNow`와 경합한다. 그러면 CLI가 `busy`("아무것도 바뀌지 않음")를 말한 뒤에 프로젝트가 빠질 수 있다. main이 직접 지우고 그 결과로 답하면 이 경합이 없다.
- `menuInputs`는 renderer가 보낸 마지막 값이라 한 프레임쯤 늦을 수 있다. 이것은 받아들인다. 대화상자가 막 열리는 순간의 CLI 요청은 메뉴 Remove from Doan을 누른 직후와 같은 결과다.

## 영향받는 컴포넌트

- **CLI(Go)**
  - `cli/internal/cli/remove.go`: 명령 본문과 `removeText`.
  - `remove_rules.go`: 요청, 답 읽기, `removeFailure`.
  - `run.go`: 분기, `help` 두 줄, `remove`의 `repo_not_found`·`invalid_config` `nextSteps`, `:132` 근처 주석.
  - `envelope.go`: `ExitCode`에 `conversation_running` → 5.
  - `formats`: `ValidateRemoveRequest`/`Response`.
- **형식**
  - `schema/app-socket.v7.schema.json`: 요청, 답, 오류 코드.
  - `schema/fixtures/app-socket-v7/…`: TS와 Go가 같이 읽고, 양쪽 fixture 표(`validate.go`, `validate_test.go`, `app/src/formats/validate.test.ts`)에 넣는다.
  - ARCHITECTURE §12의 `remove` 결과 모양. 명령 결과는 envelope 스키마에 넣지 않는다(§11, envelope의 `result: {}`).
- **앱 main(TS)**
  - `runtime.ts`: `answerLine`의 `v: 7` 분기, `RuntimeState.remove`, `Answer` 유니온.
  - `formats/types.ts`, `formats/validate.ts`: `validateRemoveRequest`/`Response`.
  - `index.ts`: `folders:remove` 처리기에서 `removeRoots(paths)`를 뽑는다. 이 함수가 selection 지우기, `ready.remove`, `stopBackground`, `thumbs.removed`를 한다. 처리기와 v7이 같이 쓰고, v7은 `folders:removed` 이벤트를 보낸다.
  - `senderAllowed.ts`·`senderAllowed.test.ts`: 새 이벤트 채널.
- **preload**: `onFoldersRemoved(listener)`.
- **renderer**: `App.tsx`. `removeNow`의 뒤처리(`cancelRestore`, shell 프로젝트·펼침·기억된 캔버스·대화·기록 정리)를 `afterRemoved(paths)`로 뽑는다. `removeNow`와 `folders:removed` 구독이 같이 쓴다. Home 이동은 지금처럼 entries effect가 한다.
- **문서**: README CLI 표 한 줄과 136행 문장(spec 정한 점 10).
- **스킬·guide**: 바뀌지 않는다.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **Go `removeRequest(root)`·`removeReply(line, root, secrets) (map[string]any, *Error)`** (`remove_rules.go`). 토큰은 다른 명령처럼 `exchange`가 넣는다.
   - 답 읽기:
     - `v`가 7이 아니면 `app_protocol_mismatch`이다. 옛 앱의 v1 `bad_request`도 여기에 든다.
     - `bad_token`은 `app_not_running`이다.
     - `bad_request`와 스키마 밖의 답은 `internal_error`이다.
     - 성공 답의 `roots`가 비었거나 요청한 루트를 담지 않으면 `internal_error`이다.
   - 오류 메시지와 `nextSteps`는 spec '문구'를 따른다.
2. **Go `removeText(project, roots)`**: spec '문구'의 성공 줄.
3. **TS `cliRemoveDecision(input)`** (`app/src/main/cliRemove.ts`, 순수).
   - 입력: 요청 루트, `entries`, `lastCommon`, `openLinksReady`, 첫 실행·Buddy 여부, `menuInputs`(`modal`, `locked`과 그 화면), `liveTurns`.
   - 결과는 다음 중 하나다.
     - `project_not_open`: 루트가 등록되지 않았다.
     - `busy`와 메시지: 준비 전, 그룹의 루트가 아직 `loading`, 첫 실행·Buddy, `modal`, `locked`.
     - `conversation_running`: 그룹 루트의 `running` 턴이 있다.
     - `{remove: 그룹 루트들, project: 그룹 이름}`.
   - 그룹과 이름은 `groupProjects`로 정한다.
   - 잠긴 페이지 문장은 `doan open`이 쓰는 문장(PRODUCT §5 item 3 'Deep links')을 같은 곳에서 가져온다.
4. **TS `removeRoots`의 결과 매핑**: `unavailable`은 `project_not_open`이 되고, `removed`는 답이 된다.
5. **TS `afterRemoved(paths)` 상태 변환**: `removeNow`가 지금 하는 상태 정리를 순수 부분(shell 프로젝트, 펼침, 기록)으로 뽑아, 두 경로가 같은 결과를 내는지 테스트한다.

## 세부 규칙

- **루트**: CLI가 발견한 실제 루트를 문자열로 보낸다. 앱은 등록된 경로와 문자열로 비교하고 루트를 다시 계산하지 않는다(ARCHITECTURE §4 'Selection ownership', POSTMORTEM 2026-10-22). 등록된 그룹의 등록되지 않은 워크트리는 `project_not_open`이고, 자동 등록하지 않는다(v3 `work`의 자동 등록은 v7에 없다).
- **`DOAN_RUNTIME`**: `active`와 같다. 비었으면 기본 경로, 상대 경로면 `usage_error`이다. `run.go`가 명령 본문보다 먼저 판단한다. bootstrap은 없다. `Launch`가 불리지 않음을 Go 테스트로 고정한다.
- **`DOAN_APP_CONVERSATION`**: 아무것도 바꾸지 않는다. 앱 대화 안에서도 같은 요청이 가고, 그 대화의 턴이 돌고 있으므로 `conversation_running`이다.
- **기한**: 판단과 `ready.remove`(파일 쓰기)가 모두 앱의 2초 기한(연결부터) 안에 끝나야 한다. 쓰기가 늦어 기한을 넘기면 CLI는 `app_not_running`을 보지만 목록은 빠져 있을 수 있다. 이것은 v3 `work`의 '늦은 답은 버리되 일은 계속한다'와 같은 성질로 받아들이고 ARCHITECTURE에 적는다. 테스트는 시계를 주입하고 기다리지 않는다.
- **답 모양**: 성공은 `{removed: true, project, roots}`이다. `project`는 사이드바와 같은 그룹 이름(PRODUCT §5 item 1)이고, `roots`는 절대 경로다. §12의 "경로는 저장소 기준 상대 경로" 규칙의 예외로 적는다.
- **종료 코드**: `conversation_running`은 5이다(앱 상태가 정하는 거부, `busy`와 같은 묶음). 나머지는 기존 표를 따른다.
- **창**: 성공해도 창을 앞으로 가져오지 않는다.
- **렌더러 반영**: `folders:removed`는 main 창에만 간다. renderer는 그 경로들로 `afterRemoved`를 부른다. 같은 경로에 대해 자기 `removeNow`가 이미 정리했으면 아무것도 하지 않는다(정리는 멱등이어야 한다).

## 형식 변경

- 새 `schema/app-socket.v7.schema.json`. v1–v6은 바뀌지 않는다. 각 버전이 따로 분기하므로 v7은 처리기 하나를 더하고 다른 버전의 답을 바꾸지 않는다.
- 지금 앱 테스트 세 곳이 `v: 7`을 "모르는 버전"으로 쓴다(`runtime.test.ts`, `runtime.prototype.test.ts`, `runtime.handoff.test.ts`). `/tdd`에서 `v: 8`로 옮긴다.
- `.doan/config.json`, `runtime.json`, 캔버스 형식, CLI envelope 스키마는 바뀌지 않는다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 10에 `doan remove` 문장을 더하고, item 1 'Remove from Doan'에 CLI에서도 같은 결과가 난다고 적는다. "removing one worktree alone is not offered"는 그대로다.
- §3 Out of scope 4와 맞는다. 목록만 바꾸고 대화를 시작하거나 멈추지 않는다. 남은 백그라운드 작업을 멈추는 것은 메뉴와 같다.
- ARCHITECTURE §4 첫 문장과 'Onboarding over app-socket v2' 'Dispatch'의 "`v` 3–6" 문장을 고친다. CLI가 userData를 쓰지 않는다는 경계는 유지된다.

## PoC 의존

- 없다. 소켓 버전 분기, 루트 문자열 비교, `liveTurns`, `menuInputs`, main에서의 목록 변경(자동 등록 워크트리 정리, `index.ts`)은 모두 출시된 길이다.

## POSTMORTEM에서 가져온 것

- **2026-10-25 'Locating a project kept the old root's selection'**: "any path that drops a stored root (remove, replace/locate, future ones) must clear state keyed by that root." `removeRoots`가 selection을 지우고 처리기와 v7이 이 함수를 같이 쓴다. `rg -n 'selection = null|ready\.(remove|replace)\(' app/src/main/index.ts`에서 `ready.remove`는 `removeRoots` 한 곳에만 있어야 한다.
- **2026-11-09 'A Locate from a page's sidebar left the page's origin on the old root'**: 루트에 묶인 상태는 그 이벤트가 오는 곳에서 옮긴다. renderer는 `folders:removed`에서 `afterRemoved`를 부른다.
- **2026-10-22 'Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently'**: 앱은 CLI가 보낸 루트를 문자열로만 비교한다.
- **2026-11-07 'A reply one byte over the cap passed …'**: 답 읽기는 공유 `readLine`을 쓴다.
- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: renderer는 `cliRemove.ts`를 가져오지 않는다. main이 renderer의 순수 모듈(`homeCards.ts`)을 가져오는 방향만 쓴다.
