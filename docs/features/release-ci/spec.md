# release-ci — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C6) · 선행: [ci-gate](../ci-gate/spec.md), 부모 G3a(환경·비밀) (부모 D5 D6 D7 D8 D13 D14 D15 D18) · 후행: [app-update](../app-update/spec.md) ∥ [release-skill](../release-skill/spec.md) → 부모 G3c → R1·R2

Developer ID 서명과 공증을 로컬 keychain에서 GitHub Actions로 옮기고, 테스트 빌드와 릴리스 빌드를 CI에서 만든다. 릴리스 빌드는 `/release`가 push한 `v<version>` 태그로 시작하고, GitHub Release(draft)에 앱 업데이트가 읽을 자산까지 올린다. 태그를 만들고 게시하는 쪽은 사용자가 부른 `/release`다([release-skill](../release-skill/spec.md), 부모 D7). `/ship`으로 진행한다.

## 사용자

- **메인테이너**: `/tester-build`로 테스트 dmg를 받고, `/release`로 릴리스를 낸다. 서명 자격 증명은 GitHub의 환경 비밀로만 있다.
- **테스터**: 공증된 테스트 dmg를 받는다(D8).
- **앱 사용자**: 공증된 dmg를 Release에서 받고, 설치한 앱이 같은 Release의 `latest-mac.yml`과 zip으로 업데이트한다(app-update).
- **에이전트**: `/tester-build`가 로컬 서명 대신 워크플로를 시작하고 결과를 받는다(D8). `/release`가 이 자식의 스크립트와 워크플로를 '/release와의 계약'대로 부른다. 비밀은 읽지 않는다.

## 문제

- 서명·공증은 빌드하는 기계의 login keychain에서만 한다(docs/ARCHITECTURE.md:718–719, `.agents/skills/tester-build/SKILL.md:8`). 다른 기계는 `.p12`와 API 키를 손으로 설치해야 하고, 그 과정은 검증되지 않았다(docs/BACKLOG.md 'Not verified for tester dmgs').
- 테스트 dmg는 dmg만 만든다(`--mac dmg`). 앱 업데이트에 필요한 zip과 `latest-mac.yml`이 없다(부모 design.md '조사' electron-builder).
- `app/package.json`에 `publish` 설정이 없고, 루트 `LICENSE`와 디자인 프리셋 고지가 앱 패키지에 없다(docs/BACKLOG.md:17).
- electron-builder는 태그를 만들지 않는다. draft를 그대로 게시하면 GitHub가 기본 브랜치(`main`, D2)의 HEAD에 태그를 단다(부모 '조사'). 그래서 `/release`가 태그를 먼저 만든다(D7).
- 릴리스 빌드를 만드는 곳이 없다. 절차는 release-skill이 스킬로 만들고, 이 자식은 그 스킬이 부를 워크플로와 스크립트를 만든다.

## 완료 조건

- 테스트 빌드 워크플로(D8: `workflow_dispatch`, 입력 없음, `develop` HEAD만)가 서명·공증·스테이플된 arm64 dmg를 산출물로 남기고, 서명 검증 스크립트를 통과한다. 테스트 빌드에는 업데이트 피드 설정이 없다(app-update와의 계약).
- 릴리스 워크플로(`on: push: tags: v*`)가 태그 커밋이 `origin/main`의 조상인지와 버전을 검사하고, 서명 작업이 `--publish never`로 만든 dmg를 공증·스테이플·검증한 뒤, 비밀이 없는 게시 작업이 그 태그의 draft Release(rc면 prerelease)에 dmg·zip·zip.blockmap·`latest-mac.yml`을 올린다. 이미 같은 버전의 draft나 게시본이 있으면 아무것도 만들지 않고 실패 코드로 끝난다.
- 서명 작업만 D6의 환경을 쓰고, 게이트는 그 전에 ci-gate의 `workflow_call`로 비밀 없이 돈다. 포크 PR이나 `pull_request_target`에서 서명 작업이 돌 수 없다. 서명 작업은 첫 단계에서 비밀이 모두 있는지(값은 출력하지 않고) 확인한다.
- 패키지된 앱의 `Contents/Resources/LICENSE`와 `Contents/Resources/notices/`(`cli/internal/designskill/notices/`의 내용)가 있다(D15).
- `npm --prefix app run package`는 지금처럼 서명하지 않은 로컬 패키지를 만들고, 그 앱에 `Contents/Resources/app-update.yml`이 없다(docs/ARCHITECTURE.md:717).
- `/tester-build`가 D8대로 바뀌었다. 비밀 이름 목록과 사람이 비밀을 처음 넣고 갱신하는 절차가 [release-skill design](../release-skill/design.md) 'One-time setup'에 있다(이 디렉터리는 끝에 지워지므로).
- '/release와의 계약'(design.md)이 워크플로, 스크립트 경로·인자·종료 코드, 자산 이름을 정하고, release-skill이 그 절을 가리킨다.
- ARCHITECTURE §9가 새 현재 규칙(CI 서명, 환경 비밀, 산출물, 업데이트 피드 계약, 고지 위치, 확인한 electron-builder 동작)을 적고, PRODUCT에 Doan을 어떻게 받는지(GitHub Releases의 공증된 arm64 dmg) 한 줄이 있으며, BACKLOG의 해당 항목이 정리됐다.

## 비목표

- 앱 안 업데이트(app-update). 이 자식은 피드와 자산까지만 만든다.
- x64·universal(D14), Homebrew, 웹사이트 다운로드.
- 실제 0.1.0 게시(부모 R2), `/release` 스킬(release-skill).
- electron-builder 업그레이드(v27의 서명된 매니페스트 등).
