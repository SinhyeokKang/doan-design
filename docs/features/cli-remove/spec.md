# cli-remove — spec

`doan remove`로 실행 중인 앱의 등록 목록에서 프로젝트를 뺀다. 앱의 Remove from Doan을 확인한 뒤와 같은 결과다.

## 사용자

- **사람**: 터미널이나 자기 에이전트에게 시켜서, 앱을 열어 메뉴를 찾지 않고 프로젝트를 목록에서 뺀다. 앱 화면은 Remove from Doan을 확인했을 때와 같이 바뀐다.
- **에이전트**: 사람이 요청했을 때만 쓴다. `doan help`에만 있고 guide와 스킬 스텁에는 적지 않는다(결정 4).

## 문제

- 프로젝트를 목록에서 빼는 방법은 앱의 Remove from Doan(사이드바 프로젝트 메뉴, 문제 오버레이, Project Settings)뿐이다. CLI에는 프로젝트를 더하는 길(`doan onboarding project select`/`clone`, 터미널 `doan work`의 자동 등록)은 있지만 빼는 길은 없다.
- 그래서 에이전트가 프로젝트 정리를 맡아도 마지막 단계는 사람이 앱에서 해야 한다(2026-11-14 리드 세션에서 컨덕터 워크트리를 지울 때 겪었다).

## 정한 점

1. **단위는 프로젝트 그룹**이다. `--repo`(없으면 현재 디렉터리)가 가리키는 Doan 루트가 속한 그룹, 곧 같은 Git common directory를 쓰는 등록된 워크트리 전체를 뺀다. 앱의 Remove from Doan과 같고, PRODUCT의 "removing one worktree alone is not offered"는 바뀌지 않는다.
2. **실행 중인 프로젝트 대화가 있으면 거부**한다(권한 요청·질문 대기 포함). 아무것도 바꾸지 않고 `conversation_running`으로 답한다. 대화를 멈추는 일은 사람이 앱에서 한다. 앱 대화 안의 에이전트가 자기 프로젝트를 빼려 해도 이 규칙으로 막힌다.
3. **앱이 실행 중이 아니면 `app_not_running`으로 거부**하고 앱을 띄우지 않는다(`work`, `handoff`와 같다). CLI는 userData를 직접 쓰지 않는다.
4. **에이전트 노출은 `doan help`에만** 둔다. guide와 스킬 스텁은 바뀌지 않는다.
5. **이름은 `doan remove [--repo <path>] [--json]`**이다. 다른 인자는 없다.
6. **확인 단계는 없다**. 명령을 실행하는 것이 확인이다. 결과에 뺀 프로젝트의 이름과 루트 목록을 돌려준다. 다시 추가하면 되돌릴 수 있다.
7. **앱의 화면 결과는 Remove from Doan과 같다**(지휘자 판단 — PRODUCT §5 item 1 'Remove from Doan'). 토스트가 없고, 불러온 작업 공간의 프로젝트가 화면에 있으면 Home으로 간다. 파일과 Git 워크트리는 그대로 둔다.

## 완료 조건

- 앱이 실행 중이고 그룹에 실행 중인 프로젝트 대화가 없을 때, `doan remove --repo <등록된 워크트리> --json`은 `ok: true`, exit 0이다. `result`는 `{removed: true, project, roots}`이다. 그 그룹의 모든 워크트리가 `folders.json`과 `auto-folders.json`에서 빠지고, 디스크의 파일과 Git 워크트리는 남는다.
- 그 그룹의 작업 공간을 보던 앱은 Home으로 가고, 사이드바·Back/Forward 기록·기억된 캔버스에서 그 루트들이 빠진다. 앱 메뉴로 지웠을 때와 같다.
- 그룹에 실행 중인 프로젝트 대화(권한 요청·질문 대기 포함)가 있으면 `conversation_running`, exit 5이고 아무것도 바뀌지 않는다.
- 등록되지 않은 루트는 `project_not_open`, exit 3이다. 앱이 없거나 runtime을 쓸 수 없으면 `app_not_running`, exit 3이고 앱이 열리지 않는다. 다른 버전의 앱은 `app_protocol_mismatch`, exit 3이다.
- 첫 실행이나 Buddy 화면 중, 또는 앱에 대화상자가 열려 있으면 `busy`, exit 5이고 아무것도 바뀌지 않는다.
- `doan help`에 `remove`가 한 줄로 있고, 파일과 Git 워크트리가 남는다고 적혀 있다. guide(`doan skill`)와 스킬 스텁의 출력은 바뀌지 않는다.

## 하지 않는 것

- 워크트리 하나만 빼기. 앱에도 없는 동작이다.
- 디스크에서 사라진 폴더 빼기. `--repo`로 루트를 찾을 수 없다. 자동 등록된 워크트리는 폴더가 사라지면 이미 조용히 빠지고, 손으로 추가한 워크트리는 앱의 Missing 행에서 Remove from Doan을 쓴다.
- 대화를 멈추고 빼기(앱의 Stop and Remove).
- 앱이 꺼져 있을 때 앱을 띄우거나 userData를 직접 고치기.
- 프로젝트 추가나 목록 보기 같은 다른 프로젝트 명령.
- guide·스킬 스텁 변경과 `/agent-eval`.
