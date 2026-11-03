# local-doan-files — spec

Doan 프로젝트(Doan root)마다 Doan 파일(`.doan/`)을 저장소에 커밋할지(**레포 모드**, 지금 동작) 이 기기에만 둘지(**로컬 모드**) 고른다. 로컬 모드에서도 `.doan/`은 저장소 폴더 안에 그대로 있고, git만 그것을 추적하지 않는다.

## 사용자

- **사람(앱 사용자)**: Doan을 쓰고 싶지만 팀 저장소에 `.doan/`을 올리고 싶지 않은 사람이다. 프로젝트 셋업(첫 실행, Add Projects, clone, Set Up)이나 Project Settings에서 로컬을 고르면, 캔버스·댓글·설정이 `git status`에 나오지 않는다.
- **에이전트**: 캔버스를 그리고 읽는 방법은 그대로다(경로, `doan ls`·`check`·`active`·`work`). 셋업을 맡으면 지금처럼 `doan onboarding` 세션(`project select`/`project clone`)이나 `doan init`을 쓰고, 둘 다 모드를 고를 수 있다. 모드는 `doan config --storage`로 바꾸고 `doan ls`로 본다.

## 문제 (관찰된 사실)

- 셋업(`doan init`, 앱의 Set Up, 첫 실행·Add Projects의 setup, clone)은 `.doan/canvases/`, `.doan/config.json`, `.gitattributes`를 저장소 안에 만든다(PRODUCT §5 item 0·8, `cli/internal/cli/init.go`, `app/src/main/onboarding/projects.ts`·`projectAdder.ts`). 이 파일들은 git이 추적하는 대상이 되고, 사람이나 에이전트가 커밋하면 팀 저장소에 들어간다. guide도 "Commit these files … do not ignore the whole directory"라고 한다(`cli/internal/cli/skill.md:11`).
- Doan에는 `.doan/`을 저장소 기록에서 빼는 설정이 없다. 사람이 직접 `.gitignore`에 넣으면 그 `.gitignore` 자체가 커밋 대상이 되어 팀에 흔적이 남는다.
- 그래서 개인적으로 Doan을 쓰고 싶은 사람은 팀 저장소에 Doan 파일을 남기거나 Doan을 쓰지 않아야 한다(사용자 제안, 2026-11-03).

## 이미 정한 것 (사용자 결정)

1. 로컬 모드는 `.doan/`을 저장소 폴더 안에 두고 git이 추적하지 않게 한다. 저장소 밖(userData 등)으로 옮기지 않는다. 캔버스의 상대 경로(token CSS, 폰트, assets), CLI의 저장소 탐색, 서빙 범위가 그대로 동작한다.
2. Doan(CLI)이 저장소의 exclude 파일(`<common dir>/info/exclude`, 커밋되지 않는 이 기기 전용 제외 목록, 같은 저장소의 모든 worktree가 공유)에 Doan 표식 줄과 그 Doan root의 `.doan/` 패턴 줄을 한 쌍으로 넣고 뺀다. git 명령은 실행하지 않는다.
3. 이미 `.doan/`이 커밋된 프로젝트도 로컬로 바꿀 수 있다. 이미 추적 중인 파일은 exclude가 빼지 않는다. Doan은 `.git/index`를 읽지 않고, 로컬 모드에서는 항상 조건문 안내를 보인다: 전에 `.doan/`을 커밋했다면 그 파일은 계속 추적되고, 멈추려면 이 프로젝트 폴더에서 `git rm -r --cached .doan`을 실행한 뒤 커밋하며, 팀원이 그 커밋을 pull하면 그들의 `.doan/`도 지워진다. Doan이 `git rm -r --cached`를 실행하지 않는 이유가 바로 그 마지막 결과다. 또 Doan은 커밋하지 않으므로 stage된 삭제가 사람의 다음 커밋에 섞인다.
4. 로컬 모드에서 `.doan/`은 worktree를 따라가지 않는다. 각 checkout에 따로 있다. 이 한계를 받아들이고 설정 화면과 문서에 적는다.
5. 모드는 모든 셋업 경로에서 고른다: Set Up 폼, 첫 실행·Add Projects의 setup 패널, clone 화면, `doan onboarding project select`/`project clone`, `doan init --storage`. Project Settings와 `doan config --storage`에서 바꾼다.
6. 모드는 Doan root마다 정한다. 패턴은 Git 저장소 최상위 기준의 그 root 상대 경로로 고정한다(`/<rel>/.doan/`, 최상위 root면 `/.doan/`). 같은 root의 모든 worktree는 같은 rel이라 모드를 공유하고, 같은 저장소의 다른 Doan root는 따로 고른다.
7. Git 저장소가 아닌 폴더에서도 모드 선택은 보인다. 로컬을 고르면 셋업이 거절되고 이유가 보이며, 아무것도 쓰지 않는다.

