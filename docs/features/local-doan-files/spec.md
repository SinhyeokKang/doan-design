# local-doan-files — spec

프로젝트마다 Doan 파일(`.doan/`)을 저장소에 커밋할지(**레포 모드**, 지금 동작) 이 기기에만 둘지(**로컬 모드**) 고른다. 로컬 모드에서도 `.doan/`은 저장소 폴더 안에 그대로 있고, git만 그것을 추적하지 않는다.

## 사용자

- **사람(앱 사용자)**: Doan을 쓰고 싶지만 팀 저장소에 `.doan/`을 올리고 싶지 않은 사람이다. 프로젝트 셋업이나 Project Settings에서 로컬을 고르면, 캔버스·댓글·설정이 `git status`에 나오지 않는다.
- **에이전트**: 캔버스를 그리고 읽는 방법은 그대로다(경로, `doan ls`·`check`·`active`·`work`). 셋업을 맡으면 `doan init --local`로 로컬 프로젝트를 만들 수 있고, `doan config`로 모드를 바꿀 수 있다.

## 문제 (관찰된 사실)

- 셋업(`doan init`, 앱의 Set Up, 첫 실행·Add Projects의 setup)은 `.doan/canvases/`, `.doan/config.json`, `.gitattributes`를 저장소 안에 만든다(PRODUCT §5 item 8, `cli/internal/cli/init.go`). 이 파일들은 git이 추적하는 대상이 되고, 사람이나 에이전트가 커밋하면 팀 저장소에 들어간다.
- Doan에는 `.doan/`을 저장소 기록에서 빼는 설정이 없다. 사람이 직접 `.gitignore`에 넣으면 그 `.gitignore` 자체가 커밋 대상이 되어 팀에 흔적이 남는다.
- 그래서 개인적으로 Doan을 쓰고 싶은 사람은 팀 저장소에 Doan 파일을 남기거나 Doan을 쓰지 않아야 한다(사용자 제안, 2026-11-03).

## 이미 정한 것 (사용자 결정)

1. 로컬 모드는 `.doan/`을 저장소 폴더 안에 두고 git이 추적하지 않게 한다. 저장소 밖(userData 등)으로 옮기지 않는다. 캔버스의 상대 경로(token CSS, 폰트, assets), CLI의 저장소 탐색, 서빙 범위가 그대로 동작한다.
2. Doan(CLI)이 저장소의 `.git/info/exclude`(커밋되지 않는 이 기기 전용 제외 목록, 같은 저장소의 모든 worktree가 공유)에 표식이 붙은 `.doan/` 한 줄을 넣고 뺀다. git 명령은 실행하지 않는다.
3. 이미 `.doan/`이 커밋된 프로젝트도 로컬로 바꿀 수 있다. 이미 추적 중인 파일은 exclude가 빼지 않으므로, 계속 추적된다는 것과 빼는 방법(`git rm -r --cached .doan` 뒤 커밋)을 안내한다. 커밋은 사람이나 에이전트가 한다. Doan이 `git rm -r --cached`를 실행하지 않는 이유: 그 삭제가 커밋되어 push되면 팀원이 pull할 때 그들의 `.doan/`이 지워지고, Doan이 커밋하지 않으므로 stage된 삭제가 사람의 다음 커밋에 섞인다.
4. 로컬 모드에서 `.doan/`은 worktree를 따라가지 않는다. 각 checkout에 따로 있다. 이 한계를 받아들이고 설정 화면과 문서에 적는다.
5. 모드는 프로젝트 셋업(Set Up 폼, 첫 실행·Add Projects의 setup 확인)에서 고르고 Project Settings에서 바꾼다. 에이전트용으로 `doan init --local`과 `doan config`의 모드 옵션을 둔다.

## 완료 조건

1. 로컬 모드로 셋업한 저장소에서 `git status --porcelain`이 `.doan/` 아래 파일과 `.gitattributes` 변경을 보이지 않는다. 셋업은 `.gitattributes`를 쓰지 않는다(그 파일은 커밋 대상이다).
2. `.git/info/exclude`에는 Doan 표식이 붙은 `.doan/` 줄 하나만 더해지고, 그 파일의 다른 줄은 그대로다. 레포 모드로 바꾸면 그 줄만 빠진다. 줄이 이미 있으면 다시 더하지 않는다.
3. Project Settings가 지금 모드를 보이고 바꿀 수 있다. 로컬 모드 설명에 "이 기기에만 있고, 다른 worktree나 기기로 따라가지 않으며, 공유는 Export로 한다"가 들어간다. 경로 줄의 "stored in the worktree's `.doan/config.json` for committing" 문구는 로컬 모드에서 커밋 언급 없이 바뀐다.
4. `.doan/` 아래 파일이 이미 git에 추적되는 저장소를 로컬로 바꾸면, 모드는 바뀌고 "이미 커밋된 파일은 계속 추적된다"는 안내와 빼는 명령이 보인다. Doan은 git 명령을 실행하지 않는다.
5. 모드는 `.git/info/exclude`의 Doan 줄로 판단한다. 같은 저장소의 모든 worktree가 같은 모드를 보인다. Git 저장소가 아니거나 `.git` 메타데이터를 읽을 수 없으면 로컬 모드를 고를 수 없고 이유를 보인다.
6. `doan init --local`은 로컬 모드로 셋업하고, `doan config`의 모드 옵션은 모드를 바꾼다. 둘 다 결과에 바뀐 파일(`.git/info/exclude`)을 적는다. 다른 CLI 명령과 캔버스 동작은 모드와 상관없이 같다.
7. 로컬 모드에서 사람이 `.gitignore`를 따로 쓰거나 `.doan/`을 직접 커밋하는 것은 막지 않는다.

## 비목표

- `.doan/`을 저장소 밖에 두기.
- 로컬 모드에서 worktree 사이에 캔버스를 공유하기(결정 4).
- git 명령 실행(`git rm --cached`, commit 등).
- 기기 사이 동기화나 백업. 공유는 Export로 한다(PRODUCT §3 In scope 8).
- 모드 전환 때 파일 옮기기나 지우기.

## 결정 (지휘자 판단, /feature-review에서 확인)

6. **모드의 근거는 `.git/info/exclude`의 Doan 줄 하나다.** `.doan/config.json`에 모드를 따로 적지 않는다. 두 곳에 적으면 어긋날 수 있고, exclude는 이미 저장소 단위(모든 worktree 공유)라 모드의 범위와 맞는다.
