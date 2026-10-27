# agent-auth — 인증 PoC 진행 기록

실행일: 2026-10-27 KST. 상태: 진행 중. 실인증 완료 판정은 아직 없다.

## 이번 게이트

사용자는 토큰 발급에 가까운 작은 PoC를 요청했고, 로그인·보관·새 프로세스의 인증 유지·요청 1회·도안 로그아웃 격리로 줄이는 데 동의했다. 권한 허용/거절·Canvas 생성·동시 갱신·계정 교체·세션 재개는 구현 통합 검증에 남긴다. 유료 구독 없이 추가 후보를 확인한다.

## 실행 근거

실험 파일은 `.scratch/agent-oauth-poc/lifecycle/`에 있다. 제품 코드·패키지와 사용자 셸 설정은 변경하지 않았다. 임시 HOME에 설치한 Cursor는 제품 의존성이 아니다. 토큰 원문을 결과 파일에 저장하지 않는다.

| 후보 | 확인한 사실 | 남은 확인 |
|---|---|---|
| Claude Code | 설치본 2.1.310의 공식 `auth login --claudeai`, `auth status` 확인. 별도 프로필은 미인증으로 응답 | 브라우저 로그인부터 최소 게이트 전체 |
| Codex | 설치본 0.164.0. 태그 소스의 Keychain service는 `Codex Auth`, 계정 키는 canonical CODEX_HOME의 SHA-256 앞 16자리로 분리. `keyring` 강제 + 임시 HOME은 기본 Keychain 부재로 로그인 전에 실패. 실제 HOME + 별도 CODEX_HOME에서는 미인증 상태 확인 후 브라우저 로그인을 시작함 | 사용자 브라우저 인증 후 보관·요청·로그아웃. 기존 앱 기준 0.163.0의 업그레이드 승인은 아님 |
| Cursor | 공식 설치 스크립트를 임시 HOME에서 실행해 2026.10.22-27dcf5f 설치. 버전·로그인 도움말·미인증 status 확인. 배포 코드의 기본 macOS 저장소는 고정된 `cursor-user`와 `cursor-access-token`/`cursor-refresh-token` 항목 사용 | 기본 Keychain 방식은 도안 격리에 부적합. 공식 file 방식으로 격리 실험 가능하나 평문 파일이므로 도안 보안 보관 계약은 별도 확인 필요 |
| Antigravity | 공식 인증 문서는 로컬 표면 사이 공용 Keychain을 설명. SDK quickstart는 API 키 예시 | 독립 OAuth 저장소를 아직 확인하지 못함. 로그인·로그아웃 미실행 |
| Copilot | 공식 npm registry에서 CLI 1.0.104, SDK 1.0.27 확인. 공식 SDK는 명시적 OAuth 토큰 경로 제공 | 앱 등록 또는 격리된 공식 CLI 경로, 무료 계정 실행, 보관·로그아웃 검증 |

Codex 첫 실패 뒤 기본 CLI와 현재 Orca 프로필의 인증 파일 size/mtime/inode/mode 및 선택한 Keychain 항목 메타데이터가 전후 같았다. 토큰 내용은 읽지 않았다. 이 검사는 전체 머신 불변이나 외부 계정의 서버 인증 유효성을 증명하지 않는다. 실제 HOME을 쓰는 후속 실험도 같은 제한을 기록한다.

Cursor의 `CURSOR_CONFIG_DIR`은 설정 위치만 바꾸며 관측한 기본 Keychain 항목에 쓰이지 않는다. 공식 changelog가 제공하는 `AGENT_CLI_CREDENTIAL_STORE=file`은 HOME 아래 `.cursor/auth.json`을 사용한다. 평문 파일 모드를 암호화 보관으로 표시해서는 안 된다. 실제 Cursor 로그인은 아직 실행하지 않았다.

## 출처

- [Claude 인증·저장소](https://code.claude.com/docs/en/iam)
- [Codex 인증 저장소](https://learn.chatgpt.com/docs/auth), [0.164.0 저장소 소스](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/login/src/auth/storage.rs)
- [Cursor 공식 설치](https://cursor.com/docs/cli/installation), [공식 file 저장 모드](https://cursor.com/docs/cli/changelog), [무료 플랜](https://cursor.com/en-US/pricing)
- [Antigravity 인증](https://antigravity.google/docs/install), [플랜](https://www.antigravity.google/docs/plans), [SDK quickstart](https://antigravity.google/docs/sdk/overview)
- [Copilot CLI 설치](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli), [SDK 인증](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate), [무료 CLI 지원](https://github.com/features/copilot/cli)

로컬 근거: `context.json`, `claude-*.txt`, `codex-*.txt`, `codex-auth-storage.rs`, `cursor-install-result.txt`, `cursor-*.txt`, `cursor-credential-store-evidence.js`, `login_probe.py`, `codex-lifecycle.json`. 결과 파일은 이후 실제 로그인 결과로 갱신된다. 로그인 대기·미실행을 통과로 세지 않는다.
