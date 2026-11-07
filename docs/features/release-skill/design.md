# release-skill — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 '사용자 결정' 2, D1(hotfix 모드, 두 번 호출, 마지막 정식 태그에서), D7(태그 push로 워크플로 시작, draft → 검사 → 승인 → 게시), D12(rc 검증), D13(올림 커밋, rc 식별자, 노트 기준), D22(절차는 스킬에), D25(G3c의 `main` 보호).

## 영향 범위

- 새 `.agents/skills/release/SKILL.md`(영어, AGENTS.md 언어 정책), 링크 `.claude/skills/release`.
- AGENTS.md 'Workflow'(스킬 목록), 'Commit conventions'(병합 예외, `/ship` hotfix 예외), 'Commands'(`gh` 명령), 'Documents' 표. `.agents/skills/ship/SKILL.md`(hotfix 예외). `docs/CONTRIBUTING.md` Branches 절.
- 앱·CLI·형식·`doan check`: 영향 없음. 로직은 release-ci의 스크립트에 있고 스킬 문서에는 두지 않는다.
- 부르는 이름은 모두 release-ci design '/release와의 계약'에 있다. T0에서 그 이름이 실제로 있는지 확인한다.

## 출시 모드

`/release <version>` — `<version>`은 `x.y.z` 또는 `x.y.z-rc.N`(D13). `develop` 체크아웃에서 부른다.

0. **호출 확인**: 사용자가 이 대화에서 `/release`를 직접 불렀을 때만 진행한다. 다른 스킬·체인·worker가 부르면 멈춘다.
1. **사전 확인**(하나라도 실패하면 멈추고 보고):
   - 작업 트리가 깨끗하고 `origin/develop`과 같다. 진행 중인 `/orchestrate`·체인(`docs/features/chain-*`)이 없다.
   - `git rev-list --count origin/develop..origin/main`이 0이다(`main`에 직접 들어간 커밋이 없다).
   - `develop` HEAD의 CI 게이트 `gate`가 통과했다.
   - 버전 검사 스크립트(release-ci 계약)가 `<version>`을 받아들인다.
   - '재개와 중단' 표의 상태 중 하나에 해당하면 그 행의 행동으로 간다.
   - `docs/features/`에 완료됐는데 지우지 않은 feature 디렉터리가 없는지 보고만 한다(막지 않는다).
2. **버전 올림**(D13): `app/package.json` `version`이 `<version>`과 다르면 `npm --prefix app version <version> --no-git-tag-version`(lock 포함)으로 바꾸고 `develop`에 `chore(release): <version>` 커밋을 push한다. 0.1.0 출시는 R1(rc.1, rc.2) 뒤라 올림 커밋이 생긴다.
3. **릴리스 노트 초안**: 정식 버전이면 마지막 정식 태그 이후, rc면 마지막 태그 이후(없으면 처음부터) `develop`에 병합된 PR 제목을 Conventional Commit 타입별로 묶는다. PR 없이 `develop`에 들어간 커밋(D3)은 빠진다는 점을 함께 보인다. 사용자에게 보여 주고 고친 것을 받는다(승인 지점 1).
4. **`develop` → `main`**: `develop`에서 `main`으로 PR을 열고(`Release <version>`), 게이트가 통과하면 `gh pr merge --merge`로 병합 커밋을 만든다. 사용자가 `/release`를 부른 것이 이 병합의 허락이다(AGENTS.md 'Commit conventions'의 예외). G3c의 보호(PR 필수, 승인 0, 필수 검사)와 맞는다.
5. **태그**: `git fetch` 뒤 `main`의 그 병합 커밋에 `git tag -a v<version> -m "Doan <version>"`을 만들어 push한다. 이 push가 릴리스 워크플로를 시작한다(D7). 환경 `release`의 승인을 사용자에게 요청한다(승인 지점 2, GitHub 화면). `gh run list --workflow release.yml --branch v<version>`으로 실행을 찾아 끝날 때까지 기다린다. 공증 대기 30분을 넘기면 실행 id를 보고하고 멈춘다.
6. **확인**: draft Release의 자산(dmg, zip, zip.blockmap, `latest-mac.yml`)을 받아 서명 검증 스크립트(release-ci 계약)로 dmg와 zip을 다시 검사하고, 태그 `v<version>`이 `main`의 병합 커밋을 가리키는지, rc면 draft가 prerelease인지 본다. draft를 태그로 찾지 못하면 `gh release list`의 release id로 찾는다.
7. **게시**(D7): 검사 결과와 노트를 보여 주고 사용자의 게시 승인을 받은 뒤(승인 지점 3) `gh release edit v<version> --notes-file <노트> --draft=false`로 게시한다(rc는 prerelease 표시가 그대로다).
8. **보고**(한국어): 버전, 태그와 커밋, PR, 워크플로 실행, 자산과 검사 결과, 게시 URL, 하지 못한 것.

