# local-doan-files — design

spec 결정 1~6을 CLI(파일 쓰기와 판단)와 app(셋업·Project Settings UI)으로 나눈다. Git 메타데이터 해석과 `.git/` 쓰기는 Go만 한다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| CLI repo | `cli/internal/repo/git.go`(또는 새 파일) | 저장소의 `info/exclude` 경로 찾기(worktree의 `.git` 파일 → common dir), Doan 줄 읽기·더하기·빼기 |
| CLI 명령 | `cli/internal/cli/init.go`, `config.go`, `config_ops.go` | `init --local`(`.gitattributes` 건너뜀, exclude 줄 추가), `config`의 모드 옵션, 결과의 `changes` |
| CLI `ls` | `ls` 결과 | 모드(`storage: "repo" | "local"`)와 로컬로 바꿀 수 있는지, `.doan/` 아래 추적 중인 파일이 있는지 |
| app | `ProjectSettingsPage.tsx`, `projectSettingsRules.ts`, `ProjectSetupDialog.tsx`, 첫 실행·Add Projects의 setup 확인, main의 settings IPC | 모드 선택과 안내 |
| guide | `cli/internal/cli/skill.md` Onboarding·init 설명 | `--local` 한 줄 |
| formats | `ls` 응답(ARCHITECTURE §4) | 새 필드. JSON Schema 정본과 TS·Go 공유 fixture 갱신 |

## 2. CLI

### 2.1 exclude 줄

- 위치: `<common dir>/info/exclude`. worktree의 `.git`은 `gitdir:` 파일이고, common dir은 이미 `ls`의 `git.common`을 구하는 코드(`cli/internal/repo/git.go`)가 찾는다. 같은 규칙(정규 파일, 크기 제한, 홈 위 `.git` 무시)을 따른다.
- 줄 모양: `/.doan/  # doan: local` 처럼 표식이 붙은 한 줄. 표식으로 Doan이 쓴 줄만 찾고 뺀다. 사람이 쓴 `.doan` 줄은 건드리지 않는다(있으면 로컬로 판단할지 `/feature-review`에서 정한다).
- 쓰기: 읽고, 줄을 더하거나 빼고, 같은 폴더에 temp file + rename. `info/`가 없으면 만든다. 끝 줄바꿈과 다른 줄은 그대로 둔다. 파일이 링크이거나 정규 파일이 아니면 거절한다(ARCHITECTURE §13의 링크 규칙).
- git 명령은 실행하지 않는다.

### 2.2 추적 중인 파일 확인 (spec 완료 조건 4)

`.doan/` 아래 파일이 이미 추적되는지 알려면 `.git/index`를 읽어야 한다. 선택지는 (a) Go가 index 파일의 경로 목록만 읽는다(형식 v2~v4, 경로 prefix 검사), (b) 확인하지 않고 로컬로 바꿀 때 항상 "이미 커밋된 파일이 있으면 계속 추적된다"는 안내를 보인다. 구현이 작은 (b)를 기본으로 하고, (a)가 필요한지 `/feature-review`에서 정한다.

### 2.3 명령

- `doan init --local`: 지금 init과 같되 `.gitattributes`를 쓰지 않고 exclude 줄을 더한다. Git 저장소가 아니면 `usage_error`(로컬 모드는 git이 있어야 의미가 있다).
- `doan config --storage local|repo`(이름은 `/tdd`에서): exclude 줄을 더하거나 뺀다. `.gitattributes`는 건드리지 않는다(레포→로컬 때 이미 있는 union merge 줄은 무해하고, 지우면 팀 파일을 바꾼다).
- `ls`: `storage`, 로컬 전환 가능 여부(Git 저장소이고 exclude를 쓸 수 있음). 2.2에서 (a)를 고르면 `trackedDoanFiles: boolean`.

## 3. app

