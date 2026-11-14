# cli-remove — spec

`doan remove`로 실행 중인 앱의 등록 목록에서 프로젝트를 뺀다. 결과는 앱의 사이드바 메뉴나 Project Settings에서 Remove from Doan을 확인했을 때와 같다.

## 사용자

- **사람**: 끝난 프로젝트를 정리할 때, 앱을 열어 메뉴를 찾지 않고 터미널에서 직접 실행하거나 자기 에이전트에게 맡긴다.
- **에이전트**: 사람이 요청했을 때만 쓴다. `doan help`에만 있고 guide와 스킬 스텁에는 적지 않는다(결정 4).

## 문제

- 프로젝트를 목록에서 빼는 방법은 앱의 Remove from Doan뿐이다(사이드바 프로젝트 메뉴와 Project Settings는 그룹 전체, 문제 오버레이는 그 루트 하나).
- CLI로 프로젝트를 더하는 길은 있다. 첫 실행 중에는 `doan onboarding project select`/`clone`이 있고, 터미널 `doan work`는 워크트리를 자동 등록한다. 빼는 길은 없다.
- 그래서 에이전트가 끝난 프로젝트를 정리해도 목록에서 빼는 마지막 단계는 사람이 앱에서 해야 한다.
- 워크트리 하나를 정리하는 일은 이 기능의 목적이 아니다. 자동 등록된 워크트리는 폴더가 사라지면 이미 조용히 목록에서 빠진다(PRODUCT §5 item 1).

## 정한 점

1. **단위는 프로젝트 그룹**이다. `--repo`(없으면 현재 디렉터리)가 가리키는 Doan 루트가 속한 그룹을 뺀다. 그룹은 같은 Git common directory를 쓰는 등록된 워크트리 전체다. 사이드바 메뉴·Project Settings의 Remove from Doan과 같고, PRODUCT의 "removing one worktree alone is not offered"는 바뀌지 않는다. 그래서 다른 워크트리에서 실행해도 메인 워크트리까지 빠진다.
2. **대화가 하나라도 돌고 있으면 거부**한다. 그룹의 어느 루트에서든 프로젝트 대화, 캔버스 대화, 프로토타입 창 대화의 턴이 돌고 있으면(권한 요청·질문 대기 포함) 아무것도 바꾸지 않고 `conversation_running`으로 답한다. 앱 메뉴는 프로젝트 대화만 세지만 메뉴에는 확인 창이 있다. CLI에는 확인 창이 없으므로 더 넓게 막는다. 이 규칙 덕분에 앱 대화 안의 에이전트는 자기 프로젝트를 뺄 수 없다. 대화를 멈추는 일은 사람이 앱에서 한다.
3. **앱이 실행 중이 아니면 `app_not_running`으로 거부**하고 앱을 띄우지 않는다. `active`·`handoff`와 같고, `work`처럼 앱을 띄우지 않는다. CLI는 userData를 직접 쓰지 않는다.
4. **에이전트 노출은 `doan help`에만** 둔다. 도움말의 들여쓴 줄이 "사람이 요청할 때만"을 말한다. guide와 스킬 스텁은 바뀌지 않으므로 `/agent-eval`은 하지 않고, PR 본문에 그 이유를 적는다.
5. **이름은 `doan remove [--repo <path>] [--json]`**이다. 다른 인자는 없다.
6. **확인 단계는 없다**. 명령을 실행하는 것이 확인이다. 결과에 뺀 프로젝트의 이름과 루트(절대 경로) 목록을 돌려준다.
7. **앱 화면은 메뉴의 Remove from Doan과 같이 바뀐다**. 토스트가 없다. 불러온 작업 공간의 프로젝트가 화면에 있으면 Home으로 간다. 그 프로젝트 Overview composer의 보내지 않은 초안은 메뉴에서처럼 버려진다. 끝난 턴이 남긴 백그라운드 작업은 묻지 않고 멈춘다. 파일과 Git 워크트리는 그대로 둔다. 앱 창을 앞으로 가져오지 않는다. 제거된 프로젝트의 프로토타입 창은 메뉴에서와 같이 열린 채로 남는다. 이 빈틈은 BACKLOG에 적는다.
8. **되돌리기**: 다시 추가하면 된다. 다시 추가한 루트는 손으로 추가한 루트가 된다. 다른 워크트리는 메인 워크트리를 다시 추가한 뒤 터미널 `doan work`로 다시 자동 등록될 수 있다.
9. **문제 루트**: Not set up이나 Config error인 루트는 CLI가 앱에 묻기 전에 `repo_not_found`·`invalid_config`로 끝난다. `doan remove`에서는 이 두 오류의 `nextSteps`가 `doan init` 대신 앱의 Remove from Doan을 안내한다.
10. **README**: CLI 표에 `doan remove` 한 줄을 넣고, "앱 없이 되는 명령" 문장에서 `remove`를 뺀다.