## hotfix 모드 (D1)

사용자가 두 번 부른다. 한 번의 호출 안에서 `/ship`을 부르지 않는다(세션이 끊기면 상태를 잇지 못한다).

1. **`/release hotfix <slug>`**: 0단계 호출 확인. 마지막 정식(rc가 아닌) 태그를 찾고, 그 태그에서 `hotfix/<slug>`를 만들어 push하고 멈춘다. 보고에 "이 브랜치에서 `/ship`으로 고친 뒤 `/release <version>`을 부른다"를 적는다. rc가 `main`에 나가 있어도 정식 태그에서 나오므로 rc 내용은 섞이지 않는다.
2. **사용자가 그 브랜치에서 `/ship`으로 고친다.** `/ship`은 `hotfix/<slug>`이면 그대로 쓰고 `--base main`으로 PR을 연다(AGENTS.md의 예외). 회귀 수정이면 `/postmortem`도 한다.
3. **`hotfix/<slug>` 체크아웃에서 `/release <version>`**: `<version>`은 그 정식 태그의 다음 패치다.
   - 사전 확인은 출시 모드 1단계와 같되 기준이 `develop`이 아니라 그 브랜치다.
   - 그 브랜치에 올림 커밋(`npm --prefix app version`).
   - 노트는 그 브랜치의 PR 제목.
   - `/ship`이 연 `hotfix/<slug>` → `main` PR을 병합하고, 출시 모드 5–7단계(태그, 워크플로, 확인, 승인 뒤 게시).
   - **되돌림**: `hotfix/<slug>` → `develop` PR을 열고 게이트가 통과하면 병합한다. `app/package.json`·`package-lock.json`의 버전 충돌은 높은 버전을 남긴다. 그 밖의 충돌이 나면 멈추고 충돌 파일을 보고한다.
   - 보고: 출시 모드 8단계 + 되돌림 PR.

## 재개와 중단

같은 `<version>`으로 다시 부르면 1단계가 상태를 감지해 해당 행으로 간다. 태그는 옮기거나 지우지 않는다.

| 상태 | 감지 | 행동 |
|---|---|---|
| 올림 커밋만 `develop`에 있다 | `app/package.json`이 `<version>`, 열린 Release PR 없음 | 3단계부터 |
| Release PR이 열렸고 게이트 실패 | `gh pr list --base main --head develop` | 멈추고 보고. `develop`에서 고친 뒤 다시 부르면 4단계부터 |
| 병합됐고 태그 없음 | `main`에 병합 커밋, `git ls-remote --tags origin v<version>` 없음 | 5단계부터 |
| 태그 있고 워크플로 실패·시간 초과 | `gh run list --workflow release.yml --branch v<version>` | `gh run rerun`(release-ci 계약). draft가 남았으면 먼저 지운다 |
| draft 있고 검사 실패 | draft 존재, 6단계 실패 | 게시하지 않는다. draft를 지우고(`gh release delete`, 태그는 남김) 원인을 보고한다. 고칠 것이 코드면 다음 rc나 다음 패치로 간다 |
| 게시됨 | 게시본 존재 | 멈추고 보고(덮어쓰지 않는다) |

## One-time setup (사람)

release-ci T7이 이 절을 채운다: 비밀·변수 이름 목록(`MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, 변수 `MAC_IDENTITY_NAME`), 인증서 `.p12`를 내보내 base64로 넣는 법, App Store Connect API Team 키를 만들고 넣는 법, 환경 `release`(필수 검토자, 배포 ref `v*` 태그·`develop`), 갱신 절차. 지금 `/tester-build`의 관찰(G2 중간 인증서, Xcode 라이선스, Team 키 Request Access) 가운데 로컬 keychain에만 해당하는 것은 빼고 옮긴다. 스킬 T1이 이 절을 SKILL.md로 옮긴다.

## 금지

- 사용자가 직접 부르지 않은 실행, `main`에 직접 push, 태그 강제 이동·삭제, 이미 게시된 Release 덮어쓰기.
- 비밀을 읽거나 출력하는 것(`/tester-build` 'Prohibited'와 같다).
- 검사가 실패한 draft 게시.

## 참고

- Orca의 `release-cut.yml`은 종류(rc/patch/minor/major)를 받아 버전을 계산하고, 최신 게시본보다 낮은 버전을 거부한다(https://github.com/stablyai/orca/blob/main/.github/workflows/release-cut.yml). 버전 계산은 가져오지 않고(사용자가 버전을 준다) 낮은 버전 거부만 가져온다.
