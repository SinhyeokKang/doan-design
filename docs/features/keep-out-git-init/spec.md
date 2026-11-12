# Git 저장소가 아닌 폴더에서 Keep out of Git — 스펙

## 사용자

- **사람**: 앱에서 빈 폴더(또는 Git 저장소가 아닌 폴더)를 Doan 프로젝트로 Set Up 하면서 Doan 파일을 Git 밖에 두고 싶은 사람. 지금은 거절당하고 터미널에서 `git init`을 직접 해야 한다.
- **에이전트**: `doan onboarding project select`로 사람 대신 첫 실행을 진행하는 에이전트. 이 경로는 앱을 거치므로 사람과 같은 결과를 얻는다.

## 문제 (관찰된 사실)

- PRODUCT §5 item 0 'Doan files': Git 저장소가 아닌 폴더에서도 Keep out of Git 선택지는 보이지만, 고르면 이유와 함께 거절되고 아무것도 쓰지 않는다. 안내는 "Choose Include in Git, or run git init here first."다(`folderState.ts` `STORAGE_REFUSALS`, `Onboarding.tsx`, `onboarding/operations.ts`).
- 거절은 Set Up 버튼을 누른 뒤 `doan init --storage local`의 `local_not_git`으로 온다. 변경 목록에는 미리 나오지 않는다. 앱은 Set Up 전에 폴더가 Git 저장소 안인지 모른다(`doan ls`의 `repo_not_found`에 storage 정보가 없다).
- PRODUCT §3 Out of scope 6은 Doan이 실행하는 git 명령을 onboarding의 clone 하나로 한정한다.

## 완료 조건

1. Git 저장소 안에 있지 않은 폴더(상위 폴더도 저장소가 아님)를 Set Up 할 때 Keep out of Git을 고르면, 변경 목록에 `.git/`이 새 저장소로 나온다. Set Up 전에 나온다.
2. Set Up을 누르면 Doan이 그 폴더에서 `git init`을 실행한 뒤 기존 Keep out of Git 설정(`.git/info/exclude`의 표시된 쌍, `.gitattributes` 없음)을 쓴다. 커밋, 브랜치 생성, 원격 설정은 하지 않는다.
3. 적용 경로: Set Up 폼, 첫 실행과 Add Projects의 설정 패널, `doan onboarding project select`, Project Settings의 Keep out of Git 전환, CLI `doan init --storage local --git-init`과 `doan config --storage local --git-init`. 모두 같은 결과를 낸다.
   - CLI는 `--git-init`이 있을 때만 `git init`을 한다. 없으면 지금처럼 `local_not_git`으로 거절하고, 안내에 `--git-init`을 적는다.
   - Project Settings는 이미 Include in Git으로 Set Up 된 비 Git 프로젝트에서 Keep out of Git을 고르면, `.git/`을 만든다는 확인을 거친 뒤 전환한다. 지금은 이 선택지가 비활성이다.
4. Include in Git을 고르면 지금처럼 `git init`을 하지 않는다.
5. 상위 폴더가 이미 Git 저장소인 폴더는 `git init`을 하지 않고 지금처럼 그 저장소의 exclude를 쓴다.
6. Git을 쓸 수 없으면(개발자 도구에 `git`이 없음) Command Line Tools 설치 창을 띄우지 않고 이유와 함께 거절하며 아무것도 쓰지 않는다.
7. `git init` 뒤의 단계가 실패하면 이번 실행이 만든 `.git/`을 지우고, 지금처럼 아무것도 쓰지 않은 상태로 거절한다.
8. PRODUCT §3 Out of scope 6에 이 예외가 들어간다.

## 비목표

- 커밋, 브랜치, 원격(`git remote add`), `.gitignore` 만들기.
- clone 화면: clone은 이미 Git 저장소를 만든다.
- Keep out of Git에서 Include in Git으로 돌아갈 때 `.git/` 지우기. 만든 저장소는 사람의 것이 된다.
