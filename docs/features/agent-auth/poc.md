# agent-auth — 인증 PoC 진행 기록

실행일: 2026-10-27 KST. 상태: Claude Code·Codex·Cursor의 최소 인증 동작 확인. Cursor 암호화 보관, Antigravity·Copilot의 독립 인증 경로는 미확정.

## 이번 게이트

사용자는 토큰 발급에 가까운 작은 PoC를 요청했고, 로그인·보관·새 프로세스의 인증 유지·요청 1회·도안 로그아웃 격리로 줄이는 데 동의했다. 권한 허용/거절·Canvas 생성·동시 갱신·계정 교체·세션 재개는 구현 통합 검증에 남긴다. 유료 구독 없이 추가 후보를 확인한다.

## 실행 근거

실험 파일은 `.scratch/agent-oauth-poc/lifecycle/`에 있다. 제품 코드·패키지와 사용자 셸 설정은 변경하지 않았다. 임시 HOME에 설치한 Cursor는 제품 의존성이 아니다. 토큰 원문을 결과 파일에 저장하지 않는다.

| 후보 | 확인한 사실 | 남은 확인 |
|---|---|---|
| Claude Code | 2.1.310. 별도 CLAUDE_CONFIG_DIR로 브라우저 로그인, 전용 Keychain 저장, 새 프로세스 인증, 요청 1회, 로그아웃 통과. 평문 credential 파일 없음 | 실제 만료·갱신 경쟁·계정 교체·Canvas 실행 통합 |
| Codex | 0.164.0. 실제 HOME + 별도 CODEX_HOME + keyring 강제로 같은 최소 게이트 통과. 평문 auth.json 없음. Keychain 키는 canonical CODEX_HOME의 해시로 구분 | 기존 앱 기준 0.163.0과 버전 차이. 업그레이드 실행 회귀와 전체 통합 |
| Cursor | 2026.10.22-27dcf5f. 임시 HOME + 공식 file 모드에서 무료 계정 로그인·mode 0600 파일 보관·새 프로세스 인증·요청 1회·로그아웃 후 파일 삭제 통과 | 암호화 보관 계약은 미검증. 기본 macOS Keychain은 고정된 이름이라 도안 격리에 부적합 |
| Antigravity | 공식 문서는 로컬 표면의 공용 Keychain을 설명. macOS 1.2.7에 대해 관리자는 별도 HOME을 안내했으나 Keychain namespace까지 설명하지 않음. Windows 1.3.6의 공유 항목은 별도로 확인됨 | macOS의 독립 OAuth 저장소 미확인. Windows 결과를 macOS 사실로 일반화하지 않음. 로그인·로그아웃 미실행 |
| Copilot | 임시 경로에 CLI 1.0.104 설치 후 버전·login 도움말·환경변수 문서 확인. SDK 최신 버전 1.0.27은 registry 확인만 수행. 공식 SDK는 명시적 OAuth 토큰 경로 제공 | CLI 저장소의 도안 namespace 미확인. 도안 전용 OAuth App 등록·발급 경로가 대안이며 아직 실험하지 않음. 무료 계정 요청 미실행 |


Codex 첫 실패 뒤 기본 CLI와 현재 Orca 프로필의 인증 파일 size/mtime/inode/mode 및 선택한 Keychain 항목 메타데이터가 전후 같았다. 토큰 내용은 읽지 않았다. 이 검사는 전체 머신 불변이나 외부 계정의 서버 인증 유효성을 증명하지 않는다. 실제 HOME을 쓰는 후속 실험도 같은 제한을 기록한다.

Cursor의 `CURSOR_CONFIG_DIR`은 설정 위치만 바꾸며 관측한 기본 Keychain 항목에 쓰이지 않는다. 공식 changelog가 제공하는 `AGENT_CLI_CREDENTIAL_STORE=file`은 HOME 아래 `.cursor/auth.json`을 사용한다. 평문 파일 모드를 암호화 보관으로 표시해서는 안 된다. 공식 file 모드에서 실제 Cursor 로그인과 요청을 확인했지만 이를 제품의 암호화 보관 통과로 세지 않는다.

## 출처

- [Claude 인증·저장소](https://code.claude.com/docs/en/iam)
- [Codex 인증 저장소](https://learn.chatgpt.com/docs/auth), [0.164.0 저장소 소스](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/login/src/auth/storage.rs)
- [Cursor 공식 설치](https://cursor.com/docs/cli/installation), [공식 file 저장 모드](https://cursor.com/docs/cli/changelog), [무료 플랜](https://cursor.com/en-US/pricing)
- [Antigravity 인증](https://antigravity.google/docs/install), [플랜](https://www.antigravity.google/docs/plans), [SDK quickstart](https://antigravity.google/docs/sdk/overview)
- [Copilot CLI 설치](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli), [SDK 인증](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate), [무료 CLI 지원](https://github.com/features/copilot/cli)

로컬 근거: `context.json`, `claude-*.txt`, `codex-*.txt`, `codex-auth-storage.rs`, `cursor-install-result.txt`, `cursor-*.txt`, `cursor-credential-store-evidence.js`, `login_probe.py`, `codex-lifecycle.json`. 세 결과 파일의 로그인·요청·로그아웃 exit 0과 응답 marker, 외부 메타데이터 일치를 대조했다. 로그인 대기·미실행을 통과로 세지 않는다.

## 최소 게이트 결과와 남은 경계

- 세 플랫폼 모두 공식 브라우저 로그인 뒤 별도 프로세스로 인증을 다시 읽었고, 파일·도구를 사용하지 않는 짧은 요청에 `DOAN_AUTH_POC_OK`를 받았다. 세 요청 모두 exit 0이었다.
- Claude·Codex는 로그인 후 전용 Keychain 항목 존재와 평문 파일 부재, 로그아웃 후 항목 부재를 확인했다. Cursor는 소유자 전용 mode 0600 파일이 생겼고 로그아웃 뒤 삭제됐다.
- Claude·Codex의 기본 CLI·현재 Orca 프로필, Cursor의 기본 파일·고정 Keychain 항목에 대해 메타데이터가 전후 같았다. 외부 토큰 원문은 비교하지 않았으며 서버에서 외부 토큰이 여전히 유효한지 별도 요청하지 않았다.
- 임시 인증은 모두 로그아웃됐다. 브라우저의 웹 로그인 세션이나 원격 OAuth 승인을 폐기했다고 주장하지 않는다.
- Cursor를 제품에 넣을 때 도안 보안 저장소와 공급자 file 저장소 사이의 수명·갱신·실패 복구를 설계해야 한다. 이번 PoC는 그 암호화 계층을 구현하거나 검증하지 않았다.
- 추가 두 후보를 불가능으로 확정하지 않는다. Antigravity는 공식 독립 저장 경로, Copilot은 격리된 CLI 또는 도안 OAuth App 등록 경로를 확인한 뒤 재개한다. 현재 P5 지원 집합·저장 계약 고정은 미완료이다.

추가 출처: [Antigravity macOS 안내 #1080](https://github.com/google-antigravity/antigravity-cli/issues/1080), [Windows Keychain 경계 #1261](https://github.com/google-antigravity/antigravity-cli/issues/1261), [Copilot 인증 우선순위·저장·로컬 로그아웃](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli).
