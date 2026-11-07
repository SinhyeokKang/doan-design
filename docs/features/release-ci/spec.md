# release-ci — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C6) · 선행: [ci-gate](../ci-gate/spec.md), 부모 G3(환경·비밀) (부모 P1의 D5 D6 D7 D8 D13 D14 D15 D18) · 후행: [app-update](../app-update/spec.md) ∥ [release-skill](../release-skill/spec.md) → 부모 R1·R2

Developer ID 서명과 공증을 로컬 keychain에서 GitHub Actions로 옮기고, 테스트 빌드와 릴리스 빌드를 CI에서 만든다. 릴리스 빌드는 GitHub Release(draft)에 앱 업데이트가 읽을 자산까지 올린다. 릴리스 워크플로를 시작하고 게시하는 쪽은 사용자가 부른 `/release`다([release-skill](../release-skill/spec.md), 부모 '사용자 결정' 2). `/ship`으로 진행한다.

## 사용자

- **메인테이너**: `/tester-build`로 테스트 dmg를 받고, `/release`로 릴리스를 낸다. 서명 자격 증명은 GitHub의 환경 비밀로만 있다.
- **테스터**: 공증된 테스트 dmg를 받는다(D8).
- **앱 사용자**: 공증된 dmg를 Release에서 받고, 설치한 앱이 같은 Release의 `latest-mac.yml`과 zip으로 업데이트한다(app-update).
- **에이전트**: `/tester-build`가 로컬 서명 대신 워크플로를 시작하고 결과를 받는다(D8). 비밀은 읽지 않는다.

## 문제

- 서명·공증은 빌드하는 기계의 login keychain에서만 한다(docs/ARCHITECTURE.md:718–719, `.agents/skills/tester-build/SKILL.md:8`). 다른 기계는 `.p12`와 API 키를 손으로 설치해야 하고, 그 과정은 검증되지 않았다(docs/BACKLOG.md 'Not verified for tester dmgs').
- 테스트 dmg는 dmg만 만든다(`--mac dmg`). 앱 업데이트에 필요한 zip과 `latest-mac.yml`이 없다(부모 design.md '조사' electron-builder).
- `app/package.json`에 `publish` 설정이 없고, 루트 `LICENSE`와 디자인 프리셋 고지가 앱 패키지에 없다(docs/BACKLOG.md:17).
- 릴리스 빌드를 만드는 곳이 없다. 절차는 release-skill이 스킬로 만들고, 이 자식은 그 스킬이 부를 워크플로를 만든다.

## 완료 조건

- 테스트 빌드 워크플로(D8: `workflow_dispatch`, 기본 ref `develop`)가 서명·공증·스테이플된 arm64 dmg를 산출물로 남기고, `/tester-build` 6단계와 같은 검사를 CI에서 모두 통과한다. 테스트 빌드에는 업데이트 피드 설정이 없다(app-update와의 계약, design.md).
- 릴리스 워크플로(`main`에서만 도는 `workflow_dispatch`, `/release`가 시작한다)가 버전 검사 → `v<version>` 태그 → draft Release를 만들고, 공증된 dmg·zip·`latest-mac.yml`(+ blockmap)을 올린다. 이미 있는 태그나 최신 게시본보다 낮은 버전이면 아무것도 만들지 않고 실패한다.
- 서명 작업만 D6의 환경을 쓰고, 그 밖의 작업은 비밀을 읽지 않는다. 포크 PR이나 `pull_request_target`에서 서명 작업이 돌 수 없다.
- 패키지된 앱의 `Contents/Resources/`에 루트 `LICENSE`와 `cli/internal/designskill/notices/`가 있다(D15).
- `npm --prefix app run package`는 지금처럼 서명하지 않은 로컬 패키지를 만든다(docs/ARCHITECTURE.md:717).
- `/tester-build`가 D8대로 바뀌었다. 비밀 이름 목록과 사람이 비밀을 처음 넣고 갱신하는 절차는 release-skill이 `/release`의 'One-time setup'으로 옮길 수 있게 이 디렉터리의 design.md에 있다.
- ARCHITECTURE §9가 새 현재 규칙(CI 서명, 환경 비밀, 산출물, 고지 위치)을 적고 BACKLOG의 해당 항목이 정리됐다.

## 비목표

- 앱 안 업데이트(app-update). 이 자식은 피드와 자산까지만 만든다.
- x64·universal(D14), Homebrew, 웹사이트 다운로드.
- 실제 0.1.0 게시(부모 R2), `/release` 스킬(release-skill).
- electron-builder 업그레이드(v27의 서명된 매니페스트 등).