## 문구

도움말(`doan help`):

```
  remove
      (removes this project from Doan's list; files stay. Only when the user asks)
```

`--json` 없이 성공했을 때:

```
Removed <project> from Doan: <root>, <root>. Files and Git worktrees stay on disk.
```

오류별 `nextSteps`(메시지는 CLI가 쓴다. `busy`만 앱 메시지를 `withoutSecrets`를 거쳐 쓴다):

| 코드 | `nextSteps` |
|---|---|
| `conversation_running` | "Tell the user a conversation is still running in this project in Doan; nothing was removed. Run `doan remove` again only when they ask again" |
| `busy` | "Tell the user what Doan is waiting for (see the message) and ask them to finish it; run `doan remove` again only when they ask again" |
| `project_not_open` | "Tell the user Doan does not list this folder's project; nothing was removed" |
| `app_not_running` | `unreachableSteps("`doan remove`")` |
| `app_protocol_mismatch` | "Ask the user to update Doan and the doan CLI to matching versions" |
| `repo_not_found`, `invalid_config` | "If Doan lists this folder as Not set up or Config error, ask the user to use Remove from Doan in the app; do not run `doan init` here" |

`busy` 메시지(앱): 첫 실행·Buddy 화면 "Finish Doan's first run, then try again.", 시작 중이거나 그룹을 아직 읽는 중 "Doan is still loading this project. Try again shortly.", 대화상자 "A dialog is open in Doan. Close it, then try again.", 잠긴 페이지는 `doan open`의 페이지별 문장("The Add Projects page is in the middle of a task. Finish or cancel it, then try again." 등)을 그대로 쓴다.

## 완료 조건

- 앱이 실행 중이고 그룹에서 도는 대화가 없을 때, 그룹의 어느 워크트리에서든 `doan remove --json`은 `ok: true`, exit 0이다. `result`는 `{removed: true, project, roots}`이고 `roots`는 그룹의 모든 루트(절대 경로)다. 그 루트들이 `folders.json`과 `auto-folders.json`에서 빠지고, 디스크의 파일과 Git 워크트리는 남는다. `--json` 없이는 '문구'의 성공 줄 하나를 찍는다.
- 그 그룹의 작업 공간을 보던 앱은 Home으로 간다. 사이드바, Back/Forward 기록, 기억된 캔버스, 대화 목록에서 그 루트들이 빠진다. 앱 메뉴로 지웠을 때와 같다. 창은 앞으로 오지 않는다.
- 그룹의 다른 워크트리에서 캔버스 대화 턴이 돌거나 권한 요청을 기다리면 `conversation_running`, exit 5이고 아무것도 바뀌지 않는다.
- 첫 실행·Buddy 화면, 시작 중, 대화상자, 잠긴 페이지에서는 `busy`, exit 5이고 아무것도 바뀌지 않는다.
- 등록되지 않은 루트는 `project_not_open`, exit 3이다. 앱이 없으면 `app_not_running`, exit 3이고 앱을 띄우려 하지 않는다. 다른 버전의 앱이면 `app_protocol_mismatch`, exit 3이다.
- `doan help`에 '문구'의 두 줄이 있다. guide(`cli/internal/cli/skill.md`)와 스킬 스텁(`app/src/main/onboarding/SKILL.md`)은 develop과 같다.

## 하지 않는 것

- 워크트리 하나만 빼기. 사이드바 메뉴에도 없는 동작이다.
- 폴더가 사라진 그룹 빼기. 그룹의 워크트리가 모두 사라지면 `--repo`로 루트를 찾을 수 없다. 살아 있는 워크트리가 하나라도 있으면 거기서 실행해 그룹 전체를 뺄 수 있다. 손으로 추가한 워크트리가 사라졌으면 앱의 문제 오버레이를 쓴다.
- Not set up·Config error 루트를 CLI로 빼기(정한 점 9).
- 대화를 멈추고 빼기(앱의 Stop and Remove).
- 앱이 꺼져 있을 때 앱을 띄우거나 userData를 직접 고치기.
- 프로젝트 추가나 목록 보기 같은 다른 프로젝트 명령.
- guide·스킬 스텁 변경과 `/agent-eval`.
- 제거된 프로젝트의 프로토타입 창 닫기(정한 점 7, BACKLOG).
