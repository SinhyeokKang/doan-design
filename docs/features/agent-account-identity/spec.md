# agent-account-identity — spec

Codex와 Antigravity에 로그인한 뒤에도 Doan이 어느 계정인지 보이지 않는 문제를 고친다. 두 provider의 계정 이메일을 First run Agent step과 Settings > Agents의 계정 줄에 보인다. 조사 결과와 실측은 design §1에 있다.

## 사용자

- **사람(앱 사용자)**: Codex·Antigravity에 로그인한 뒤 어느 계정으로 연결됐는지 이메일로 확인한다. 다른 provider(Claude Code, Cursor, Copilot)는 이미 계정 줄을 보인다.
- **에이전트**: 바뀌는 것이 없다. CLI·socket 응답과 대화 실행 경로는 그대로다.

## 문제 (2026-11-01 관찰)

- Codex와 Antigravity는 연결된 뒤 계정 줄이 비어 있다. ARCHITECTURE §7 'Agent authentication'이 "Codex and Antigravity expose none (`id: null`)"라고 적고, `providers.ts`의 `codexStatus`·`antigravityStatus`가 `{ id: null, workspace: null }`만 돌려준다. PRODUCT §5 항목 0 Agent step은 "the account identifier below when one exists"라서, 지금은 보일 것이 없다.
- 사용자가 Codex 로그인 뒤 아무것도 보이지 않는 것을 보고 고치기를 원했다.
- Codex의 상태 확인(`codex login status`)은 "Logged in using ChatGPT"만 출력한다(0.164.0 바이너리 문자열로 확인). Antigravity ACP 서버 1.3.0은 `initialize`·`authenticate`·`session/new` 어디에도 계정을 담지 않는다(design §1).

## 완료 조건

1. Codex에 로그인하면 Agent step과 Settings > Agents의 Codex 계정 줄에 그 계정의 이메일이 보인다. 이메일은 Codex app-server `account/read`가 돌려준 값이다.
2. Antigravity에 로그인하면 같은 자리에 그 Google 계정의 이메일이 보인다. 이메일은 Google OIDC userinfo가 돌려준 값이다.
3. 이미 저장된 연결(이 변경 전에 로그인한 Codex·Antigravity)은 앱을 켤 때마다 첫 check가 성공한 뒤 이메일이 보인다. 재시작 뒤 연결은 `unverified`이고, 계정 줄을 보이는 두 화면은 열릴 때 그 provider를 자동으로 check한다: First run Agent step과 Settings > Agents가 같은 `AgentStepSession`(`app/src/renderer/agentStep.ts`)을 쓰고, 열릴 때 Copilot을 뺀 provider 중 readiness cause가 `unverified`·`tools_missing`·`tools_failed`인 것을 check한다(`AUTO_CHECK`). 그 밖에는 첫 Doan 대화 실행과 Retry가 check한다. 그래서 두 화면에서 이메일이 비는 것은 열고 나서 그 check가 끝나기 전까지다. 새 로그인은 커밋 때 이메일을 저장해 재시작 직후에도 보인다.
4. 계정 조회가 실패해도(네트워크, 시간 초과, 응답 모양 다름, Google 거절) 로그인·check·대화 실행은 조회가 없을 때와 같은 결과로 끝난다. 계정 줄만 비거나 이전 값을 유지한다(design §2 '실패').
5. 두 provider의 계정 ID는 그대로 `null`이다. 대화 재개 규칙(ARCHITECTURE §7 'Conversations on a Doan connection')은 바뀌지 않는다.
6. Antigravity 조회에 쓴 access token은 메모리에만 있고 파일·메타데이터·로그·창에 나가지 않는다. Doan은 Antigravity 자격증명 파일을 고치지 않는다.
7. 실제 앱에서 서명된 Codex·Antigravity 연결로 Retry를 눌러 이메일이 보이고, 그 뒤 Antigravity check와 새 대화가 여전히 성공한다(tasks R1, 키체인 대화상자 가능성 때문에 실행 전 승인 필요).

## 비목표

- **안정 계정 ID**: Codex `workspaceRouting.chatgptAccountId`(experimental)와 Google `sub`를 계정 ID로 쓰지 않는다. 재개 규칙과 `account_mismatch` 판단을 바꾸지 않는다(design §3 'ID를 쓰지 않는 이유'). Codex는 사용자 결정(2026-11-01), Antigravity `sub`는 이 feature의 설계 판단이다.
- **요금제·워크스페이스 표시**: Codex `planType`, Orca가 보이는 "Personal (Plus)" 같은 라벨은 보이지 않는다(사용자 결정 2026-11-01: 이메일만).
- **check 결과의 저장**: check가 알아낸 이메일을 메타데이터에 쓰지 않는다. 로그인 때만 저장된다. 이미 저장된 연결은 재시작 뒤 첫 check 전까지 이메일이 없다(완료 조건 3, design §3 '저장하지 않는 이유'). 코디네이터 결정(2026-11-01).
- **다른 provider**: Claude Code, Cursor, Copilot의 계정 읽기는 그대로다.
- **새 UI 문구·화면**: 계정 줄은 이미 있는 자리(`agentAuthView.ts`의 `detail`)를 쓴다. 초안 캔버스는 만들지 않는다.
- **Orca 코드·자격증명 사용**: Orca는 참고로만 인용한다(design §1).
