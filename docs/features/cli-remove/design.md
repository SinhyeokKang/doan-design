# cli-remove — design

## 흐름

```
doan remove [--repo <path>]
  CLI: 인자 → repo 발견(루트) → DOAN_RUNTIME 검사 → v7 요청 {v:7, token, root}
  main(answerLine): schema → token → 등록된 루트(project_not_open) → 첫 실행·Buddy 화면(busy) → renderer에 묻기
  renderer: 대화상자(busy) → 그룹 찾기 → 실행 중인 대화(conversation_running) → removeNow(그룹 루트) → {removed, project, roots}
  main: 답을 v7 답으로 보낸다(시간 안에 답이 없으면 busy)
```

renderer에 묻는 이유: 앱의 Remove from Doan 뒤처리(사이드바 프로젝트, 펼침 상태, 기억된 캔버스, 대화 목록, Back/Forward 기록, Home 이동)는 renderer의 `removeNow`(`App.tsx`)에 있다. 실행 중인 대화 판단도 renderer의 `HomeRun.remove`가 main의 대화 목록에서 `holdsRoot`로 고른다. main에서 `ready.remove`만 부르면 이 뒤처리가 빠지므로, v4 `doan open`처럼 main이 renderer에 묻고 renderer가 확인 창 없이 같은 길을 탄다.

## 영향받는 컴포넌트

- **CLI(Go)**: `cli/internal/cli/remove.go`(명령 본문), `remove_rules.go`(요청 만들기, 답 → envelope와 종료 코드), `run.go`의 명령 분기와 `help` 줄, `envelope.go`의 `ExitCode`(`conversation_running` → 5).
- **형식**: `schema/app-socket.v7.schema.json`(요청·답·오류 코드), CLI envelope의 `remove` 결과 모양(ARCHITECTURE §12), 양쪽이 읽는 fixture.
- **앱 main(TS)**: `runtime.ts` `answerLine`의 `v: 7` 분기, 요청 검증 `validateCliRemove`, renderer에 묻고 기다리는 `removeRequests`(`deepLinks.ts`의 `openRequests`와 같은 모양: 요청 ID, 답 시간 제한, 늦은 답 버림), preload의 구독·답 채널, `senderAllowed.ts`.
- **앱 renderer(TS)**: `App.tsx`에 CLI 제거 요청 처리(`removeNow`를 그대로 쓴다), 판단 순수 함수.
- **스킬·guide**: 바뀌지 않는다(spec 결정 4).

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **Go `removeRequest(root, token)`·`removeReply(line) → envelope, exit`** (`remove_rules.go`): `v` 7이 아니면 `app_protocol_mismatch`, `bad_token`은 `app_not_running`, `bad_request`와 스키마 밖 답은 `internal_error`, `project_not_open`·`busy`·`conversation_running`은 CLI가 쓴 메시지와 `nextSteps`(앱의 글은 쓰지 않는다. `busy`만 `withoutSecrets`를 거친 앱 메시지를 쓴다 — v4·v6와 같다). 성공 답의 `roots`가 비었거나 요청한 루트를 담지 않으면 `internal_error`.
2. **TS `validateCliRemove(value)`** (main): 스키마를 통과한 요청에서 `root`만 꺼낸다. 다른 키는 스키마가 막는다.
3. **TS `cliRemoveDecision(input)`** (renderer): 입력은 요청 루트, 화면의 카드(`groupProjects` 결과), 대화상자 열림 여부, 루트별 대화 목록이다. 결과는 `busy`(대화상자), `project_not_open`(그 루트를 담은 카드가 없음 — main 확인과 renderer 목록 사이의 경쟁), `conversation_running`(그룹의 어느 루트든 `holdsRoot` 대화가 있음), 또는 `{remove: 그룹 루트들, project: 카드 이름}`. `HomeRun.remove`의 실행 중 판단과 같은 `holdsRoot`를 쓴다.
4. **TS `removeRequests`의 답 짝 맞추기**: 요청 ID가 맞지 않거나 시간이 지난 답은 버린다. 시간 안에 답이 없으면 `busy`. `openRequests`를 일반화할 수 있으면 그쪽을 쓰고, 아니면 같은 모양으로 둔다(구현 때 지휘자 판단).

## 세부 규칙

