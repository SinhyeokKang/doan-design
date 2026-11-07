# readme-features — tasks

하네스·문서 변경이라 대화 중에 지금 브랜치(git-flow 뒤에는 `develop`)에 커밋한다.

- [ ] T0. 부모 P1에서 D16이 닫혔고 git-flow가 끝났는지 확인한다.
  - 검증: 부모 tasks.md의 C1이 체크돼 있다.
- [ ] T1. Features 표의 각 항목을 PRODUCT의 근거 절과 대조해 문구를 쓴다(README 본문, 이미지 자리는 비워 둔다).
  - 검증: 리뷰어(사용자)가 표의 근거 절과 문장을 대조한다. 자동 검증 명령 없음.
- [ ] T2. (D16) 데모 저장소와 격리 환경으로 스크린샷을 찍어 `docs/assets/readme/`에 넣는다. DIRECTORY.md에 한 줄을 더한다.
  - 검증: 이미지마다 사람이 개인 정보가 없는지 확인한다. `du -sh docs/assets/readme`가 D16에서 정한 상한 이하.
- [ ] T3. 나머지 절(Install, CLI, Build, Documents, Contributing, Background 축약, References, License)을 쓰고 상태 줄을 "pre-release"로 바꾼다.
  - 검증: `grep -n 'docs/features' README.md` 결과 없음. README의 상대 링크가 가리키는 파일이 모두 있다(`grep -o '](\./[^)]*)' README.md`의 경로를 `ls`로 확인).

── commit: `docs(readme): describe Doan by feature` / `docs(readme): add feature screenshots` ──

- [ ] T4. 부모 tasks.md의 C4를 체크하고 이 디렉터리를 지운다. 다운로드 링크는 부모 R2가 채운다.
  - 검증: `ls docs/features/readme-features` 결과 없음.

── commit: `docs(feature): remove readme-features` ──
