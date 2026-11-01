# agent-account-identity — spec

Codex와 Antigravity에 로그인한 뒤에도 Doan이 어느 계정인지 보이지 않는 문제를 고친다. 두 provider의 계정 이메일을 First run Agent step과 Settings > Agents의 계정 줄에 보인다. 범위는 PRODUCT §3 In scope 7(Agent authentication)과 §5 항목 0이다. 조사 결과와 실측은 design §1에 있다.

## 사용자

- **사람(앱 사용자)**: Codex·Antigravity에 로그인한 뒤 어느 계정으로 연결됐는지 이메일로 확인한다. 다른 provider(Claude Code, Cursor, Copilot)는 이미 계정 줄을 보인다.
- **에이전트**: 받는 것이 바뀌지 않는다. CLI·socket 응답에는 계정 이메일이 원래 없다(`app-socket.v2` 스키마). 다만 재시작 뒤 첫 Doan 대화는 시작 전 check에 계정 조회가 더해져 늦게 시작할 수 있다(완료 조건 5).

## 문제 (2026-11-01 관찰)

- Codex와 Antigravity는 연결된 뒤 계정 줄이 비어 있다. ARCHITECTURE §7 'Agent authentication'이 "Codex and Antigravity expose none (`id: null`)"라고 적고, `providers.ts`의 `codexStatus`·`antigravityStatus`가 `{ id: null, workspace: null }`만 돌려준다. PRODUCT §5 항목 0 Agent step은 "the account identifier below when one exists"라서, 지금은 보일 것이 없다.
- 사용자가 Codex 로그인 뒤 아무것도 보이지 않는 것을 보고 고치기를 원했다.
- Codex의 상태 확인(`codex login status`)은 "Logged in using ChatGPT"만 출력한다(0.164.0 바이너리 문자열로 확인). Antigravity ACP 서버 1.3.0은 `initialize`·`authenticate`·`session/new` 어디에도 계정을 담지 않는다(design §1).

## 범위와 결정

- Codex: 키체인 저장을 그대로 두고, Codex app-server `account/read`의 이메일을 보인다(사용자 결정 2026-11-01). `auth.json`을 금고에 두는 방식은 쓰지 않는다(design §3 'Codex 저장 방식').
- Antigravity: Doan이 금고에 저장된 Google refresh token과 클라이언트로 직접 access token을 받고 Google userinfo를 불러 이메일을 얻는다. ARCHITECTURE §7 경계("ships no OAuth client of its own", 금고는 자격증명 파일을 바이트로만 다룸)에 Antigravity 예외를 하나 더한다(사용자 승인 2026-11-01, design §3).

## 완료 조건

1. Codex에 로그인하면 Agent step과 Settings > Agents의 Codex 계정 줄에 그 계정의 이메일이 보인다. 이메일은 Codex app-server `account/read`가 돌려준 값이다. 실제 앱에서 새 로그인은 확인하지 않고(R1은 로그인하지 않는다) `manager.test.ts`로 확인한다.
2. Antigravity에 로그인하면 같은 자리에 그 Google 계정의 이메일이 보인다. 이메일은 Google OIDC userinfo가 돌려준 값이다. 확인 범위는 1과 같다.
3. 이 변경 전에 로그인한 연결은 앱을 다시 켠 뒤 Settings > Agents를 열면, 자동 check가 끝나고 조회가 성공한 뒤 이메일이 보인다. 조회가 실패하면 그 앱 세션 동안 계정 줄이 비어 있다. 새 로그인은 커밋 때 이메일을 저장해, 재시작 직후 Settings > Agents에도 보인다(First run Agent step은 check 전 unverified 행에 "Connected · not checked"를 보여 이메일을 가린다. 원래 동작이다).
4. 계정 조회가 실패해도(네트워크, 시간 초과, 응답 모양 다름, Google 거절) 로그인·check·대화 실행은 조회가 없을 때와 같은 결과로 끝난다. 실패는 화면에 알리지 않는다(design §2 '실패').
5. 조회는 provider마다 5초 안에 끝나거나 멈춘다. 그래서 로그인 마무리, 화면의 check, 재시작 뒤 첫 Doan 대화의 시작이 최대 5초 늦어질 수 있다. 실제 시간은 R1에서 잰다.
6. 두 provider의 계정 ID는 그대로 `null`이다. 대화 재개 규칙(ARCHITECTURE §7 'Conversations on a Doan connection')은 바뀌지 않는다.
7. Antigravity 조회에 쓴 access token은 메모리에만 있고 파일·메타데이터·로그·창에 나가지 않는다. Doan은 Antigravity 자격증명 파일을 고치지 않는다.
8. 실제 앱(R1)에서 서명된 Codex·Antigravity 연결로: 재시작 뒤 Settings > Agents를 열면 자동 check 뒤 두 이메일이 보이고, 앱을 한 번 더 재시작해도 Antigravity 자동 check가 다시 성공하며, 두 provider의 새 대화 한 턴이 끝난다. 키체인 대화상자 가능성이 있어 실행 전 코디네이터 승인이 필요하다.

## 비목표

- **안정 계정 ID**: Codex `workspaceRouting.chatgptAccountId`(experimental)와 Google `sub`를 계정 ID로 쓰지 않는다. 재개 규칙과 `account_mismatch` 판단을 바꾸지 않는다(design §3 'ID를 쓰지 않는 이유'). Codex는 사용자 결정, Antigravity `sub`는 설계 판단을 코디네이터가 수락했다(둘 다 2026-11-01).
- **요금제·워크스페이스 표시**: Codex `planType`, Orca가 보이는 "Personal (Plus)" 같은 라벨은 보이지 않는다(사용자 결정 2026-11-01: 이메일만).
- **check 결과의 저장**: check가 알아낸 이메일을 메타데이터에 쓰지 않는다. 로그인 때만 저장된다(완료 조건 3, design §3 '저장하지 않는 이유'). 코디네이터 결정(2026-11-01).
- **조회 실패의 표시와 재시도**: 실패를 알리거나 따로 다시 시도하는 버튼을 두지 않는다. 표시용 정보라서다.
- **다른 provider**: Claude Code, Cursor, Copilot의 계정 읽기는 그대로다.
- **새 UI 문구·화면**: 계정 줄은 이미 있는 자리(`agentAuthView.ts`의 `detail`)를 쓴다. 초안 캔버스는 만들지 않는다.
- **Orca 코드·자격증명 사용**: Orca는 참고로만 인용한다(design §1).
