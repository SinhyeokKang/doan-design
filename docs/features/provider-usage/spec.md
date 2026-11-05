# provider-usage — spec

사람의 요청: "프로바이더 토큰 사용 대시보드". 출발점은 docs/BACKLOG.md의 "Showing each connected agent account's remaining usage or rate limits" 항목이다. 연결한 agent 계정마다 남은 사용량(한도 창의 사용 비율과 다시 채워지는 시각)을 앱 셸에서 한눈에 보이고, 누르면 자세한 내용을 연다.

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다. 계정은 연결마다 하나이고(Out of scope 3), 서버·동기화가 없으며(5), agent 작업을 시작하지 않는다(4). 사용량 조회는 모델 요청이 아니라 계정 조회이고, 프로필에 세션을 남기지 않는다(완료 조건 4, design 'PoC 의존' 공통 기준).
- In scope 7 'Agent authentication'의 Doan 연결 위에서 일어난다. 터미널이나 Orca 로그인 계정의 사용량은 보이지 않는다.
- PRODUCT·ARCHITECTURE에는 사용량 표시에 대한 규칙이 없다. 아래에서 그 두 문서가 정하지 않은 것은 사람이 정한다(design '결정할 점').

## 사용자

- **사람(앱 사용자)**: 대화를 보내기 전이나 길게 일하는 중에 각 계정이 얼마나 남았는지, 언제 다시 채워지는지 본다. 한 계정이 막히기 전에 다른 provider로 옮길지 판단한다.
- **에이전트**: 바뀌지 않는다. CLI, guide, skill stub, `doan check`는 그대로다.

## 문제(관찰한 사실)

1. Doan 안에서는 연결한 계정의 남은 사용량을 볼 곳이 없다. 사람은 한도에 닿은 뒤에야 턴 실패(`rate_limited`, `app/src/main/conversation/transport.ts:37`)로 안다.
2. Doan 연결은 터미널 로그인과 따로 있으므로(PRODUCT §3 In scope 7), 사람이 터미널에서 `/usage`를 봐도 같은 계정이라는 보장이 없다.
3. provider마다 사용량을 내주는 경로가 다르고, 일부는 실험 API이거나 공식 경로가 없다(design '조사 결과'). 실제 응답은 아직 한 번도 확인하지 않았다(PoC).

## 완료 조건

용어: **한도 창**은 provider의 rate limit 창, **앱 창**은 Doan의 창이다(design 머리말).

1. **링.** 앱 셸에 연결한 provider마다 작은 진행 링이 하나씩 있고(순서는 provider 고정 순서), 연결이 둘 이상이면 링 가운데에 그 provider의 로고가 있고, 하나면 로고 없이 링만 있다. 링들은 한 버튼을 이루고, 모든 화면(workspace, Home, Settings, Add Projects)에 보인다. 연결이 하나도 없으면 버튼이 없다. 버튼을 클릭·Space·Return으로 누르면 자세한 내용(popover)이 열리고, Esc나 바깥 클릭으로 닫히면 포커스가 버튼으로 돌아간다. 버튼 이름은 "Agent usage"로 고정이고 값은 설명 글로 붙는다. 자리는 헤더 오른쪽 끝, `.shell-modes` 옆이다(design 결정할 점 10).
2. **링의 값.** 링은 그 계정에서 가장 많이 쓴 한도 창(예: Claude 5시간·7일, Codex primary·secondary)의 사용 비율을 보인다. 다시 채워지는 시각이 지난 한도 창은 링 값에서 뺀다. 처음 읽는 중이거나, 값을 읽지 못했거나, provider가 사용량을 내주지 않거나, 모두 무제한이거나, 연결을 지금 쓸 수 없으면(sign-in 만료 등) 링은 비어 있고 로고만 보이며, 그 이유는 자세한 내용에서 보인다.
3. **자세한 내용.** provider마다 한도 창 이름, 사용 비율, 다시 채워지는 시각(상대 시간), 마지막으로 읽은 시각을 보인다. provider가 한도에 닿았다고 말하면 "Limit reached · resets in …"을 글로 보인다(비율에서 추론하지 않는다). 다시 읽는 중에는 이전 값을 그대로 둔다. 처음 읽는 중, 무제한, 사용량을 내주지 않음, 사용량 한도가 없는 plan, 읽기 실패, 쓸 수 없는 연결은 각각 한 줄 문구로 보인다(design §4, 문구는 `/design-draft`에서 고정). 열려 있는 동안 상대 시간이 1분마다 고쳐지고, provider가 연결되거나 빠지면 그 행이 생기거나 사라진다. 자세한 내용의 오른쪽 위에는 설정 버튼(누르면 Settings > Agents)과 새로고침 버튼이 있다. 새로고침 버튼은 5분 간격과 관계없이 쓸 수 있는 연결을 모두 바로 다시 읽는다(design 결정할 점 11).
4. **읽는 때.** 사용량은 앱 시작과 sign-in 뒤, 그 provider의 Doan 연결 대화 턴이 끝난 뒤, 자세한 내용을 열 때 읽고, 같은 provider는 5분 안에 다시 읽지 않는다. 예외로, 자세한 내용을 열 때 다시 채워지는 시각이 지난 한도 창이 있거나 마지막 조회가 실패였으면 바로 읽는다. 앱 창이 보이지 않으면 읽지 않는다(design '결정할 점' 2·8). 쓸 수 없는 연결은 읽지 않는다. 조회는 모델 요청을 쓰지 않고 프로필에 세션·transcript를 남기지 않는다. 조회는 대화나 sign-out을 막지 않고, sign-out은 진행 중 조회를 멈춘다.
5. **연결 상태와 함께 움직임.** 연결하지 않았거나 sign-out한 provider의 링은 없다. sign-in·sign-out·계정 교체 뒤에는 그 provider의 이전 값을 버리고, 교체 전에 시작한 조회의 결과도 버린다.
6. **토큰 규칙.** Doan은 터미널·Orca의 자격 증명을 읽지 않는다(ARCHITECTURE §7 'Agent authentication': "never reads, copies or changes those external credentials"). Claude·Codex·Copilot·Antigravity는 provider CLI·SDK의 조회만 쓴다. Cursor만 Doan vault의 Cursor credential로 정해진 엔드포인트 하나에 읽기 전용 GET을 보내고, 토큰을 저장·로그·IPC·오류 글에 넣지 않으며 갱신하지 않는다(design '결정할 점' 3).
7. **기록하지 않음.** 사용량 값은 main 메모리에만 두고, 디스크(ui-state, 대화 history, 로그)에 쓰지 않는다.

## 비목표

- 토큰 수·비용(달러) 집계, 대화별 사용량, 사용량 기록과 그래프.
- 한도에 닿기 전 알림, 자동으로 다른 provider로 바꾸기.
- 터미널·Orca 계정, legacy external 대화가 쓰는 사람 자신의 CLI 프로필의 사용량.
- Cursor 밖의 provider에서 자격 증명을 직접 읽거나 provider 웹 API를 부르는 것(완료 조건 6).
- Doan이 `agy`를 내려받거나 설치하는 것.
- 추가 사용(extra usage, credits) 구매나 설정 화면으로 가는 링크.