## 완료 조건

1. 로컬 모드로 셋업한 저장소에서 `git status --porcelain`이 `.doan/` 아래 파일과 `.gitattributes` 변경을 보이지 않는다. 로컬 셋업은 `.gitattributes`를 쓰지 않는다.
2. exclude 파일에는 Doan 표식 줄과 패턴 줄 한 쌍만 더해지고, 그 파일의 다른 바이트는 그대로다. 레포 모드로 바꾸면 그 쌍만 빠진다. 쌍이 이미 있으면 다시 더하지 않는다.
3. 로컬 저장소에 새 worktree를 셋업하면(앱이든 plain `doan init`이든) 현재 모드를 따라 `.gitattributes`를 쓰지 않는다. 셋업 폼은 그 root의 모드가 이미 로컬이면 선택지 대신 "이 프로젝트의 모든 worktree에서 Git 밖에 둔다"는 사실을 보인다. 그런 worktree의 'Not set up' 안내는 로컬 모드라서 이 checkout에 아직 Doan 파일이 없다고 설명한다.
4. 로컬에서 레포로 바꾸면 빠진 `.gitattributes`의 Doan 두 줄(union merge, linguist)을 먼저 더하고, 결과에 그 파일을 적는다. 레포에서 로컬로 바꿀 때는 `.gitattributes`를 건드리지 않고, 그 줄이 남는다는 것을 안내한다.
5. Project Settings가 지금 모드를 보이고 바꿀 수 있다. 모드는 이 프로젝트의 모든 worktree에 적용된다고 말한다. 로컬 모드 설명에는 다음이 들어간다: 이 Mac에만 있다, 다른 worktree나 기기로 따라가지 않는다, Git이 무시하는 파일이라 worktree 제거(`git worktree remove`)나 `git clean -x`가 지운다, 캔버스를 보여 주려면 캔버스 메뉴의 Export를 쓴다. 경로 줄의 "Stored in `.doan/config.json` in this worktree. Commit it so your team gets these settings."(`ProjectSettingsPage.tsx`)는 로컬 모드에서 커밋 언급 없이 이 Mac에만 있다고 바뀐다.
6. 로컬 모드에서는 결정 3의 조건문 안내가 항상 보이고, 명령은 Copy할 수 있다. `doan config --storage local`의 결과에도 같은 안내가 실린다. Doan은 git 명령을 실행하지 않는다.
7. 레포로 바꾼 뒤에는 `.doan/`이 이제 `git status`에 보이고 커밋하면 팀에 간다는 안내가 보인다.
8. 모드는 exclude의 Doan 표식 쌍으로만 판단한다. 같은 root의 모든 worktree가 같은 모드를 보인다. 앱에서 모드를 바꾸면 같은 group의 모든 worktree의 Project Settings가 새 모드를 보인다. 앱 밖에서 `doan config`로 바꾼 것은 Project Settings를 열 때와 창 focus 때의 다시 읽기에서 보인다.
9. Git 저장소가 아니면 로컬 모드를 고를 수 없고 그 이유를 보인다. `.git` 메타데이터를 읽을 수 없으면 모드를 "알 수 없음"으로 보이고 전환하지 못하며, 그 이유를 따로 보인다.
10. `doan init --storage local`은 로컬 모드로 셋업하고 결과의 `created`에 exclude 파일을 적는다. 이미 셋업된 checkout에서는 거절하고 `doan config --storage`를 안내한다. `doan config --storage local|repo`는 모드를 바꾸고 결과에 새 `storage`를 돌려준다. `doan onboarding project select`/`project clone`의 셋업도 모드를 받고, 확인 화면의 바뀌는 파일 목록이 모드를 따른다. `doan ls`는 모드와 로컬로 바꿀 수 없는 이유를 보인다. 그 밖의 CLI 명령과 캔버스 동작은 모드와 상관없이 같다.
11. 로컬 셋업은 exclude 쌍을 config보다 먼저 쓴다. exclude 쓰기가 실패하면 아무것도 만들지 않고, 폼은 로컬 선택을 유지한 채 이유를 보인다.
12. 로컬 모드에서 사람이 `.gitignore`를 따로 쓰거나 `.doan/`을 직접 커밋하는 것은 막지 않는다. 사람이 쓴 `.doan` 줄, `.gitignore` 항목, `!.doan/` 같은 부정 패턴은 모드 판단에 쓰지 않으며, 이 한계는 문서에 적는다.

