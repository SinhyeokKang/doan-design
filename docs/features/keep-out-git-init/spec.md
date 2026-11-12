# Git 저장소가 아닌 폴더에서 Keep out of Git — 스펙

## 사용자

- **사람**: 빈 폴더처럼 Git 저장소가 아닌 폴더를 Doan 프로젝트로 Set Up 하면서, Doan 파일은 Git 밖에 두고 싶은 사람. 지금은 거절당하고, 터미널에서 직접 `git init`을 해야 한다.
- **에이전트**: 두 경로가 있다.
  - `doan onboarding project select`로 사람 대신 첫 실행을 진행할 때. 앱을 거치므로 사람과 같은 결과를 얻는다. inspect가 돌려주는 변경 목록에 `.git/`이 들어가고, 사람의 기존 Set Up 동의(`initialize`)가 그것까지 포함한다.
  - `doan init`·`doan config`를 직접 실행할 때. 사람이 이 폴더에 Git 저장소를 만드는 데 동의했을 때만 `--git-init`을 붙인다.

## 문제 (관찰된 사실)

- PRODUCT §5 item 0 'Doan files': Git 저장소가 아닌 폴더에서도 Keep out of Git 선택지는 보인다. 그러나 고르면 이유와 함께 거절되고, 아무것도 쓰지 않는다. 안내 문구는 세 곳에 있다.
  - `folderState.ts` `STORAGE_REFUSALS`, `Onboarding.tsx`: "Choose Include in Git, or run git init here first."
  - `onboarding/operations.ts`: "Set it up with storage repo, or run git init there first."
- 거절은 Set Up을 누른 뒤에야 온다(`doan init --storage local`의 `local_not_git`). 변경 목록에는 미리 나오지 않는다. 앱은 Set Up 전에 폴더가 Git 저장소 안에 있는지 모른다. `doan ls`의 `repo_not_found`에 storage 정보가 없기 때문이다.
- Project Settings에서 이미 Include in Git으로 Set Up 된 비 Git 프로젝트는 Keep out of Git 선택지가 비활성이다. 이유는 "Keep out of Git needs a Git repository, and this folder isn't one."이다.
- PRODUCT §3 Out of scope 6은 Doan이 실행하는 git 명령을 onboarding의 clone 하나로 한정한다.

## 완료 조건

"Git 저장소가 아닌 폴더"는 Doan의 판정을 따른다. 폴더와 그 상위 어디에도 Git 저장소가 없는 폴더다. HOME과 그 위의 `.git`은 저장소로 치지 않는다(ARCHITECTURE §13).

1. 이런 폴더에서 Keep out of Git을 고르면, Doan이 `.git/`을 만든다는 것이 Set Up 전에 보인다.
   - Set Up 폼: 변경 목록에 `.git/` 줄이 `.git/info/exclude` 줄과 함께 나온다.
   - 첫 실행과 Add Projects 설정 패널: 저장 방식 카드 아래에 한 줄이 나온다.
2. Set Up을 누르면 Doan이 그 폴더에 Git 저장소를 만든다. 그다음 기존 Keep out of Git 설정을 쓴다. 기존 설정은 `.git/info/exclude`의 표시된 쌍이고, `.gitattributes`는 없다. 커밋, 브랜치, 원격은 만들지 않는다.
3. 적용 경로는 다음과 같고, 모두 같은 결과를 낸다.
   - Set Up 폼, 첫 실행과 Add Projects 설정 패널, `doan onboarding project select`
   - CLI `doan init --storage local --git-init`
   - CLI `doan config --storage local --git-init`
   - CLI는 `--git-init`이 있을 때만 저장소를 만든다. 없으면 지금처럼 `local_not_git`으로 거절한다. 안내에는 "사람에게 먼저 묻고, 동의하면 `--git-init`"을 적는다.
4. Project Settings: 이미 Include in Git으로 Set Up 된 비 Git 프로젝트에서 Keep out of Git을 고를 수 있다.
   - 고르면 저장소를 만든다는 확인 창이 뜬다. 동의하면 저장소를 만들고 전환한다.
   - 취소하면 아무것도 쓰지 않고, 포커스는 선택된 쪽(Include in Git)으로 돌아간다.
   - 성공하면 안내 줄에 저장소를 만들었다는 문장이 더해진다.
   - Doan의 `.gitattributes` 줄은 다른 전환과 같이 남는다.
5. Include in Git을 고르면 지금처럼 저장소를 만들지 않는다.
6. 상위 폴더가 이미 Git 저장소인 폴더는 저장소를 만들지 않는다. 지금처럼 그 저장소의 exclude를 쓴다.
7. HOME 자체와 그 상위 폴더에서는 저장소를 만들지 않는다. 이유와 함께 거절하고 아무것도 쓰지 않는다.
8. Git을 쓸 수 없으면 거절한다. 기준은 clone과 같은 규칙으로 찾은 git이 없을 때다.
   - Command Line Tools 설치 창을 띄우지 않는다.
   - 기존 `git_missing`으로 이유와 복구 방법을 보여 주고, 아무것도 쓰지 않는다.
9. 저장소를 만든 뒤의 단계가 실패하면 처리한다.
   - 이번 실행이 만든 `.git/`을 지우고, 실패를 보여 준다.
   - `.git/`을 지우지 못하면, 남은 `.git/`의 경로와 그것을 지우거나 둘 수 있다는 안내를 보여 준다.
   - 되돌리기 범위는 `.git/`뿐이다. 다른 쓰기의 실패 처리는 지금과 같다.
10. PRODUCT §3 Out of scope 6, §5 item 0 'Doan files'와 Project Settings 항목이 이 동작을 현재 규칙으로 적는다.

## 비목표

- 커밋, 브랜치, 원격(`git remote add`), `.gitignore` 만들기.
- clone 화면: clone은 이미 Git 저장소를 만든다.
- Keep out of Git에서 Include in Git으로 돌아갈 때 `.git/` 지우기. 만든 저장소는 사람의 것이 된다.
- 앱이 CLI를 10초 타임아웃으로 강제 종료했을 때의 되돌리기. design.md '받아들인 위험' 참고.