- 셋업 폼(Set Up, 첫 실행·Add Projects의 setup 확인): "Doan files" 선택(Commit with the repository / Keep on this device). 기본값은 레포(지금 동작). 로컬이면 바뀌는 파일 목록에 `.gitattributes` 대신 `.git/info/exclude`가 나온다.
- Project Settings: 모드 표시와 전환, 로컬 설명(이 기기에만, worktree·기기로 따라가지 않음, 공유는 Export), 로컬 전환 때 추적 안내. 전환은 다른 설정처럼 바로 저장하고 Saving/Saved와 오류를 보인다(PRODUCT §5 item 1 'Project Settings').
- 경로 줄의 "for committing" 문구를 모드에 따라 바꾼다.
- Git 저장소가 아니면 로컬 선택지가 비활성이고 이유를 보인다.
- 문구는 `/design-draft` 때 `clarify` preset으로 정한다.

## 4. 순수 함수로 뺄 부분 (`/tdd` 대상)

| 함수 | 위치 | 고정할 사례 |
|---|---|---|
| exclude 줄 더하기·빼기 | Go | 빈 파일, 끝 줄바꿈 없음, 이미 있음, 사람이 쓴 `.doan` 줄은 그대로, 다른 줄 보존, CRLF |
| 모드 판단 | Go | Doan 줄 있음·없음, exclude 없음, Git 아님 |
| init 파일 계획 | Go `init.go` | 로컬이면 `.gitattributes` 없음, exclude 있음 |
| 셋업·설정 화면 규칙 | `projectSettingsRules.ts` 등 | 모드별 문구, 비활성 이유, 추적 안내 |

## 5. 형식 변경

- `ls` 응답에 `storage`(와 2.2 결과에 따라 `trackedDoanFiles`)가 생긴다. JSON Schema 정본(ARCHITECTURE §11 'Shared formats')을 고치고, TS와 Go가 함께 읽는 fixture를 더한다. 필드 추가라 `v`는 올리지 않는다(이전 앱은 모르는 필드를 무시하는지 확인한다).
- `init`·`config` 결과의 `changes`에 `.git/info/exclude`가 나올 수 있다.
- `.doan/config.json`은 바뀌지 않는다(spec 결정 6).

## 6. Conventions·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check`는 바뀌지 않는다.
- **No git operations**(PRODUCT §3 Out of scope 6): git 명령은 실행하지 않는다. 다만 `.git/` 안 파일 하나(`info/exclude`)를 쓴다. ARCHITECTURE §13 'Read-only Git metadata'의 "No Git command or write runs"를 "Doan의 exclude 줄만 쓴다"로 고치고, PRODUCT §3 Out of scope 6에 그 예외를 적는다(승격 task).
- **캔버스는 저장소 파일**(PRODUCT §1 문제 4): 로컬 모드에서도 캔버스는 저장소 폴더 안의 파일이다. 다만 저장소 기록에는 없어 기기를 잃으면 사라진다. 설정 화면이 이를 말하고 Export를 안내한다. PRODUCT §1 문제 4의 "→ Show (the canvas is a file in the repo)"에 로컬 모드의 한계를 적는다.
- **guide·CLI 출력 변경**: `/agent-eval`이 필요하다(init·config 설명, 새 옵션).
- **terminal-work-worktrees와의 관계**: 로컬 모드에서도 worktree 자동 등록은 동작하지만 그 worktree에는 main checkout의 캔버스가 없다(spec 결정 4). 두 feature가 같이 들어가면 Project Settings의 로컬 설명이 이를 말한다.

## 7. PoC 의존

없음. exclude 동작은 git 문서의 규칙(`gitignore(5)`: `$GIT_DIR/info/exclude`, 추적 중인 파일에는 효과 없음)이고, worktree가 common dir의 `info/exclude`를 공유하는지는 T1 테스트에서 실제 `git worktree`로 확인한다(테스트가 git을 실행하는 것은 개발 도구이고 제품 동작이 아니다).

## 8. POSTMORTEM에서 가져온 함정

- **2026-10-31 workTarget 링크 탈출**, ARCHITECTURE §13 링크 규칙: `.git` 메타데이터 파일이 링크이거나 홈 위에 있으면 따르지 않는다. exclude 쓰기도 같은 규칙을 따른다.
- **2026-10-25 'Startup cache collection deleted a live thumbnail temporary file'**: temp file + rename을 쓸 때 다른 쓰기와 겹치지 않게 고유 이름을 쓰고, 실패하면 temp를 지운다.