## 바뀌는 PRODUCT·ARCHITECTURE 결정

승격 task(T6)에서 현재 규칙으로 고쳐 쓴다.

- PRODUCT §1 문제 4 "→ Show (the canvas is a file in the repo)": 로컬 모드에서는 저장소 기록에 없어 기기와 함께 사라질 수 있다.
- PRODUCT §3 Out of scope 6: git 명령은 여전히 실행하지 않지만, Doan이 쓰는 Git 설정에 exclude 쌍이 더해진다.
- PRODUCT §5 item 0: 첫 실행 Project 단계와 Project Settings의 모드, 에이전트 셋업 경로의 모드.
- PRODUCT §5 item 1: Add Projects의 셋업과 clone의 모드.
- PRODUCT §5 item 8 `doan init`: `--storage`, 로컬 저장소에서 `.gitattributes`를 건너뜀.
- ARCHITECTURE §1: "`.doan/` is committed" → 레포 모드일 때.
- ARCHITECTURE §2: "That line and the linguist line are the only Git configuration Doan writes" → exclude 쌍 예외.
- ARCHITECTURE §10: 캔버스가 git pull로 옮겨진다 → 레포 모드일 때.
- ARCHITECTURE §12: `init`·`config`·`ls` 계약(`--storage`, `storage`, 이유 값), "Writes go only to the in-repo config"의 예외.
- ARCHITECTURE §13 'Listing' "nothing is read or written outside the repo"와 'Read-only Git metadata' "No Git command or write runs": exclude 쌍 쓰기 예외.
- ARCHITECTURE §4·§7: onboarding v2의 모드와 `changes`, Settings IPC의 모드 쓰기.

## 비목표

- `.doan/`을 저장소 밖에 두기.
- 로컬 모드에서 worktree 사이에 캔버스를 공유하기(결정 4).
- git 명령 실행(`git rm --cached`, commit 등)과 `.git/index` 읽기.
- 기기 사이 동기화나 백업.
- 모드 전환 때 파일 옮기기나 지우기.
- 사람이 쓴 ignore 규칙을 모드로 해석하기(완료 조건 12).
- 로컬 모드 worktree의 terminal work 자동 등록. 새 worktree에는 `.doan/config.json`이 없어 `doan work start`가 CLI에서 먼저 실패한다(terminal-work-worktrees spec 비목표).

## 결정 (지휘자 판단, /feature-review에서 확인)

8. **모드의 근거는 exclude의 Doan 표식 쌍 하나다.** `.doan/config.json`에 모드를 따로 적지 않는다. 두 곳에 적으면 어긋날 수 있고, exclude는 이미 저장소 단위(모든 worktree 공유)라 결정 6의 범위와 맞는다.