- **루트**: CLI가 발견한 실제 루트를 문자열로 보낸다. 앱은 등록된 경로와 문자열로 비교하고 루트를 다시 계산하지 않는다(ARCHITECTURE §4 'Selection ownership', POSTMORTEM 2026-10-22).
- **`DOAN_RUNTIME`**: `active`와 같다. 비었으면 기본 경로, 상대 경로면 `usage_error`. bootstrap은 없다.
- **`DOAN_APP_CONVERSATION`**: 아무것도 바꾸지 않는다. 앱 대화 안에서도 같은 요청이 가고, 자기 그룹의 대화가 돌고 있으므로 `conversation_running`이 된다.
- **기한**: 앱의 2초 기한(연결부터) 안에 답한다. renderer 답 기한은 v4와 같이 그 안쪽에 둔다. 테스트는 시계를 주입하고 기다리지 않는다.
- **답 모양**: 성공은 `{removed: true, project: <그룹 이름>, roots: [<뺀 루트>…]}`. 이름은 사이드바와 같은 그룹 이름(PRODUCT §5 item 1: 메인 워크트리 폴더 이름, 없으면 첫 등록 루트 이름)이다.
- **종료 코드**: `conversation_running`은 5(앱 상태가 정하는 거부, `busy`와 같은 묶음). 나머지는 기존 표를 따른다.
- **`nextSteps`**: `conversation_running` → 앱에서 그 대화를 멈추거나 끝난 뒤 다시 실행. `busy` → 앱의 대화상자를 닫거나 첫 실행을 마치고 다시 실행. `project_not_open` → `--repo`가 등록된 프로젝트를 가리키는지 확인.
- **앱 화면**: 확인 창과 토스트가 없다. `removeNow`를 그대로 쓰므로 Home 이동과 뒤처리는 앱 메뉴와 같다. 앱 메뉴의 확인 창이 열려 있는 동안 온 요청은 대화상자 규칙으로 `busy`다.

## 형식 변경

- 새 `schema/app-socket.v7.schema.json`. v1–v6은 바뀌지 않는다. 각 버전이 따로 분기하므로(ARCHITECTURE §4 'Playing a prototype over app-socket v6') v7은 처리기 하나를 더하고 다른 버전의 답을 바꾸지 않는다. 옛 앱은 v7에 v1 `bad_request`로 답하고 CLI는 그것을 `app_protocol_mismatch`로 읽는다.
- CLI envelope의 `remove` 결과 모양을 envelope 스키마와 fixture에 더한다. TS와 Go가 같은 fixture(성공, 각 오류 코드, 다른 `v`)를 읽는다.
- `.doan/config.json`, `runtime.json`, 캔버스 형식은 바뀌지 않는다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 10에 `doan remove` 문장을 더한다. 앱의 Remove from Doan 규칙과 "removing one worktree alone is not offered"는 그대로다.
- §3 Out of scope 4(에이전트를 스스로 깨우지 않음)와 맞는다. 이 명령은 목록만 바꾸고 대화를 시작하거나 멈추지 않는다.
- ARCHITECTURE §4 첫 문장("Only `active`, `onboarding …`, `open`, `work` and `handoff` need the app")에 `remove`를 더한다.
- CLI가 userData를 쓰지 않는다는 경계는 유지된다(spec 결정 3).

## PoC 의존

- 없다. 소켓 버전 분기, renderer에 묻는 요청(v4), 루트 문자열 비교는 모두 출시된 길이다.

## POSTMORTEM에서 가져온 것

- **2026-10-25 'Locating a project kept the old root's selection'**: "any path that drops a stored root (remove, replace/locate, future ones) must clear state keyed by that root." CLI 제거는 `folders:remove`와 같은 main 함수를 써서 `selection`을 지우고 `stopBackground`·`thumbs.removed`를 부른다. `rg -n 'selection = null|ready\.(remove|replace)\(' app/src/main/index.ts` 목록에 새 길이 들어가는지 확인한다.
- **2026-11-09 'A Locate from a page's sidebar left the page's origin on the old root'**: 루트에 묶인 상태는 재루트 이벤트가 오는 곳(`onFolders`)에서 옮긴다. renderer는 `removeNow`를 그대로 써서 앱 메뉴와 같은 뒤처리를 받는다.
- **2026-10-22 'Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently'**: 앱은 CLI가 보낸 루트를 문자열로만 비교한다.
- **2026-11-07 'A reply one byte over the cap passed …'**: 답 읽기는 공유 `readLine`을 쓴다. 새 리더를 만들지 않는다.
- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: renderer 판단 함수는 main 모듈을 값으로 가져오지 않는다.
