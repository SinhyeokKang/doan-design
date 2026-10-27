# agent-auth — 인증 PoC 결과

실행일: 2026-10-27 KST. 다섯 프로바이더의 최소 인증 PoC 완료. 사용자는 다섯 개 모두 제공하기로 확정했다. 암호화 보관과 제품 실행 통합은 미완료이며 [구현 작업](./tasks.md)에서 검증한다.

## 게이트와 판정

사용자 승인으로 구현 전 게이트를 로그인·보관·새 프로세스의 인증 유지·요청 1회·로컬 로그아웃 격리로 한정했다. 암호화는 별도로 구현한다. 실제 만료·갱신 경쟁·계정 교체·권한 허용/거절·Canvas 생성·중단·세션 재개는 제품 통합 검증에 남긴다. Cursor·Antigravity·Copilot은 유료 구독 없이 확인했다.

| 프로바이더 | 확인한 최소 인증 경로 | 구현에 남은 조건 |
|---|---|---|
| Claude Code | 2.1.310. 별도 `CLAUDE_CONFIG_DIR`·실제 HOME에서 공식 브라우저 로그인, 전용 Keychain 저장, 새 프로세스 인증·요청, 공식 로그아웃 뒤 전용 항목 삭제. 평문 credential 파일 없음 | 실제 갱신·경쟁·실행 통합 |
| Codex | 0.164.0. 실제 HOME + 별도 `CODEX_HOME` + keyring 강제로 같은 경로 통과. 평문 `auth.json` 없음. Keychain 키는 canonical CODEX_HOME 해시로 구분 | 기존 앱 0.163.0과 버전 차이. 업그레이드 회귀·실행 통합 |
| Cursor | 2026.10.22-27dcf5f. 임시 HOME + 공식 `AGENT_CLI_CREDENTIAL_STORE=file`에서 로그인, mode 0600 파일 보관, 새 프로세스 요청, 공식 로그아웃 뒤 파일 삭제 | 기본 macOS Keychain은 고정 항목이라 격리에 부적합. 파일 암호화 수명·ACP 실행 통합 |
| Antigravity | 1.4.8. 별도 HOME에서 SSH 환경변수로 원격 환경을 모사해 공식 Google 로그인·file 저장을 사용. mode 0600 토큰 파일, 새 `agy models`와 text-only 요청 성공. 대화형 `/logout` 뒤 파일 삭제 | native macOS Keychain namespace는 미검증. 제품용 전용 저장 경로·암호화·권한·중단·재개 API 연결 |
| GitHub Copilot | 1.0.104. 별도 HOME·공식 device login, Keychain 접근을 막은 실험에서 사용자 동의 후 mode 0600 JSONC 파일 보관. 새 프로세스의 도구 없는 요청 성공. 소유 프로세스 종료·전용 인증 파일 삭제 뒤 새 요청이 미인증으로 거부됨 | 기본 `/logout`은 이 실험에서 실패. 도안 소유 로컬 연결 해제·암호화·경고 없는 제품용 인증 연결·SDK 실행 통합 |

다섯 플랫폼 모두 별도 프로세스 요청이 exit 0으로 `DOAN_AUTH_POC_OK`를 반환했다. Copilot의 파일 삭제 뒤 같은 요청은 exit 1과 `No authentication information found`를 반환했다. 이 확인 과정에서 인증 없는 설정 파일이 다시 생성됐다. 파일 존재 자체를 로그인 상태로 판단하면 안 된다.

## 저장과 로그아웃의 제한

Claude·Codex는 전용 Keychain 항목의 생성·삭제와 평문 파일 부재를 확인했다. Cursor·Antigravity·Copilot의 mode 0600 파일은 **평문**이며 암호화 통과 근거가 아니다. 사용자는 암호화를 구현 단계로 넘겼다. main의 암호화 보관, 공급자용 작업 파일의 생성·갱신 반영·삭제·실패 복구는 B1에서 검증한다.

Antigravity의 SSH 환경 모사와 Copilot의 macOS sandbox Keychain 접근 차단은 저장 경로를 확인하기 위한 실험이다. 제품 아키텍처로 그대로 채택하지 않는다. Antigravity의 native Keychain 분리나 Copilot의 경고 없는 앱 로그인까지 확인했다고 주장하지 않는다.

Copilot의 대화형 `/logout` 뒤에는 토큰이 남고 `/user show`도 로그인 상태였다. 원인은 확정하지 않았다. 이후 실험 소유 프로세스를 종료하고 전용 `config.json`만 삭제했으며 새 요청의 미인증 실패로 로컬 연결 해제를 확인했다. 제품도 소유 실행 종료·전용 인증 삭제·미인증 확인을 구현한다. 기본 logout 성공이나 원격 토큰 폐기로 표시하지 않는다. 별도 GitHub OAuth App을 등록한 실험이 아니라 공식 Copilot CLI 로그인이다.

기존 Claude·Codex 기본/Orca 프로필의 credential 파일·선택한 Keychain 항목, Cursor 기본 파일·고정 Keychain 항목, Antigravity `gemini:antigravity` 항목, Copilot 기본 설정·`copilot-cli`·`gh:github.com` 항목의 메타데이터가 각 실험 전후 같았다. Copilot은 소유 파일 삭제 뒤에도 다시 대조했다. 외부 토큰 원문을 읽거나 복사하지 않았으며 외부 계정의 서버 인증 유효성을 요청으로 확인하지 않았다. 전체 머신 상태 불변을 증명하는 검사는 아니다.

임시 연결은 모두 로컬에서 해제했다. 브라우저 로그인 세션과 원격 OAuth 승인을 폐기했다는 뜻은 아니다.

## 실패한 시도와 재현 경계

- Codex는 임시 HOME에서 기본 Keychain을 찾지 못해 로그인 전에 실패했다. 실제 HOME과 별도 CODEX_HOME으로 다시 실행해 통과했다.
- Antigravity의 첫 비대화형 로그인은 인증 코드 입력을 받을 수 없어 실패했다. 이후 대화형 PTY에서 로그인하고 별도 프로세스로 요청·인증 유지를 확인했다. print 모드의 `/logout`도 지원되지 않아 대화형 명령을 사용했다.
- Copilot 첫 시도는 stdin이 터미널에 연결되지 않아 file fallback 동의를 받을 수 없었다. PTY stdin 연결 뒤 공식 로그인을 다시 수행했다. macOS의 Keychain 초기화 경고는 취소했고 기본 Keychain을 재설정하지 않았다. 제품에서 이 경고를 정상 로그인 절차로 사용하지 않는다.
- Copilot 첫 요청의 잘못된 도구 제한 인자는 모델 호출 전에 거부됐다. 올바른 빈 `--available-tools` 목록으로 도구 없는 요청을 다시 실행했다.

## 근거 위치와 출처

실험 근거는 gitignored `.scratch/agent-oauth-poc/lifecycle/`에 있다. `claude-lifecycle.json`, `codex-lifecycle.json`, `cursor-lifecycle.json`, `antigravity-authenticated.json`, `copilot-authenticated.json`을 대조했다. `antigravity-lifecycle.json`은 초기 실패이며 후속 성공을 대신하지 않는다. Copilot 결과의 `afterLogout`은 기본 logout 직후, `hostLogout`은 도안 소유 파일 삭제 뒤 결과이다. `login_probe.py`·`cursor_probe.py`는 해당 자동 실험, Antigravity 성공과 Copilot은 대화형 도구 및 후속 프로세스 실행 근거이다. 토큰·인증 코드·인증 URL 원문을 이 문서에 보관하지 않는다.

제품 코드·의존성과 사용자 셸 설정은 변경하지 않았다. 임시 경로에 설치한 추가 CLI는 제품 의존성이 아니다. SDK 버전 Copilot 1.0.27은 registry 확인만 했으며 SDK 통합 성공으로 세지 않는다.

- [Claude 인증·저장소](https://code.claude.com/docs/en/iam)
- [Codex 인증](https://learn.chatgpt.com/docs/auth), [0.164.0 저장소 소스](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/login/src/auth/storage.rs)
- [Cursor 설치](https://cursor.com/docs/cli/installation), [공식 file 모드](https://cursor.com/docs/cli/changelog)
- [Antigravity 설치·인증](https://antigravity.google/docs/install), [별도 HOME 안내 #1080](https://github.com/google-antigravity/antigravity-cli/issues/1080), [Windows Keychain 경계 #1261](https://github.com/google-antigravity/antigravity-cli/issues/1261). Windows 결과를 macOS 사실로 일반화하지 않는다.
- [Copilot CLI 인증·저장·로컬 로그아웃](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli), [SDK 명시적 인증](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
